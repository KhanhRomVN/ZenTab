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
  const tabBroadcaster = new TabBroadcaster(wsManager);

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

  // 🆕 Listen for WebSocket messages from storage
  browserAPI.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== "local") return;

    // Process incoming WebSocket messages
    if (changes.wsMessages) {
      console.log("[ServiceWorker] 📨 Received WebSocket messages update");
      const messages = changes.wsMessages.newValue || {};
      console.log(
        "[ServiceWorker] 📊 Total connections with messages:",
        Object.keys(messages).length
      );

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        console.log(
          `[ServiceWorker] 🔍 Processing connection: ${connectionId}, Messages count: ${msgs.length}`
        );

        // Get latest message
        if (msgs.length > 0) {
          const latestMsg = msgs[msgs.length - 1];
          console.log(
            `[ServiceWorker] 📩 Latest message type: ${latestMsg.data.type}`
          );

          // Handle sendPrompt type
          if (latestMsg.data.type === "sendPrompt") {
            const { tabId, prompt, requestId } = latestMsg.data;
            console.log("[ServiceWorker] ✅ Received sendPrompt command");
            console.log("[ServiceWorker] 📝 Prompt details:", {
              connectionId,
              tabId,
              requestId,
              promptLength: prompt?.length || 0,
              promptPreview:
                prompt?.substring(0, 100) + (prompt?.length > 100 ? "..." : ""),
              timestamp: new Date(latestMsg.timestamp).toISOString(),
            });

            // Send prompt to DeepSeek tab
            DeepSeekController.sendPrompt(tabId, prompt, requestId)
              .then((success) => {
                if (success) {
                } else {
                  console.error(
                    "[ServiceWorker] ❌ Failed to send prompt to DeepSeek"
                  );

                  // Send error back to ZenChat
                  browserAPI.storage.local.set({
                    wsOutgoingMessage: {
                      connectionId: connectionId,
                      data: {
                        type: "promptResponse",
                        requestId: requestId,
                        tabId: tabId,
                        success: false,
                        error: "Failed to send prompt to DeepSeek tab",
                      },
                      timestamp: Date.now(),
                    },
                  });
                }
              })
              .catch((error) => {
                console.error(
                  "[ServiceWorker] ❌ Exception while sending prompt:",
                  error
                );
                console.error("[ServiceWorker] Error details:", {
                  name: error?.name,
                  message: error?.message,
                  stack: error?.stack,
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
        ).then((success) => {
          sendResponse({ success });
        });
        return true;
      }

      // DeepSeek controller handlers
      switch (message.action) {
        case "deepseek.isDeepThinkEnabled":
          DeepSeekController.isDeepThinkEnabled(message.tabId).then(
            (enabled) => {
              sendResponse({ enabled });
            }
          );
          return true;

        case "deepseek.toggleDeepThink":
          DeepSeekController.toggleDeepThink(
            message.tabId,
            message.enable
          ).then((success) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.sendPrompt":
          DeepSeekController.sendPrompt(
            message.tabId,
            message.prompt,
            message.requestId
          ).then((success) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.stopGeneration":
          DeepSeekController.stopGeneration(message.tabId).then((success) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.getLatestResponse":
          DeepSeekController.getLatestResponse(message.tabId).then(
            (response) => {
              sendResponse({ response });
            }
          );
          return true;

        case "deepseek.createNewChat":
          DeepSeekController.createNewChat(message.tabId).then((success) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.getChatTitle":
          DeepSeekController.getChatTitle(message.tabId).then((title) => {
            sendResponse({ title });
          });
          return true;

        case "deepseek.isGenerating":
          DeepSeekController.isGenerating(message.tabId).then((generating) => {
            sendResponse({ generating });
          });
          return true;

        case "deepseek.getCurrentInput":
          DeepSeekController.getCurrentInput(message.tabId).then((input) => {
            sendResponse({ input });
          });
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
