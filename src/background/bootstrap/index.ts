// src/background/bootstrap/index.ts

import { DependencyContainer } from "./dependency-container";
import { ServiceRegistry } from "./service-registry";
import { StartupManager } from "./startup-manager";

/**
 * Bootstrap hệ thống - Entry point cho initialization
 */
export class Bootstrap {
  private static instance: Bootstrap;
  private dependencyContainer: DependencyContainer;
  private serviceRegistry: ServiceRegistry;
  private startupManager: StartupManager;

  private constructor() {
    this.dependencyContainer = new DependencyContainer();
    this.serviceRegistry = new ServiceRegistry(this.dependencyContainer);
    this.startupManager = new StartupManager(
      this.dependencyContainer,
      this.serviceRegistry
    );
  }

  public static getInstance(): Bootstrap {
    if (!Bootstrap.instance) {
      Bootstrap.instance = new Bootstrap();
    }
    return Bootstrap.instance;
  }

  /**
   * Khởi động toàn bộ hệ thống
   */
  public async initialize(): Promise<void> {
    console.log("[Bootstrap] 🚀 Initializing system...");

    try {
      // Step 1: Register tất cả dependencies
      await this.serviceRegistry.registerAll();

      // Step 2: Khởi động các core services
      await this.startupManager.startup();

      // Step 3: Setup event listeners
      await this.setupEventListeners();

      console.log(
        "[Bootstrap] ✅ System initialization completed successfully"
      );
    } catch (error) {
      console.error("[Bootstrap] ❌ System initialization failed:", error);
      throw error;
    }
  }

  /**
   * Cleanup khi extension bị disable/uninstall
   */
  public async cleanup(): Promise<void> {
    console.log("[Bootstrap] 🧹 Starting cleanup...");

    try {
      await this.startupManager.shutdown();
      this.dependencyContainer.clear();

      console.log("[Bootstrap] ✅ Cleanup completed successfully");
    } catch (error) {
      console.error("[Bootstrap] ❌ Cleanup failed:", error);
    }
  }

  /**
   * Lấy service từ dependency container
   */
  public getService<T>(serviceName: string): T | null {
    return this.dependencyContainer.get<T>(serviceName);
  }

  /**
   * Lấy tất cả registered services
   */
  public getAllServices(): Map<string, any> {
    return this.dependencyContainer.getAll();
  }

  private async setupEventListeners(): Promise<void> {
    // Setup các event listeners từ startup manager
    await this.startupManager.setupListeners();
  }
}

// Export singleton instance
export const bootstrap = Bootstrap.getInstance();
