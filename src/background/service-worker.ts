import { ContainerManager } from "./container-manager";
import { ZenTabManager } from "./zentab-manager";
import { MessageHandler } from "./message-handler";
import { WSManagerNew } from "./websocket/ws-manager-new";
import { DeepSeekController } from "./deepseek-controller";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

  // Initialize WebSocket Manager (no need to store reference, it auto-handles via storage)
  new WSManagerNew();

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
