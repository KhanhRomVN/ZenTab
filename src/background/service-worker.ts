import { bootstrap } from "./bootstrap";

declare const browser: typeof chrome & any;

// Initialize Bootstrap system
(async () => {
  "use strict";

  try {
    // Initialize the entire system via Bootstrap
    await bootstrap.initialize();
  } catch (error) {
    console.error("[ServiceWorker] ❌ Initialization failed:", error);

    // Fallback: try to notify user about initialization failure
    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;

      if (browserAPI?.notifications) {
        browserAPI.notifications.create({
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: "ZenTab Initialization Failed",
          message: "Please reload the extension or restart your browser.",
        });
      }
    } catch (notifError) {
      console.error(
        "[ServiceWorker] ❌ Failed to show error notification:",
        notifError
      );
    }
  }
})();

// Handle extension lifecycle events
if (typeof chrome !== "undefined" && chrome.runtime) {
  // Handle extension suspend/unload
  chrome.runtime.onSuspend.addListener(() => {
    bootstrap.cleanup().catch((error) => {
      console.error("[ServiceWorker] ❌ Cleanup failed:", error);
    });
  });

  // Handle extension restart
  chrome.runtime.onStartup.addListener(() => {
    bootstrap.initialize().catch((error) => {
      console.error("[ServiceWorker] ❌ Restart initialization failed:", error);
    });
  });
}
