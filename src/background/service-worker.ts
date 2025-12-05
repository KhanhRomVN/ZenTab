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
        const legacyDomains = ["localhost:3030", "127.0.0.1:3030"];

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

    console.log(`[ServiceWorker] 📦 Storage changed:`, {
      area: areaName,
      hasWsMessages: !!changes.wsMessages,
      hasWsIncomingRequest: !!changes.wsIncomingRequest,
      changeKeys: Object.keys(changes),
    });

    // Process incoming WebSocket messages
    if (changes.wsMessages) {
      const messages = changes.wsMessages.newValue || {};
      const oldMessages = changes.wsMessages.oldValue || {};

      console.log(
        `[ServiceWorker] ==================== WS MESSAGES CHANGED ====================`
      );
      console.log(
        `[ServiceWorker] 📨 New messages count: ${Object.values(
          messages
        ).reduce((acc, arr: any) => acc + arr.length, 0)}`
      );
      console.log(
        `[ServiceWorker] 📨 Old messages count: ${Object.values(
          oldMessages
        ).reduce((acc, arr: any) => acc + arr.length, 0)}`
      );
      console.log(`[ServiceWorker] 📨 Connections:`, Object.keys(messages));

      // Log chi tiết từng connection
      for (const [connId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        console.log(
          `[ServiceWorker] 📨 Connection ${connId}: ${msgs.length} messages`
        );

        msgs.forEach((msg, idx) => {
          console.log(
            `[ServiceWorker]   [${idx}] ${msg.data.type} - ${
              msg.data.requestId || "no-request-id"
            } - ${new Date(msg.timestamp).toISOString()}`
          );
        });
      }

      if (Object.keys(messages).length === 0) {
        console.log(`[ServiceWorker] ⚠️ wsMessages is empty, skipping`);
        return;
      }

      if (Object.keys(messages).length === 0) {
        console.log(`[ServiceWorker] ⚠️ wsMessages is empty, skipping`);
        return;
      }

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;

        console.log(
          `[ServiceWorker] 🔍 Processing connection ${connectionId}:`,
          {
            totalMessages: msgs.length,
            messageTypes: msgs.map((m) => m.data.type),
            requestIds: msgs.map((m) => m.data.requestId).filter(Boolean),
          }
        );

        const now = Date.now();
        const recentMsgs = msgs.filter((msg) => {
          const age = now - msg.timestamp;
          return age < 180000; // 180 seconds (3 minutes)
        });

        console.log(`[ServiceWorker] ⏱️ Recent messages filter:`, {
          totalMessages: msgs.length,
          recentMessages: recentMsgs.length,
          filteredOut: msgs.length - recentMsgs.length,
          oldestAge:
            msgs.length > 0
              ? now - Math.min(...msgs.map((m) => m.timestamp))
              : 0,
        });

        if (recentMsgs.length === 0) {
          console.log(
            `[ServiceWorker] ⚠️ No recent messages for connection ${connectionId}, skipping`
          );
          continue;
        }

        // Get latest message
        const latestMsg = recentMsgs[recentMsgs.length - 1];

        console.log(`[ServiceWorker] 📬 Latest message:`, {
          type: latestMsg.data.type,
          requestId: latestMsg.data.requestId,
          age: now - latestMsg.timestamp,
          hasTabId: !!latestMsg.data.tabId,
          hasUserPrompt: !!latestMsg.data.userPrompt,
        });

        if (latestMsg.data.type === "sendPrompt") {
          const detectionTime = Date.now();
          console.log(
            `[ServiceWorker] ====================================================`
          );
          console.log(
            `[ServiceWorker] ========== SEND PROMPT DETECTED ==========`
          );
          console.log(`[ServiceWorker] ⏱️ Detection time: ${detectionTime}`);
          console.log(`[ServiceWorker] 🔍 MESSAGE DETAILS:`, {
            connectionId: connectionId,
            messageIndex: recentMsgs.length - 1,
            totalRecentMessages: recentMsgs.length,
            messageAge: detectionTime - latestMsg.timestamp,
          });

          console.log(`[ServiceWorker] 🎯 MESSAGE PAYLOAD:`, {
            requestId: latestMsg.data.requestId,
            tabId: latestMsg.data.tabId,
            hasUserPrompt: !!latestMsg.data.userPrompt,
            userPromptLength: latestMsg.data.userPrompt?.length || 0,
            userPromptPreview: latestMsg.data.userPrompt?.substring(0, 200),
            hasSystemPrompt: !!latestMsg.data.systemPrompt,
            systemPromptLength: latestMsg.data.systemPrompt?.length || 0,
            systemPromptPreview: latestMsg.data.systemPrompt?.substring(0, 100),
            isNewTask: latestMsg.data.isNewTask,
            folderPath: latestMsg.data.folderPath,
            timestamp: latestMsg.timestamp,
            age: detectionTime - latestMsg.timestamp,
            messageType: latestMsg.data.type,
            rawMessage: JSON.stringify(latestMsg.data).substring(0, 500),
          });

          console.log(`[ServiceWorker] 📊 CONNECTION INFO:`, {
            connectionId: connectionId,
            totalConnections: Object.keys(messages).length,
            allConnectionIds: Object.keys(messages),
            thisConnectionMessageCount: msgs.length,
          });

          const {
            tabId,
            systemPrompt,
            userPrompt,
            requestId,
            isNewTask,
            folderPath,
          } = latestMsg.data;

          console.log(`[ServiceWorker] 🔍 PARSED FIELDS:`, {
            tabId: tabId,
            requestId: requestId,
            userPromptLength: userPrompt?.length || 0,
            systemPromptLength: systemPrompt?.length || 0,
            isNewTask: isNewTask,
            folderPath: folderPath,
            hasAllRequiredFields: !!(tabId && userPrompt && requestId),
            missingFields: {
              tabId: !tabId,
              userPrompt: !userPrompt,
              requestId: !requestId,
            },
          });
          console.log(
            `[ServiceWorker] 🔍 User prompt preview: "${latestMsg.data.userPrompt?.substring(
              0,
              100
            )}"`
          );

          console.log(`[ServiceWorker] 🔍 Parsed fields:`, {
            tabId,
            requestId,
            userPromptLength: userPrompt?.length || 0,
            systemPromptLength: systemPrompt?.length || 0,
            isNewTask,
            folderPath,
          });

          console.log(`[ServiceWorker] 🔍 sendPrompt validation:`, {
            hasTabId: !!tabId,
            tabIdValue: tabId,
            hasUserPrompt: !!userPrompt,
            userPromptLength: userPrompt?.length || 0,
            hasRequestId: !!requestId,
            requestIdValue: requestId,
            hasSystemPrompt: !!systemPrompt,
            hasFolderPath: !!folderPath,
            isNewTask,
          });

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

          console.log(
            `[ServiceWorker] ✅ sendPrompt validation passed, processing...`
          );

          const requestKey = `processed_${requestId}`;

          // Wrap in async IIFE to use await
          (async () => {
            try {
              console.log(
                `[ServiceWorker] 🔍 Checking if request already processed:`,
                {
                  requestKey,
                  requestId,
                }
              );

              const result = await new Promise<any>((resolve) => {
                browserAPI.storage.local.get([requestKey], (data: any) => {
                  resolve(data || {});
                });
              });

              if (result[requestKey]) {
                console.error(
                  `[ServiceWorker] ⚠️ Request already processed, skipping:`,
                  {
                    requestId,
                    processedAt: result[requestKey],
                    age: Date.now() - result[requestKey],
                  }
                );
                return;
              }

              console.log(
                `[ServiceWorker] ✅ Request not processed yet, marking as processed`
              );

              // Mark as processed
              await new Promise<void>((resolve) => {
                browserAPI.storage.local.set(
                  { [requestKey]: Date.now() },
                  () => {
                    console.log(
                      `[ServiceWorker] ✅ Request marked as processed:`,
                      requestKey
                    );
                    resolve();
                  }
                );
              });

              const isNewTaskBool = isNewTask === true;

              console.log(
                `[ServiceWorker] 🚀 Calling DeepSeekController.sendPrompt:`,
                {
                  tabId,
                  requestId,
                  hasSystemPrompt: !!systemPrompt,
                  userPromptLength: userPrompt.length,
                  isNewTask: isNewTaskBool,
                }
              );

              console.log(
                `[ServiceWorker] 📞 BEFORE DeepSeekController.sendPrompt() call`
              );
              console.log(`[ServiceWorker] 🔍 Call arguments:`, {
                arg1_tabId: tabId,
                arg2_systemPrompt: systemPrompt
                  ? `${systemPrompt.length} chars`
                  : "null",
                arg3_userPrompt: `${userPrompt.substring(0, 50)}...`,
                arg4_requestId: requestId,
                arg5_isNewTask: isNewTaskBool,
              });

              const sendPromptPromise = DeepSeekController.sendPrompt(
                tabId,
                systemPrompt || null,
                userPrompt,
                requestId,
                isNewTaskBool
              );

              console.log(
                `[ServiceWorker] 📞 AFTER DeepSeekController.sendPrompt() call`
              );
              console.log(`[ServiceWorker] 🔍 Promise created:`, {
                hasPromise: !!sendPromptPromise,
                promiseType: typeof sendPromptPromise,
                timestamp: Date.now(),
              });

              sendPromptPromise
                .then((success: boolean) => {
                  console.log(
                    `[ServiceWorker] ${
                      success ? "✅" : "❌"
                    } DeepSeekController.sendPrompt result:`,
                    {
                      success,
                      requestId,
                      tabId,
                    }
                  );

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
        (async () => {
          try {
            const result = await wsManager.connect();

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
