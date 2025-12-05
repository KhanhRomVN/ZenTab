// src/background/bootstrap/dependency-container.ts

/**
 * Dependency Injection Container đơn giản
 */
export class DependencyContainer {
  private services: Map<string, any> = new Map();
  private factories: Map<string, () => any> = new Map();

  /**
   * Register một service instance
   */
  public register<T>(serviceName: string, instance: T): void {
    if (this.services.has(serviceName)) {
      console.warn(
        `[DependencyContainer] ⚠️ Overwriting existing service: ${serviceName}`
      );
    }

    this.services.set(serviceName, instance);
    console.log(`[DependencyContainer] ✅ Registered service: ${serviceName}`);
  }

  /**
   * Register một factory function (lazy loading)
   */
  public registerFactory<T>(serviceName: string, factory: () => T): void {
    if (this.factories.has(serviceName)) {
      console.warn(
        `[DependencyContainer] ⚠️ Overwriting existing factory: ${serviceName}`
      );
    }

    this.factories.set(serviceName, factory);
    console.log(`[DependencyContainer] ✅ Registered factory: ${serviceName}`);
  }

  /**
   * Lấy service instance
   */
  public get<T>(serviceName: string): T | null {
    // Check nếu đã có instance
    if (this.services.has(serviceName)) {
      return this.services.get(serviceName) as T;
    }

    // Check nếu có factory, tạo instance mới
    if (this.factories.has(serviceName)) {
      try {
        const factory = this.factories.get(serviceName)!;
        const instance = factory();
        this.services.set(serviceName, instance);

        console.log(
          `[DependencyContainer] 🔧 Created instance from factory: ${serviceName}`
        );
        return instance as T;
      } catch (error) {
        console.error(
          `[DependencyContainer] ❌ Failed to create instance from factory ${serviceName}:`,
          error
        );
        return null;
      }
    }

    console.error(`[DependencyContainer] ❌ Service not found: ${serviceName}`);
    return null;
  }

  /**
   * Resolve tất cả dependencies (tạo instances từ tất cả factories)
   */
  public async resolveAll(): Promise<void> {
    console.log(`[DependencyContainer] 🔧 Resolving all dependencies...`);

    const factoryNames = Array.from(this.factories.keys());
    let resolvedCount = 0;

    for (const serviceName of factoryNames) {
      try {
        // Skip nếu đã có instance
        if (this.services.has(serviceName)) {
          continue;
        }

        const factory = this.factories.get(serviceName)!;
        const instance = factory();
        this.services.set(serviceName, instance);
        resolvedCount++;

        console.log(`[DependencyContainer] ✅ Resolved: ${serviceName}`);
      } catch (error) {
        console.error(
          `[DependencyContainer] ❌ Failed to resolve ${serviceName}:`,
          error
        );
      }
    }

    console.log(
      `[DependencyContainer] ✅ Resolved ${resolvedCount}/${factoryNames.length} dependencies`
    );
  }

  /**
   * Kiểm tra service có tồn tại không
   */
  public has(serviceName: string): boolean {
    return this.services.has(serviceName) || this.factories.has(serviceName);
  }

  /**
   * Lấy tất cả registered services
   */
  public getAll(): Map<string, any> {
    // Ensure all factories are resolved
    this.resolveAll().catch((error) => {
      console.error("[DependencyContainer] ❌ Error resolving all:", error);
    });

    return new Map(this.services);
  }

  /**
   * Xóa một service
   */
  public remove(serviceName: string): boolean {
    const hadService = this.services.delete(serviceName);
    const hadFactory = this.factories.delete(serviceName);

    if (hadService || hadFactory) {
      console.log(`[DependencyContainer] 🗑️ Removed service: ${serviceName}`);
    }

    return hadService || hadFactory;
  }

  /**
   * Xóa tất cả services
   */
  public clear(): void {
    const serviceCount = this.services.size;
    const factoryCount = this.factories.size;

    this.services.clear();
    this.factories.clear();

    console.log(
      `[DependencyContainer] 🧹 Cleared all services (${serviceCount} services, ${factoryCount} factories)`
    );
  }

  /**
   * Get service names for debugging
   */
  public getServiceNames(): { services: string[]; factories: string[] } {
    return {
      services: Array.from(this.services.keys()),
      factories: Array.from(this.factories.keys()),
    };
  }
}
