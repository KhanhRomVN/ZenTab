// src/background/bootstrap/service-registry.ts

import { DependencyContainer } from "./dependency-container";
import { TabStateManager } from "../core/managers/tab-state";
import { WSManager } from "../core/managers/websocket";
import { ContainerManager } from "../core/managers/container/container-manager";
import { StorageManager } from "../core/storage/storage-manager";
import { DeepSeekController } from "../ai-services/deepseek/controller";
import { TabEventHandler } from "../events/tab-events/tab-event-handler";
import { StorageChangeHandler } from "../events/storage-events/storage-change-handler";
import { MessageHandler } from "../core/messaging/message-handler";
import { TabBroadcaster } from "../core/managers/websocket/ws-broadcaster";

/**
 * Service Registry - Đăng ký tất cả services vào dependency container
 */
export class ServiceRegistry {
  private dependencyContainer: DependencyContainer;

  constructor(dependencyContainer: DependencyContainer) {
    this.dependencyContainer = dependencyContainer;
  }

  /**
   * Đăng ký tất cả services
   */
  public async registerAll(): Promise<void> {
    // Core Storage Services
    this.registerStorageServices();

    // Core Managers
    this.registerCoreManagers();

    // AI Services (lazy loaded khi cần)
    this.registerAIServices();

    // Utility Services
    this.registerUtilityServices();

    // Event Handlers
    this.registerEventHandlers();
  }

  /**
   * Đăng ký storage services
   */
  private registerStorageServices(): void {
    // Storage Manager (singleton)
    this.dependencyContainer.registerFactory("StorageManager", () => {
      return new StorageManager();
    });
  }

  /**
   * Đăng ký core managers
   */
  private registerCoreManagers(): void {
    // Tab State Manager (singleton)
    this.dependencyContainer.registerFactory("TabStateManager", () => {
      return TabStateManager.getInstance();
    });

    // WebSocket Manager (singleton)
    this.dependencyContainer.registerFactory("WSManager", () => {
      const storageManager =
        this.dependencyContainer.get<StorageManager>("StorageManager");
      if (!storageManager) {
        throw new Error("StorageManager not available for WSManager");
      }
      return new WSManager(storageManager);
    });

    // Tab Broadcaster (requires WSManager)
    this.dependencyContainer.registerFactory("TabBroadcaster", () => {
      const wsManager = this.dependencyContainer.get<WSManager>("WSManager");
      if (!wsManager) {
        throw new Error("WSManager not available for TabBroadcaster");
      }
      return new TabBroadcaster(wsManager);
    });

    // Container Manager
    this.dependencyContainer.registerFactory("ContainerManager", () => {
      const browserAPI = this.getBrowserAPI();
      return new ContainerManager(browserAPI);
    });

    // Message Handler
    this.dependencyContainer.registerFactory("MessageHandler", () => {
      const containerManager =
        this.dependencyContainer.get<ContainerManager>("ContainerManager");
      const tabStateManager =
        this.dependencyContainer.get<TabStateManager>("TabStateManager");
      const wsManager = this.dependencyContainer.get<WSManager>("WSManager");

      if (!containerManager || !tabStateManager || !wsManager) {
        throw new Error(
          "Required dependencies not available for MessageHandler"
        );
      }

      return new MessageHandler(containerManager, tabStateManager, wsManager);
    });
  }

  /**
   * Đăng ký AI services (lazy loaded)
   */
  private registerAIServices(): void {
    // DeepSeek Controller (lazy loaded)
    this.dependencyContainer.registerFactory("DeepSeekController", () => {
      return DeepSeekController;
    });

    // ChatGPT Controller (lazy loaded) - Commented out until implemented
    // this.dependencyContainer.registerFactory("ChatGPTController", () => {
    //   // Dynamic import để tránh circular dependencies
    //   return import("../ai-services/chatgpt/controller").then((module) => {
    //     return module.ChatGPTController;
    //   });
    // });
  }

  /**
   * Đăng ký utility services
   */
  private registerUtilityServices(): void {
    // Browser API Helper (factory)
    this.dependencyContainer.registerFactory("BrowserAPI", () => {
      return this.getBrowserAPI();
    });

    // Script Executor (depends on BrowserAPI) - Commented out until implemented
    // this.dependencyContainer.registerFactory("ScriptExecutor", () => {
    //   const browserAPI = this.dependencyContainer.get<any>("BrowserAPI");
    //   if (!browserAPI) {
    //     throw new Error("BrowserAPI not available for ScriptExecutor");
    //   }

    //   // Import và tạo instance
    //   return import("../utils/browser/script-executor").then((module) => {
    //     return new module.ScriptExecutor(browserAPI);
    //   });
    // });
  }

  /**
   * Đăng ký event handlers
   */
  private registerEventHandlers(): void {
    // Tab Event Handler
    this.dependencyContainer.registerFactory("TabEventHandler", () => {
      const tabStateManager =
        this.dependencyContainer.get<TabStateManager>("TabStateManager");
      if (!tabStateManager) {
        throw new Error("TabStateManager not available for TabEventHandler");
      }

      return new TabEventHandler(tabStateManager);
    });

    // Storage Event Handler
    this.dependencyContainer.registerFactory("StorageEventHandler", () => {
      const tabStateManager =
        this.dependencyContainer.get<TabStateManager>("TabStateManager");
      const wsManager = this.dependencyContainer.get<WSManager>("WSManager");

      if (!tabStateManager || !wsManager) {
        throw new Error(
          "Required dependencies not available for StorageEventHandler"
        );
      }

      return new StorageChangeHandler(tabStateManager);
    });
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

  /**
   * Get a specific service (helper method)
   */
  public getService<T>(serviceName: string): T | null {
    return this.dependencyContainer.get<T>(serviceName);
  }
}
