// src/background/bootstrap/startup-manager.ts

import { DependencyContainer } from "./dependency-container";
import { ServiceRegistry } from "./service-registry";

/**
 * Startup Manager - Xử lý khởi động và cleanup hệ thống
 */
export class StartupManager {
  private dependencyContainer: DependencyContainer;
  private serviceRegistry: ServiceRegistry;
  private isInitialized = false;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  constructor(
    dependencyContainer: DependencyContainer,
    serviceRegistry: ServiceRegistry
  ) {
    this.dependencyContainer = dependencyContainer;
    this.serviceRegistry = serviceRegistry;
  }

  /**
   * Khởi động toàn bộ hệ thống
   */
  public async startup(): Promise<void> {
    if (this.isInitialized) {
      console.warn("[StartupManager] ⚠️ System already initialized");
      return;
    }

    console.log("[StartupManager] 🚀 Starting system...");

    try {
      // Step 1: Cleanup legacy data
      await this.cleanupLegacyData();

      // Step 2: Resolve tất cả dependencies
      await this.dependencyContainer.resolveAll();

      // Step 3: Initialize core managers
      await this.initializeCoreManagers();

      // Step 4: Setup storage cleanup
      this.setupStorageCleanup();

      this.isInitialized = true;

      // Step 5: Notify UI về initial state
      await this.notifyUIInitialState();

      console.log("[StartupManager] ✅ System startup completed");
    } catch (error) {
      console.error("[StartupManager] ❌ System startup failed:", error);
      throw error;
    }
  }

  /**
   * Shutdown hệ thống
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      console.warn(
        "[StartupManager] ⚠️ System not initialized, nothing to shutdown"
      );
      return;
    }

    console.log("[StartupManager] 🛑 Shutting down system...");

    try {
      // Execute all cleanup callbacks
      for (const cleanup of this.cleanupCallbacks) {
        try {
          await cleanup();
        } catch (error) {
          console.error("[StartupManager] ❌ Error during cleanup:", error);
        }
      }

      // Clear cleanup callbacks
      this.cleanupCallbacks = [];
      this.isInitialized = false;

      console.log("[StartupManager] ✅ System shutdown completed");
    } catch (error) {
      console.error("[StartupManager] ❌ System shutdown failed:", error);
      throw error;
    }
  }

  /**
   * Setup tất cả event listeners
   */
  public async setupListeners(): Promise<void> {
    console.log("[StartupManager] 🎧 Setting up event listeners...");

    try {
      // Get event handlers từ dependency container (sử dụng getAsync vì có thể là Promise)
      const tabEventHandler = await this.dependencyContainer.getAsync<any>(
        "TabEventHandler"
      );
      const storageEventHandler = await this.dependencyContainer.getAsync<any>(
        "StorageEventHandler"
      );

      // Setup tab event listeners
      if (tabEventHandler) {
        await tabEventHandler.setupListeners();
        this.registerCleanup(() => tabEventHandler.cleanup());
        console.log("[StartupManager] ✅ Tab event listeners setup");
      } else {
        console.warn("[StartupManager] ⚠️ TabEventHandler not available");
      }

      // Setup storage event listeners
      if (storageEventHandler) {
        await storageEventHandler.setupListeners();
        this.registerCleanup(() => storageEventHandler.cleanup());
        console.log("[StartupManager] ✅ Storage event listeners setup");
      } else {
        console.warn("[StartupManager] ⚠️ StorageEventHandler not available");
      }

      // Setup runtime message listener
      await this.setupRuntimeMessageListener();

      console.log("[StartupManager] ✅ All event listeners setup");
    } catch (error) {
      console.error(
        "[StartupManager] ❌ Failed to setup event listeners:",
        error
      );
      throw error;
    }
  }

  /**
   * Register cleanup callback
   */
  public registerCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Cleanup legacy data từ các version cũ
   */
  private async cleanupLegacyData(): Promise<void> {
    console.log("[StartupManager] 🧹 Cleaning up legacy data...");

    try {
      const browserAPI = this.getBrowserAPI();

      // Cleanup legacy storage keys
      const legacyKeys = [
        "wsStates",
        "wsMessages",
        "wsOutgoingMessage",
        "wsIncomingRequest",
        "wsConnection",
        "wsConnectionId",
        "wsPort",
        "wsUrl",
        "lastConnected",
      ];

      await new Promise<void>((resolve) => {
        browserAPI.storage.local.remove(legacyKeys, () => {
          console.log("[StartupManager] ✅ Legacy storage keys cleaned up");
          resolve();
        });
      });

      // Cleanup legacy API Provider URLs
      const result = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get(["apiProvider"], (data: any) => {
          resolve(data || {});
        });
      });

