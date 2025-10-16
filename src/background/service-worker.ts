import { ContainerManager } from "./container-manager";
import { ZenTabManager } from "./zentab-manager";
import { MessageHandler } from "./message-handler";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

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

  // Listen for sidebar opening to ensure ZenTabs
  browserAPI.runtime.onConnect.addListener((port: any) => {
    if (port.name === "zenTab-sidebar") {
      // When sidebar connects, ensure all managed containers have ZenTabs
      zenTabManager.ensureAllZenTabs();

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

  // Initialize on startup
  containerManager.initializeContainers();
})();
