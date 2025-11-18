import { ContainerManager } from "./container-manager";
import { MessageHandler } from "./message-handler";
import { WSManagerNew } from "./websocket/ws-manager-new";
import { TabBroadcaster } from "./websocket/tab-broadcaster";
import { DeepSeekController } from "./deepseek-controller";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

  // 🆕 THÊM: Cleanup old connections trên startup
  const cleanupOldConnections = async () => {
    try {
      const result = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get(["wsConnections"], (data: any) => {
          resolve(data || {});
        });
      });

      const connections = result.wsConnections || [];

      // 🆕 CHỈ giữ lại kết nối port 1500
      const validConnections = connections.filter(
        (conn: any) => conn.port === 1500
      );

      if (validConnections.length !== connections.length) {
        await new Promise<void>((resolve) => {
          browserAPI.storage.local.set(
            { wsConnections: validConnections },
            () => {
              resolve();
            }
          );
        });
      }
    } catch (error) {
      console.error(
        "[ServiceWorker] Failed to cleanup old connections:",
        error
      );
    }
  };

  // Initialize WebSocket Manager
  const wsManager = new WSManagerNew();

  cleanupOldConnections().then(() => {
    new TabBroadcaster(wsManager);
  });

  // Initialize managers
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

  // 🆕 Listen for WebSocket messages from storage
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

        // 🔧 TĂNG timeout từ 30s lên 120s
        const recentMsgs = msgs.filter((msg) => {
          const age = Date.now() - msg.timestamp;
          return age < 180000; // 180 seconds (3 minutes)
        });

        if (recentMsgs.length === 0) {
          continue;
        }

        // Get latest message
        const latestMsg = recentMsgs[recentMsgs.length - 1];

        // 🆕 THÊM: Additional validation for sendPrompt messages
        if (latestMsg.data.type === "sendPrompt") {
          const { tabId, prompt, requestId } = latestMsg.data;

          // 🆕 THÊM: Validate required fields
          if (!tabId || !prompt || !requestId) {
            console.error(
              `[ServiceWorker] ❌ Invalid sendPrompt message: missing required fields`,
              { tabId, promptLength: prompt?.length, requestId }
            );
            continue;
          }

          // 🔧 IMPROVED: Use async/await for duplicate detection
          const requestKey = `processed_${requestId}`;

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

              DeepSeekController.sendPrompt(tabId, prompt, requestId)
                .then((success: boolean) => {
                  if (success) {
                    setTimeout(() => {
                      browserAPI.storage.local.remove([requestKey]);
                    }, 120000);
                  } else {
                    console.error(
                      `[ServiceWorker] ❌ Failed to send prompt to DeepSeek for request ${requestId}`
                    );

                    // 🔧 CRITICAL FIX: Send detailed error back to Backend
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

                    // 🆕 THÊM: Cleanup processed marker on failure
                    browserAPI.storage.local.remove([requestKey]);
                  }
                })
                .catch((error: unknown) => {
                  console.error(
                    `[ServiceWorker] ❌ Exception while sending prompt for request ${requestId}:`,
                    error
                  );
                  // 🆕 THÊM: Cleanup processed marker on exception
                  browserAPI.storage.local.remove([requestKey]);
                });
            } catch (error) {
              console.error(
                `[ServiceWorker] ❌ Exception in async IIFE for request ${requestId}:`,
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

            const tabs = await new Promise<chrome.tabs.Tab[]>(
              (resolve, reject) => {
                browserAPI.tabs.query(
                  { url: "https://chat.deepseek.com/*" },
                  (result: chrome.tabs.Tab[]) => {
                    if (browserAPI.runtime.lastError) {
                      console.error(
                        `[ServiceWorker] ❌ Query error:`,
                        browserAPI.runtime.lastError
                      );
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve(result || []);
                  }
                );
              }
            );

            const availableTabs = tabs.map((tab) => ({
              tabId: tab.id,
              containerName: `Tab ${tab.id}`,
              title: tab.title || "Untitled",
              url: tab.url,
              status: "free",
              canAccept: true,
            }));

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
                      `[ServiceWorker] ❌ Storage error:`,
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
              `[ServiceWorker] ❌ Error processing getAvailableTabs:`,
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

      // 🆕 Handle WebSocket incoming prompts (fallback method)
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