      if (result.apiProvider) {
        const legacyDomains = ["localhost:3030", "127.0.0.1:3030"];
        const currentProvider = String(result.apiProvider || "").toLowerCase();
        const isLegacy = legacyDomains.some((domain) =>
          currentProvider.includes(domain.toLowerCase())
        );

        if (isLegacy) {
          await new Promise<void>((resolve) => {
            browserAPI.storage.local.remove(["apiProvider"], () => {
              console.log("[StartupManager] ✅ Legacy API Provider removed");
              resolve();
            });
          });
        }
      }
    } catch (error) {
      console.error("[StartupManager] ❌ Legacy cleanup failed:", error);
      // Không throw error vì đây là cleanup operation
    }
  }

  /**
   * Initialize core managers
   */
  private async initializeCoreManagers(): Promise<void> {
    console.log("[StartupManager] 🏗️ Initializing core managers...");

    // Initialize Tab State Manager
    const tabStateManager = await this.dependencyContainer.getAsync<any>(
      "TabStateManager"
    );
    if (tabStateManager && tabStateManager.initialize) {
      await tabStateManager.initialize();
      this.registerCleanup(() => tabStateManager.cleanup());
      console.log("[StartupManager] ✅ TabStateManager initialized");
    }

    // Initialize Container Manager
    const containerManager = await this.dependencyContainer.getAsync<any>(
      "ContainerManager"
    );
    if (containerManager && containerManager.initializeContainers) {
      await containerManager.initializeContainers();
      console.log("[StartupManager] ✅ ContainerManager initialized");
    }

    // Initialize WebSocket Manager (connect if configured)
    const wsManager = await this.dependencyContainer.getAsync<any>("WSManager");
    if (wsManager) {
      // Note: WebSocket sẽ tự động connect khi cần
      console.log("[StartupManager] ✅ WSManager initialized");
    }

    // Initialize Tab Broadcaster
    const tabBroadcaster = await this.dependencyContainer.getAsync<any>(
      "TabBroadcaster"
    );
    if (tabBroadcaster) {
      console.log("[StartupManager] ✅ TabBroadcaster initialized");
    }
  }

  /**
   * Setup storage cleanup interval
   */
  private setupStorageCleanup(): void {
    console.log("[StartupManager] ⏰ Setting up storage cleanup interval...");

    // Cleanup old messages mỗi 5 phút
    const cleanupInterval = setInterval(async () => {
      try {
        const browserAPI = this.getBrowserAPI();

        // Cleanup messages older than 10 minutes
        const result = await new Promise<any>((resolve) => {
          browserAPI.storage.local.get(["wsMessages"], (data: any) => {
            resolve(data || {});
          });
        });

        const messages = result.wsMessages || {};
        const now = Date.now();
        let cleanedCount = 0;

        for (const [connectionId, msgArray] of Object.entries(messages)) {
          const msgs = msgArray as Array<{ timestamp: number; data: any }>;
          const recentMsgs = msgs.filter((msg) => {
            const age = now - msg.timestamp;
            return age < 600000; // 10 minutes
          });

          if (recentMsgs.length !== msgs.length) {
            messages[connectionId] = recentMsgs;
            cleanedCount += msgs.length - recentMsgs.length;
          }
        }

        if (cleanedCount > 0) {
          await new Promise<void>((resolve) => {
            browserAPI.storage.local.set({ wsMessages: messages }, () => {
              console.log(
                `[StartupManager] 🧹 Cleaned ${cleanedCount} old messages`
              );
              resolve();
            });
          });
        }
      } catch (error) {
        // Silent error handling
      }
    }, 300000); // 5 minutes

    // Register cleanup callback
    this.registerCleanup(async () => {
      clearInterval(cleanupInterval);
    });

    console.log("[StartupManager] ✅ Storage cleanup interval setup");
  }

  /**
   * Setup runtime message listener
   */
  private async setupRuntimeMessageListener(): Promise<void> {
    const messageHandler = await this.dependencyContainer.getAsync<any>(
      "MessageHandler"
    );
    const browserAPI = this.getBrowserAPI();

    if (!messageHandler || !browserAPI.runtime.onMessage) {
      return;
    }

    // Unified Message Listener
    browserAPI.runtime.onMessage.addListener(
      (message: any, sender: any, sendResponse: any) => {
        // Wrap async handler và return true ngay lập tức để giữ channel mở
        (async () => {
          try {
            await messageHandler.handleMessage(message, sender, sendResponse);
          } catch (error) {
            console.error("[StartupManager] ❌ Message handler error:", error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
        return true; // CRITICAL: Return true để giữ message channel mở cho async response
      }
    );

    console.log("[StartupManager] ✅ Runtime message listener setup");
  }

  /**
   * Notify UI về initial state sau khi startup
   */
  private async notifyUIInitialState(): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

      // Delay một chút để đảm bảo UI đã sẵn sàng
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await new Promise<void>((resolve) => {
        browserAPI.runtime.sendMessage(messagePayload, () => {
          if (browserAPI.runtime.lastError) {
            // Ignore no receivers error
            console.log(
              "[StartupManager] ⚠️ UI not ready to receive initial state"
            );
            resolve();
            return;
          }
          console.log(
            "[StartupManager] ✅ Initial state notification sent to UI"
          );
          resolve();
        });
      });
    } catch (error) {
      console.error(
        "[StartupManager] ❌ Error notifying UI initial state:",
        error
      );
    }
  }

  /**
   * Helper để lấy browser API
   */
  private getBrowserAPI(): any {
    if (typeof (globalThis as any).browser !== "undefined") {
      return (globalThis as any).browser;
    }
    if (typeof chrome !== "undefined") {
      return chrome;
    }
    throw new Error("No browser API available");
  }
}
