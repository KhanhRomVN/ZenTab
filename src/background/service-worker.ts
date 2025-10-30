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
      const messages = changes.wsMessages.newValue || {};

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;

        // Get latest message
        if (msgs.length > 0) {
          const latestMsg = msgs[msgs.length - 1];

          // Handle sendPrompt type
          if (latestMsg.data.type === "sendPrompt") {
            console.debug(
              "[ServiceWorker] Processing sendPrompt from WebSocket:",
              latestMsg.data
            );

            const { tabId, prompt, requestId } = latestMsg.data;

            // Send prompt to DeepSeek tab
            DeepSeekController.sendPrompt(tabId, prompt)
              .then((success) => {
                console.debug(
                  "[ServiceWorker] Prompt sent successfully:",
                  success
                );

                // 🆕 Send response back via WebSocket
                if (success) {
                  // Get the response after a delay (adjust timing as needed)
                  setTimeout(async () => {
                    const response = await DeepSeekController.getLatestResponse(
                      tabId
                    );

                    if (response) {
                      // Store response to be sent back via WebSocket
                      const responseData = {
                        type: "promptResponse",
                        requestId: requestId,
                        tabId: tabId,
                        success: true,
                        response: response,
                      };

                      // Trigger sending via storage (will be picked up by ws-connection)
                      browserAPI.storage.local.set({
                        wsOutgoingMessage: {
                          connectionId: connectionId,
                          data: responseData,
                          timestamp: Date.now(),
                        },
                      });
                    }
                  }, 2000); // Đợi 2s để AI trả lời (điều chỉnh nếu cần)
                }
              })
              .catch((error) => {
                console.error("[ServiceWorker] Failed to send prompt:", error);
              });
          }
        }
      }
    }
  });

  // Listen for sidebar opening
  browserAPI.runtime.onConnect.addListener((port: any) => {
    if (port.name === "zenTab-sidebar") {
      console.log("[ServiceWorker] Sidebar connected");

      port.onDisconnect.addListener(() => {
        console.log("[ServiceWorker] Sidebar disconnected");
      });
    }
  });

  // Unified Message Listener - handles all actions
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      console.debug("[ServiceWorker] Message received:", message.action);

      // WebSocket actions - ignore, handled via storage
      if (
        (message.action &&
          message.action.startsWith("addWebSocketConnection")) ||
        message.action === "removeWebSocketConnection" ||
        message.action === "connectWebSocket" ||
        message.action === "disconnectWebSocket"
      ) {
        console.debug(
          "[ServiceWorker] WebSocket action - handled via storage, ignoring message"
        );
        // Return empty response to prevent UI from hanging
        sendResponse({
          success: true,
          note: "WebSocket actions use storage-based communication",
        });
        return true;
      }

      // 🆕 Handle WebSocket incoming prompts (fallback method)
      if (message.action === "ws.incomingPrompt") {
        console.debug("[ServiceWorker] Processing WebSocket prompt:", message);
        DeepSeekController.sendPrompt(message.tabId, message.prompt).then(
          (success) => {
            sendResponse({ success });
          }
        );
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
          DeepSeekController.sendPrompt(message.tabId, message.prompt).then(
            (success) => {
              sendResponse({ success });
            }
          );
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
