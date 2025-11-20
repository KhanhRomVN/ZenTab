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
    "wsConnections",
    "wsMessages",
    "wsOutgoingMessage",
    "wsIncomingRequest",
    "wsCommand",
    "wsCommandResult",
  ]);

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
          const { tabId, prompt, requestId } = latestMsg.data;

          console.log(
            `[ServiceWorker] 📨 Received sendPrompt message - tabId: ${tabId}, requestId: ${requestId}`
          );

          if (!tabId || !prompt || !requestId) {
            console.error(
              `[ServiceWorker] ❌ Invalid sendPrompt message - missing required fields`
            );
            console.error(`[ServiceWorker] 📊 Message data:`, {
              tabId,
              hasPrompt: !!prompt,
              requestId,
            });
            continue;
          }

          const requestKey = `processed_${requestId}`;

          // Wrap in async IIFE to use await
          (async () => {
            try {
              console.log(
                `[ServiceWorker] 🔍 Checking if request already processed - requestId: ${requestId}`
              );

              const result = await new Promise<any>((resolve) => {
                browserAPI.storage.local.get([requestKey], (data: any) => {
                  resolve(data || {});
                });
              });

              if (result[requestKey]) {
                console.log(
                  `[ServiceWorker] ⚠️ Request already processed, skipping - requestId: ${requestId}`
                );
                return;
              }

              console.log(
                `[ServiceWorker] ✅ Request not processed yet, proceeding - requestId: ${requestId}`
              );
              console.log(`[ServiceWorker] 📝 Marking request as processed...`);

              // Mark as processed
              await new Promise<void>((resolve) => {
                browserAPI.storage.local.set(
                  { [requestKey]: Date.now() },
                  () => {
                    resolve();
                  }
                );
              });

              console.log(
                `[ServiceWorker] 🚀 Calling DeepSeekController.sendPrompt - tabId: ${tabId}, requestId: ${requestId}`
              );

              DeepSeekController.sendPrompt(tabId, prompt, requestId)
                .then((success: boolean) => {
                  console.log(
                    `[ServiceWorker] 📊 DeepSeekController.sendPrompt completed - success: ${success}, tabId: ${tabId}, requestId: ${requestId}`
                  );

                  if (success) {
                    console.log(
                      `[ServiceWorker] ✅ Prompt sent successfully, will cleanup processed marker in 2 minutes`
                    );
                    setTimeout(() => {
                      browserAPI.storage.local.remove([requestKey]);
                      console.log(
                        `[ServiceWorker] 🧹 Cleaned up processed marker for requestId: ${requestId}`
                      );
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
                            promptLength: prompt.length,
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
    }
  });

  // Unified Message Listener - handles all actions
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      // WebSocket actions - ignore, handled via storage
      if (
        (message.action &&
          message.action.startsWith("addWebSocketConnection")) ||
        message.action === "removeWebSocketConnection" ||
        message.action === "connectWebSocket" ||
        message.action === "disconnectWebSocket"
      ) {
        // Return empty response to prevent UI from hanging
        sendResponse({
          success: true,
          note: "WebSocket actions use storage-based communication",
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
