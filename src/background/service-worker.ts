// src/background/service-worker.ts - Simplified version without module exports

/**
 * Service Worker Main Entry Point
 */
(async () => {
  "use strict";

  console.log("[ServiceWorker] 🚀 Starting ZenTab extension...");

  try {
    // Minimal initialization without bootstrap import
    await initializeMinimalSystem();

    console.log("[ServiceWorker] ✅ Extension started successfully");

    // Handle extension lifecycle events
    setupLifecycleListeners();
  } catch (error) {
    console.error("[ServiceWorker] ❌ Failed to start extension:", error);

    // Try graceful degradation
    try {
      await fallbackInitialization();
    } catch (fallbackError) {
      console.error(
        "[ServiceWorker] ❌ Fallback initialization also failed:",
        fallbackError
      );
    }
  }

  /**
   * Minimal system initialization
   */
  async function initializeMinimalSystem(): Promise<void> {
    console.log("[ServiceWorker] 🔧 Initializing minimal system...");

    // Cleanup legacy storage
    await cleanupLegacyData();

    // Initialize storage
    await initializeStorage();

    // Setup basic message listener
    setupBasicMessageListener();

    console.log("[ServiceWorker] ✅ Minimal system initialized");
  }

  /**
   * Setup extension lifecycle listeners
   */
  function setupLifecycleListeners(): void {
    // Handle extension installation/update
    chrome.runtime.onInstalled.addListener((details) => {
      console.log(
        "[ServiceWorker] 🔄 Extension installed/updated:",
        details.reason
      );

      if (details.reason === "install") {
        showInstallNotification();
      } else if (details.reason === "update") {
        handleExtensionUpdate(details.previousVersion);
      }
    });

    // Handle extension suspension
    chrome.runtime.onSuspend.addListener(() => {
      console.log("[ServiceWorker] ⏸️ Extension suspending...");
    });

    // Handle extension resume
    chrome.runtime.onStartup.addListener(() => {
      console.log("[ServiceWorker] ▶️ Extension resuming...");
    });
  }

  /**
   * Show installation notification
   */
  function showInstallNotification(): void {
    try {
      chrome.notifications.create(
        {
          type: "basic",
          iconUrl: "icons/icon-128.png",
          title: "ZenTab Installed",
          message: "Thank you for installing ZenTab! Click to open settings.",
          priority: 2,
        },
        (notificationId) => {
          // Handle notification click
          chrome.notifications.onClicked.addListener((clickedId) => {
            if (clickedId === notificationId) {
              chrome.runtime.openOptionsPage();
              chrome.notifications.clear(clickedId);
            }
          });
        }
      );
    } catch (error) {
      console.error(
        "[ServiceWorker] ❌ Failed to show install notification:",
        error
      );
    }
  }

  /**
   * Handle extension update
   */
  function handleExtensionUpdate(previousVersion: string | undefined): void {
    console.log(
      `[ServiceWorker] 🔄 Updated from version ${previousVersion || "unknown"}`
    );

    // Perform migration if needed
    if (previousVersion && isVersionOlder(previousVersion, "1.0.0")) {
      performMigration(previousVersion);
    }
  }

  /**
   * Check if version is older
   */
  function isVersionOlder(version1: string, version2: string): boolean {
    const v1 = version1.split(".").map(Number);
    const v2 = version2.split(".").map(Number);

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const part1 = v1[i] || 0;
      const part2 = v2[i] || 0;

      if (part1 < part2) return true;
      if (part1 > part2) return false;
    }

    return false;
  }

  /**
   * Perform migration from older versions
   */
  function performMigration(previousVersion: string): void {
    console.log(
      `[ServiceWorker] 🧹 Performing migration from ${previousVersion}`
    );

    // Cleanup legacy storage
    chrome.storage.local.remove(
      ["wsConnection", "wsConnectionId", "wsPort", "wsUrl", "lastConnected"],
      () => {
        console.log("[ServiceWorker] ✅ Legacy storage cleaned up");
      }
    );
  }

  /**
   * Fallback initialization
   */
  async function fallbackInitialization(): Promise<void> {
    console.log("[ServiceWorker] 🔄 Attempting fallback initialization...");

    try {
      // Minimal initialization
      await initializeEssentialServices();

      console.log("[ServiceWorker] ✅ Fallback initialization completed");
    } catch (error) {
      throw new Error(`Fallback initialization failed: ${error}`);
    }
  }

  /**
   * Initialize essential services only
   */
  async function initializeEssentialServices(): Promise<void> {
    // Cleanup legacy data
    await cleanupLegacyData();

    // Initialize storage
    await initializeStorage();

    // Setup basic message listener
    setupBasicMessageListener();

    console.log("[ServiceWorker] ✅ Essential services initialized");
  }

  /**
   * Cleanup legacy data
   */
  async function cleanupLegacyData(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        ["wsStates", "wsMessages", "wsOutgoingMessage", "wsIncomingRequest"],
        () => {
          resolve();
        }
      );
    });
  }

  /**
   * Initialize storage
   */
  async function initializeStorage(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.session.set({ zenTabStates: {} }, () => {
        resolve();
      });
    });
  }

  /**
   * Setup basic message listener
   */
  function setupBasicMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle essential messages only
      switch (message.action) {
        case "ping":
          sendResponse({ success: true, message: "pong" });
          break;

        case "getStatus":
          sendResponse({
            success: true,
            status: "minimal_mode",
            message: "Running in minimal mode",
          });
          break;

        default:
          sendResponse({
            success: false,
            error: "Service unavailable in minimal mode",
          });
          break;
      }

      return true;
    });
  }
})();
