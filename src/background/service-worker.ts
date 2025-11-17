import { ContainerManager } from "./container-manager";
import { ZenTabManager } from "./zentab-manager";
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

  // Initialize WebSocket Manager
  const wsManager = new WSManagerNew();

  // Initialize Tab Broadcaster
  new TabBroadcaster(wsManager);

  // Initialize managers
  const containerManager = new ContainerManager(browserAPI);
  const zenTabManager = new ZenTabManager(browserAPI, containerManager);
  const messageHandler = new MessageHandler(containerManager, zenTabManager);

  // Setup event listeners
  browserAPI.contextualIdentities.onCreated.addListener(() => {
    containerManager.initializeContainers();
  });

  browserAPI.contextualIdentities.onRemoved.addListener(() => {
    containerManager.initializeContainers();
  });

  browserAPI.tabs.onRemoved.addListener((tabId: number) => {
    zenTabManager.handleTabRemoved(tabId);
  });

  // 🆕 Track processed request IDs để tránh xử lý lại
  const processedRequests = new Set<string>();

  // 🆕 Rate limiting để tránh spam
  const requestRateLimiter = new Map<string, number>(); // requestId -> timestamp
  const MAX_REQUESTS_PER_MINUTE = 30;

  // 🆕 Listen for WebSocket messages from storage
  browserAPI.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== "local") return;

    // Process incoming WebSocket messages
    if (changes.wsMessages) {
      const messages = changes.wsMessages.newValue || {};

      // 🆕 Rate limiting check
      const now = Date.now();
      const minuteAgo = now - 60000;

      // Clean up old entries
      for (const [reqId, timestamp] of requestRateLimiter.entries()) {
        if (timestamp < minuteAgo) {
          requestRateLimiter.delete(reqId);
        }
      }

      // Check rate limit
      if (requestRateLimiter.size >= MAX_REQUESTS_PER_MINUTE) {
        console.warn(
          "[ServiceWorker] ⚠️ Rate limit exceeded, ignoring new requests"
        );
        return;
      }

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        // Get latest message
        if (msgs.length > 0) {
          const latestMsg = msgs[msgs.length - 1];
          // Handle sendPrompt type
          if (latestMsg.data.type === "sendPrompt") {
            const { tabId, prompt, requestId } = latestMsg.data;

            // 🆕 Apply rate limiting
            requestRateLimiter.set(requestId, now);

            // 🆕 Kiểm tra xem đã xử lý request này chưa
            if (processedRequests.has(requestId)) {
              console.log(
                `[ServiceWorker] ⏭️ Request ${requestId} already processed, skipping`
              );
              continue;
            }

            // 🆕 Đánh dấu request đã được xử lý
            processedRequests.add(requestId);

            // 🆕 Tự động xóa khỏi Set sau 3 phút để tránh memory leak
            setTimeout(() => {
              processedRequests.delete(requestId);
              requestRateLimiter.delete(requestId);
            }, 180000);

            console.log(
              `[ServiceWorker] 📥 Processing request ${requestId} for tab ${tabId}`
            );

            // Send prompt to DeepSeek tab
            console.log(
              `[ServiceWorker] 📤 Calling DeepSeekController.sendPrompt for tab ${tabId}, request ${requestId}`
            );

            DeepSeekController.sendPrompt(tabId, prompt, requestId)
              .then((success: boolean) => {
                if (success) {
                  console.log(
                    `[ServiceWorker] ✅ Successfully sent prompt for request ${requestId}`
                  );
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
                }
              })
              .catch((error: unknown) => {
                console.error(
                  `[ServiceWorker] ❌ Exception while sending prompt for request ${requestId}:`,
                  error
                );
                console.error("[ServiceWorker] Error details:", {
                  name: error instanceof Error ? error.name : "unknown",
                  message:
                    error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                });

                // Send error back to ZenChat
                browserAPI.storage.local.set({
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "promptResponse",
                      requestId: requestId,
                      tabId: tabId,
                      success: false,
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                    timestamp: Date.now(),
                  },
                });
              });
          }
        }
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

        default:
          messageHandler.handleMessage(message, sendResponse);
          return true;
      }
    }
  );

  // Initialize on startup
  containerManager.initializeContainers();

  // 🆕 Log system status periodically
  setInterval(() => {
    const rateLimitStatus = `Rate limiting: ${requestRateLimiter.size}/${MAX_REQUESTS_PER_MINUTE} requests in last minute`;
    const processedStatus = `Processed requests: ${processedRequests.size}`;
    console.log(
      `[ServiceWorker] 📊 System Status - ${rateLimitStatus}, ${processedStatus}`
    );
  }, 30000); // Log every 30 seconds
})();
