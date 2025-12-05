import { ContainerManager } from "./container-manager";
import { MessageHandler } from "./message-handler";
import { WSManagerNew } from "./websocket/ws-manager-new";
import { TabBroadcaster } from "./websocket/tab-broadcaster";
import { DeepSeekController } from "./deepseek-controller";
import { TabStateManager } from "./utils/tab-state-manager";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

  browserAPI.storage.local.remove([
    "wsStates",
    "wsMessages",
    "wsOutgoingMessage",
    "wsIncomingRequest",
  ]);

  // 🔥 CRITICAL: Cleanup legacy storage data from old versions
  (async () => {
    try {
      const allData = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get(null, (data: any) => {
          resolve(data || {});
        });
      });

      const keysToRemove: string[] = [];

      // Check for legacy API Provider URLs (containing old domains)
      if (allData.apiProvider) {
        const legacyDomains = [
          "zenend-e2z6.onrender.com",
          "localhost:3030",
          "127.0.0.1:3030",
        ];

        const currentProvider = String(allData.apiProvider || "").toLowerCase();
        const isLegacy = legacyDomains.some((domain) =>
          currentProvider.includes(domain.toLowerCase())
        );

        if (isLegacy) {
          keysToRemove.push("apiProvider");
        }
      }

      // Remove legacy connection states
      const legacyKeys = [
        "wsConnection",
        "wsConnectionId",
        "wsPort",
        "wsUrl",
        "lastConnected",
      ];

      for (const key of legacyKeys) {
        if (allData[key] !== undefined) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await new Promise<void>((resolve) => {
          browserAPI.storage.local.remove(keysToRemove, () => {
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`[ServiceWorker] ❌ Legacy cleanup failed:`, error);
    }
  })();

  const wsManager = new WSManagerNew();
  new TabBroadcaster(wsManager);

  const tabStateManager = TabStateManager.getInstance();

  const containerManager = new ContainerManager(browserAPI);
  const messageHandler = new MessageHandler(containerManager);

  // Setup event listeners
  if (browserAPI.contextualIdentities) {
    browserAPI.contextualIdentities.onCreated.addListener(() => {
      containerManager.initializeContainers();
    });

    browserAPI.contextualIdentities.onRemoved.addListener(() => {
      containerManager.initializeContainers();
    });
  }

  browserAPI.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== "local") return;

    // Process incoming WebSocket messages
    if (changes.wsMessages) {
      const messages = changes.wsMessages.newValue || {};
      if (Object.keys(messages).length === 0) {
        return;
      }

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;

        const recentMsgs = msgs.filter((msg) => {
          const age = Date.now() - msg.timestamp;
          return age < 180000; // 180 seconds (3 minutes)
        });

        if (recentMsgs.length === 0) {
          continue;
        }

        // Get latest message
        const latestMsg = recentMsgs[recentMsgs.length - 1];

        if (latestMsg.data.type === "sendPrompt") {
          const {
            tabId,
            systemPrompt,
            userPrompt,
            requestId,
            isNewTask,
            folderPath,
          } = latestMsg.data;

          if (!tabId || !userPrompt || !requestId) {
            console.error(
              `[ServiceWorker] ❌ Invalid sendPrompt message - missing required fields`
            );
            console.error(`[ServiceWorker] 📊 Message data:`, {
              tabId,
              hasSystemPrompt: !!systemPrompt,
              hasUserPrompt: !!userPrompt,
              requestId,
              isNewTask,
              hasFolderPath: !!folderPath,
            });
            continue;
          }

          const requestKey = `processed_${requestId}`;

          console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(
            `[ServiceWorker] 📥 RECEIVED SENDPROMPT MESSAGE from Backend`
          );
          console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`[ServiceWorker] 📌 Message Data:`);
          console.log(`[ServiceWorker]   - requestId: ${requestId}`);
          console.log(`[ServiceWorker]   - tabId: ${tabId}`);
          console.log(
            `[ServiceWorker]   - hasSystemPrompt: ${!!systemPrompt} (${
              systemPrompt ? systemPrompt.length : 0
            } chars)`
          );
          console.log(
            `[ServiceWorker]   - userPrompt length: ${
              userPrompt ? userPrompt.length : 0
            } chars`
          );
          console.log(
            `[ServiceWorker]   - isNewTask: ${isNewTask} (${typeof isNewTask})`
          );
          console.log(
            `[ServiceWorker]   - folderPath: ${folderPath || "null"}`
          );
          console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

          // Wrap in async IIFE to use await
          (async () => {
            try {
              const result = await new Promise<any>((resolve) => {
                browserAPI.storage.local.get([requestKey], (data: any) => {
                  resolve(data || {});
                });
              });

              if (result[requestKey]) {
                return;
              }

              // Mark as processed
              await new Promise<void>((resolve) => {
                browserAPI.storage.local.set(
                  { [requestKey]: Date.now() },
                  () => {
                    resolve();
                  }
                );
              });

              const isNewTaskBool = isNewTask === true;

              console.log(
                `[ServiceWorker] 🔄 Forwarding to DeepSeekController.sendPrompt()`
              );
              console.log(`[ServiceWorker] 📌 Arguments:`);
              console.log(`[ServiceWorker]   - tabId: ${tabId}`);
              console.log(
                `[ServiceWorker]   - systemPrompt: ${
                  systemPrompt ? "provided" : "null"
                }`
              );
              console.log(
                `[ServiceWorker]   - userPrompt length: ${userPrompt.length}`
              );
              console.log(`[ServiceWorker]   - requestId: ${requestId}`);
              console.log(
                `[ServiceWorker]   - isNewTaskBool: ${isNewTaskBool} (converted from ${isNewTask})`
              );

              // Gọi sendPrompt với overload signature mới (5 arguments)
              // Signature: sendPrompt(tabId, systemPrompt, userPrompt, requestId, isNewTask)
              DeepSeekController.sendPrompt(
                tabId,
                systemPrompt || null,
                userPrompt,
                requestId,
                isNewTaskBool
              )
                .then((success: boolean) => {
                  if (success) {
                    setTimeout(() => {
                      browserAPI.storage.local.remove([requestKey]);
                    }, 120000);
                  } else {
                    console.error(
                      `[ServiceWorker] ❌ Failed to send prompt, notifying backend...`
                    );

                    browserAPI.storage.local.set({
                      wsOutgoingMessage: {
                        connectionId: connectionId,
                        data: {
                          type: "promptResponse",
                          requestId: requestId,
                          tabId: tabId,
                          success: false,
                          error: "Failed to send prompt to DeepSeek tab",
                          errorType: "SEND_FAILED",
                          details: {
                            tabId: tabId,
                            userPromptLength: userPrompt.length,
                            hasSystemPrompt: !!systemPrompt,
                            timestamp: Date.now(),
                          },
                        },
                        timestamp: Date.now(),
                      },
                    });

                    browserAPI.storage.local.remove([requestKey]);
                  }
                })
                .catch((error: any) => {
                  console.error(
                    `[ServiceWorker] ❌ Exception in DeepSeekController.sendPrompt:`,
                    error
                  );
                  browserAPI.storage.local.remove([requestKey]);
                });
            } catch (error) {
              console.error(
                `[ServiceWorker] ❌ Exception in sendPrompt handler:`,
                error
              );
              browserAPI.storage.local.remove([requestKey]);
            }
          })();
        }
      }
    }

    // 🆕 HANDLE sendPrompt message từ Zen Extension
    if (changes.wsMessages) {
      const messages = changes.wsMessages.newValue || {};

      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;

        const recentMsgs = msgs.filter((msg) => {
          const age = Date.now() - msg.timestamp;
          return age < 180000; // 180 seconds
        });

        if (recentMsgs.length === 0) continue;

        // Get latest message
        const latestMsg = recentMsgs[recentMsgs.length - 1];

        // 🆕 CRITICAL: Handle sendPrompt từ Zen
        if (latestMsg.data.type === "sendPrompt") {
          const {
            tabId,
            systemPrompt,
            userPrompt,
            requestId,
            isNewTask,
            folderPath,
          } = latestMsg.data;

          if (!tabId || !userPrompt || !requestId) {
            console.error(`[ServiceWorker] ❌ Invalid sendPrompt message`);
            continue;
          }

          console.log(`[ServiceWorker] 📥 Received sendPrompt from Zen:`, {
            requestId,
            tabId,
            userPromptLength: userPrompt.length,
          });

          // Forward to DeepSeekController
          (async () => {
            try {
              const success = await DeepSeekController.sendPrompt(
                tabId,
                systemPrompt || null,
                userPrompt,
                requestId,
                isNewTask === true
              );

              if (!success) {
                console.error(`[ServiceWorker] ❌ Failed to send prompt`);

                // Send error response back to Zen
                browserAPI.storage.local.set({
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "promptResponse",
                      requestId: requestId,
                      tabId: tabId,
                      success: false,
                      error: "Failed to send prompt to DeepSeek",
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  },
                });
              }
            } catch (error) {
              console.error(
                `[ServiceWorker] ❌ Exception sending prompt:`,
                error
              );
            }
          })();
        }
      }
    }

    if (changes.wsIncomingRequest) {
      const request = changes.wsIncomingRequest.newValue;

      if (!request) {
        return;
      }

      if (request.type === "getAvailableTabs") {
        (async () => {
          try {
            const { requestId, connectionId } = request;

            // Sử dụng tabStateManager instance đã tạo ở đầu file
            if (!tabStateManager) {
              console.error("[ServiceWorker] TabStateManager not available!");
              throw new Error("TabStateManager not initialized");
            }

            const availableTabs = await tabStateManager.getAllTabStates();

            // Send response via wsOutgoingMessage
            await new Promise<void>((resolve, reject) => {
              browserAPI.storage.local.set(
                {
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "availableTabs",
                      requestId: requestId,
                      tabs: availableTabs,
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  },
                },
                () => {
                  if (browserAPI.runtime.lastError) {
                    console.error(
                      "[ServiceWorker] Error sending availableTabs response:",
                      browserAPI.runtime.lastError
                    );
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve();
                }
              );
            });

            // Clean up request
            browserAPI.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing getAvailableTabs:",
              error
            );

            // Send error response
            browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: request.connectionId,
                data: {
                  type: "availableTabs",
                  requestId: request.requestId,
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              },
            });

            // Clean up request
            browserAPI.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }

      if (request.type === "cleanupFolderLink") {
        const folderPath = request.folderPath;

        if (!folderPath) {
          console.error(
            "[ServiceWorker] ❌ cleanupFolderLink missing folderPath"
          );
          chrome.storage.local.remove(["wsIncomingRequest"]);
          return;
        }

        (async () => {
          try {
            if (!tabStateManager) {
              console.error(
                "[ServiceWorker] ❌ TabStateManager not available for cleanup!"
              );
              chrome.storage.local.remove(["wsIncomingRequest"]);
              return;
            }

            await tabStateManager.unlinkFolder(folderPath);

            chrome.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing cleanupFolderLink:",
              error
            );
            chrome.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }

      if (request.type === "getTabsByFolder") {
        const folderPath = request.folderPath;
        const requestId = request.requestId;
        const connectionId = request.connectionId;

        if (!folderPath || !requestId || !connectionId) {
          console.error(
            "[ServiceWorker] ❌ getTabsByFolder missing required fields"
          );
          chrome.storage.local.remove(["wsIncomingRequest"]);
          return;
        }

        (async () => {
          try {
            if (!tabStateManager) {
              console.error(
                "[ServiceWorker] ❌ TabStateManager not available!"
              );
              throw new Error("TabStateManager not initialized");
            }

            const matchingTabs = await tabStateManager.getTabsByFolder(
              folderPath
            );

            await new Promise<void>((resolve, reject) => {
              browserAPI.storage.local.set(
                {
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "availableTabs",
                      requestId: requestId,
                      tabs: matchingTabs,
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  },
                },
                () => {
                  if (browserAPI.runtime.lastError) {
                    console.error(
                      "[ServiceWorker] ❌ Error sending getTabsByFolder response:",
                      browserAPI.runtime.lastError
                    );
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve();
                }
              );
            });

            chrome.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing getTabsByFolder:",
              error
            );

            browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: request.connectionId,
                data: {
                  type: "availableTabs",
                  requestId: request.requestId,
                  success: false,
                  tabs: [],
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              },
            });

            chrome.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }
    }
  });

  // Unified Message Listener - handles all actions
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      // Handle WebSocket connect/disconnect directly
      if (message.action === "connectWebSocket") {
        console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[ServiceWorker] 📥 RECEIVED: connectWebSocket message`);
        console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // ✅ CRITICAL FIX: Wrap trong async IIFE để đảm bảo response được gửi đúng
        (async () => {
          try {
            console.log(`[ServiceWorker] 🔄 Calling wsManager.connect()...`);
            const result = await wsManager.connect();
            console.log(
              `[ServiceWorker] 📊 wsManager.connect() result:`,
              result
            );

            // Validate result structure
            if (!result || typeof result.success !== "boolean") {
              console.error(
                `[ServiceWorker] ❌ Invalid result structure:`,
                result
              );
              console.error(`[ServiceWorker] 🔍 Result type: ${typeof result}`);
              sendResponse({ success: false, error: "Invalid connect result" });
              return;
            }

            // Send response immediately
            console.log(
              `[ServiceWorker] 📤 Sending response back to caller:`,
              result
            );
            sendResponse(result);

            console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(
              `[ServiceWorker] ✅ connectWebSocket handler completed`
            );
            console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          } catch (error) {
            console.error(`[ServiceWorker] ❌ Connect exception:`, error);
            console.error(
              `[ServiceWorker] 🔍 Exception type: ${
                error instanceof Error ? error.constructor.name : typeof error
              }`
            );
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();

        return true; // CRITICAL: Keep channel open for async response
      }

      if (message.action === "disconnectWebSocket") {
        const result = wsManager.disconnect();
        sendResponse(result);
        return true;
      }

      if (message.action === "ws.sendResponse") {
        const success = wsManager.sendResponse(message.data);
        sendResponse({ success });
        return true;
      }

      if (message.action === "ws.incomingPrompt") {
        DeepSeekController.sendPrompt(
          message.tabId,
          message.prompt,
          message.requestId
        ).then((success: boolean) => {
          sendResponse({ success });
        });
        return true;
      }

      if (message.action === "ws.incomingPrompt") {
        DeepSeekController.sendPrompt(
          message.tabId,
          message.prompt,
          message.requestId
        ).then((success: boolean) => {
          sendResponse({ success });
        });
        return true;
      }

      if (message.action === "getWSConnectionInfo") {
        // 🔥 CRITICAL FIX: Sử dụng Promise-based async handler
        (async () => {
          try {
            const result = await new Promise<any>((resolve, reject) => {
              browserAPI.storage.local.get(["wsStates"], (data: any) => {
                if (browserAPI.runtime.lastError) {
                  reject(browserAPI.runtime.lastError);
                  return;
                }
                resolve(data || {});
              });
            });

            const states = result?.wsStates || {};
            const connectionIds = Object.keys(states);

            if (connectionIds.length > 0) {
              const connectionId = connectionIds[0];
              const state = states[connectionId];

              // 🔥 CRITICAL: Return FULL state object từ storage
              sendResponse({
                success: true,
                state: {
                  id: state.id,
                  port: state.port,
                  url: state.url,
                  status: state.status,
                  lastConnected: state.lastConnected,
                },
              });
            } else {
              sendResponse({
                success: false,
                error: "No WebSocket connection found",
              });
            }
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error in getWSConnectionInfo:",
              error
            );
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();

        return true; // CRITICAL: Keep channel open for async response
      }

      // DeepSeek controller handlers
      switch (message.action) {
        case "getTabStates":
          (async () => {
            try {
              const tabStates = await tabStateManager.getAllTabStates();
              const responseData = { success: true, tabStates };
              sendResponse(responseData);
            } catch (error) {
              console.error("[ServiceWorker] ❌ Error in getTabStates:", error);
              console.error("[ServiceWorker] 🔍 Error details:", {
                type:
                  error instanceof Error
                    ? error.constructor.name
                    : typeof error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });

              const responseData = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
              sendResponse(responseData);
            }
          })();

          return true;

        case "deepseek.clickNewChat":
          DeepSeekController.clickNewChatButton(message.tabId).then(
            (success: boolean) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.isDeepThinkEnabled":
          DeepSeekController.isDeepThinkEnabled(message.tabId).then(
            (enabled: any) => {
              sendResponse({ enabled });
            }
          );
          return true;

        case "deepseek.toggleDeepThink":
          DeepSeekController.toggleDeepThink(
            message.tabId,
            message.enable
          ).then((success: boolean) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.sendPrompt":
          DeepSeekController.sendPrompt(
            message.tabId,
            message.prompt,
            message.requestId
          ).then((success: boolean) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.stopGeneration":
          DeepSeekController.stopGeneration(message.tabId).then(
            (success: boolean) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.getLatestResponse":
          DeepSeekController.getLatestResponse(message.tabId).then(
            (response: any) => {
              sendResponse({ response });
            }
          );
          return true;

        case "deepseek.createNewChat":
          DeepSeekController.createNewChat(message.tabId).then(
            (success: any) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.getChatTitle":
          DeepSeekController.getChatTitle(message.tabId).then((title: any) => {
            sendResponse({ title });
          });
          return true;

        case "deepseek.isGenerating":
          DeepSeekController.isGenerating(message.tabId).then(
            (generating: any) => {
              sendResponse({ generating });
            }
          );
          return true;

        case "deepseek.getCurrentInput":
          DeepSeekController.getCurrentInput(message.tabId).then(
            (input: any) => {
              sendResponse({ input });
            }
          );
          return true;

        case "unlinkTabFromFolder":
          (async () => {
            try {
              console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              console.log(`[ServiceWorker] 🔗 UNLINK TAB FROM FOLDER REQUEST`);
              console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              console.log(`[ServiceWorker] 📌 Message data:`, {
                action: message.action,
                tabId: message.tabId,
                folderPath: message.folderPath,
              });

              if (!tabStateManager) {
                console.error(
                  `[ServiceWorker] ❌ TabStateManager not available!`
                );
                sendResponse({
                  success: false,
                  error: "TabStateManager not initialized",
                });
                return;
              }

              const success = await tabStateManager.unlinkTabFromFolder(
                message.tabId
              );

              console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
              console.log(
                `[ServiceWorker] ${
                  success ? "✅ SUCCESS" : "❌ FAILED"
                }: Unlink result = ${success}`
              );
              console.log(`[ServiceWorker] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

              sendResponse({ success });
            } catch (error) {
              console.error(
                `[ServiceWorker] ❌ Exception in unlinkTabFromFolder:`,
                error
              );
              console.error(`[ServiceWorker] 🔍 Error details:`, {
                type:
                  error instanceof Error
                    ? error.constructor.name
                    : typeof error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });

              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "getAvailableTabs":
          return true;

        default:
          messageHandler.handleMessage(message, sendResponse);
          return true;
      }
    }
  );

  // Initialize on startup
  containerManager.initializeContainers();
})();
