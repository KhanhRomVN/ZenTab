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

    try {
      // Step 1: Cleanup legacy data
      await this.cleanupLegacyData();

      // Step 2: Resolve tất cả dependencies
      await this.dependencyContainer.resolveAll();

      // Step 3: Initialize core managers
      await this.initializeCoreManagers();

      // Step 4: Setup storage cleanup
      this.setupStorageCleanup();

      // Step 5: Mark as initialized BEFORE notifying UI
      // (listener sẽ được setup sau bởi Bootstrap.setupEventListeners())
      this.isInitialized = true;

      // Step 6: Notify UI về initial state
      // Delay một chút để đảm bảo listener đã ready
      setTimeout(async () => {
        await this.notifyUIInitialState();
      }, 200);
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
    } catch (error) {
      console.error("[StartupManager] ❌ System shutdown failed:", error);
      throw error;
    }
  }

  /**
   * Setup tất cả event listeners
   */
  public async setupListeners(): Promise<void> {
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
      } else {
        console.warn("[StartupManager] ⚠️ TabEventHandler not available");
      }

      // Setup storage event listeners
      if (storageEventHandler) {
        await storageEventHandler.setupListeners();
        this.registerCleanup(() => storageEventHandler.cleanup());
      } else {
        console.warn("[StartupManager] ⚠️ StorageEventHandler not available");
      }

      // Setup runtime message listener
      await this.setupRuntimeMessageListener();
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
    // Initialize Tab State Manager
    const tabStateManager = await this.dependencyContainer.getAsync<any>(
      "TabStateManager"
    );
    if (tabStateManager && tabStateManager.initialize) {
      await tabStateManager.initialize();
      this.registerCleanup(() => tabStateManager.cleanup());
    }

    // Initialize Container Manager
    const containerManager = await this.dependencyContainer.getAsync<any>(
      "ContainerManager"
    );
    if (containerManager && containerManager.initializeContainers) {
      await containerManager.initializeContainers();
    }

    // Initialize WebSocket Manager (connect if configured)
    const wsManager = await this.dependencyContainer.getAsync<any>("WSManager");
    if (wsManager) {
      // Note: WebSocket sẽ tự động connect khi cần
    }

    // Initialize Tab Broadcaster
    const tabBroadcaster = await this.dependencyContainer.getAsync<any>(
      "TabBroadcaster"
    );
    if (tabBroadcaster) {
    }
  }

  /**
   * Setup storage cleanup interval
   */
  private setupStorageCleanup(): void {
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
  }

  /**
   * Setup runtime message listener
   */
  private async setupRuntimeMessageListener(): Promise<void> {
    const messageHandler = await this.dependencyContainer.getAsync<any>(
      "MessageHandler"
    );
    const browserAPI = this.getBrowserAPI();

    if (!messageHandler) {
      console.error(
        "[StartupManager] ❌ MessageHandler not available - cannot setup listener"
      );
      return;
    }

    if (!browserAPI.runtime.onMessage) {
      console.error(
        "[StartupManager] ❌ runtime.onMessage not available - incompatible browser"
      );
      return;
    }

    console.log("[StartupManager] ✅ Setting up runtime message listener");

    // 🔥 FIX: Track if listener is ready
    let listenerReady = false;

    // Unified Message Listener
    browserAPI.runtime.onMessage.addListener(
      (message: any, sender: any, sendResponse: any) => {
        // 🔥 FIX: Immediately mark as ready and return true
        if (!listenerReady) {
          console.log("[StartupManager] 📡 Message listener is now ready");
          listenerReady = true;
        }

        try {
          // Wrap async handler
          (async () => {
            try {
              await messageHandler.handleMessage(message, sender, sendResponse);
            } catch (error) {
              console.error(
                "[StartupManager] ❌ Message handler error:",
                error
              );

              try {
                sendResponse({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                });
              } catch (responseError) {
                console.error(
                  "[StartupManager] ❌ Failed to send error response:",
                  responseError
                );
              }
            }
          })();
        } catch (syncError) {
          console.error(
            "[StartupManager] ❌ Sync error in message listener:",
            syncError
          );

          try {
            sendResponse({
              success: false,
              error:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          } catch (responseError) {
            console.error(
              "[StartupManager] ❌ Failed to send sync error response:",
              responseError
            );
          }
        }

        // CRITICAL: Always return true để giữ message channel mở
        return true;
      }
    );

    // 🔥 FIX: Đợi một chút để đảm bảo listener đã ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("[StartupManager] ✅ Runtime message listener setup complete");
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
            resolve();
            return;
          }
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
