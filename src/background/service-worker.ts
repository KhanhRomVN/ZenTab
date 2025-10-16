import { ContainerManager } from "./container-manager";
import { ZenTabManager } from "./zentab-manager";
import { MessageHandler } from "./message-handler";
import { WebSocketManager } from "./websocket-manager";
import { DeepSeekController } from "./deepseek-controller";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

  const wsManager = new WebSocketManager();

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

  browserAPI.tabs.onCreated.addListener((tab: any) => {
    zenTabManager.handleTabCreated(tab);
  });

  browserAPI.tabs.onRemoved.addListener((tabId: number) => {
    zenTabManager.handleTabRemoved(tabId);
  });

  browserAPI.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: any, tab: any) => {
      zenTabManager.handleTabUpdated(tabId, changeInfo, tab);
    }
  );

  // Listen for sidebar opening
  browserAPI.runtime.onConnect.addListener((port: any) => {
    if (port.name === "zenTab-sidebar") {
      console.log("[ServiceWorker] Sidebar connected");

      port.onDisconnect.addListener(() => {
        console.log("[ServiceWorker] Sidebar disconnected");
      });
    }
  });

  // Message listener
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      messageHandler.handleMessage(message, sendResponse);
      return true;
    }
  );

  // WebSocket message handlers
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      // Existing handler
      messageHandler.handleMessage(message, sendResponse);

      // WebSocket handlers
      switch (message.action) {
        case "getWebSocketConnections":
          sendResponse(wsManager.getAllConnections());
          break;

        case "addWebSocketConnection":
          wsManager
            .addConnection(message.port)
            .then((id) => {
              sendResponse({ success: true, connectionId: id });
            })
            .catch((error: Error) => {
              sendResponse({ success: false, error: error.message });
            });
          return true;

        case "removeWebSocketConnection":
          wsManager
            .removeConnection(message.connectionId)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error: Error) => {
              sendResponse({ success: false, error: error.message });
            });
          return true;

        case "connectWebSocket":
          wsManager
            .connect(message.connectionId)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error: Error) => {
              sendResponse({ success: false, error: error.message });
            });
          return true;

        case "disconnectWebSocket":
          wsManager.disconnect(message.connectionId);
          sendResponse({ success: true });
          break;

        case "sendWebSocketMessage":
          wsManager.sendMessage(message.connectionId, message.data);
          sendResponse({ success: true });
          break;

        // DeepSeek controller handlers
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
      }

      return true;
    }
  );

  // Initialize on startup
  containerManager.initializeContainers();
})();
