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
   * Lấy service instance (sync) - chỉ dùng cho non-promise factories
   */
  public get<T>(serviceName: string): T | null {
    // Check nếu đã có instance
    if (this.services.has(serviceName)) {
      const instance = this.services.get(serviceName);
      // Nếu instance là Promise, trả về null và log warning
      if (instance && typeof instance.then === "function") {
        console.warn(
          `[DependencyContainer] ⚠️ Service ${serviceName} is a Promise. Use getAsync() instead.`
        );
        return null;
      }
      return instance as T;
    }

    // Check nếu có factory, tạo instance mới
    if (this.factories.has(serviceName)) {
      try {
        const factory = this.factories.get(serviceName)!;
        const instanceOrPromise = factory();

        // Nếu factory trả về Promise, lưu Promise và trả về null
        if (instanceOrPromise && typeof instanceOrPromise.then === "function") {
          console.warn(
            `[DependencyContainer] ⚠️ Factory ${serviceName} returned a Promise. Use getAsync() instead.`
          );
          // Lưu Promise để dùng sau
          this.services.set(serviceName, instanceOrPromise);
          return null;
        }

        this.services.set(serviceName, instanceOrPromise);

        console.log(
          `[DependencyContainer] 🔧 Created instance from factory: ${serviceName}`
        );
        return instanceOrPromise as T;
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
   * Lấy service instance async (hỗ trợ Promise factories)
   */
  public async getAsync<T>(serviceName: string): Promise<T | null> {
    // Check nếu đã có instance
    if (this.services.has(serviceName)) {
      const instance = this.services.get(serviceName);
      // Nếu instance là Promise, await nó
      if (instance && typeof instance.then === "function") {
        try {
          const resolved = await instance;
          // Cache the resolved instance
          this.services.set(serviceName, resolved);
          return resolved as T;
        } catch (error) {
          console.error(
            `[DependencyContainer] ❌ Failed to resolve Promise for ${serviceName}:`,
            error
          );
          return null;
        }
      }
      return instance as T;
    }

    // Check nếu có factory, tạo instance mới
    if (this.factories.has(serviceName)) {
      try {
        const factory = this.factories.get(serviceName)!;
        const instanceOrPromise = factory();

        // Nếu factory trả về Promise, await nó
        if (instanceOrPromise && typeof instanceOrPromise.then === "function") {
          try {
            const resolved = await instanceOrPromise;
            this.services.set(serviceName, resolved);
            console.log(
              `[DependencyContainer] 🔧 Created instance from async factory: ${serviceName}`
            );
            return resolved as T;
          } catch (error) {
            console.error(
              `[DependencyContainer] ❌ Failed to resolve async factory ${serviceName}:`,
              error
            );
            return null;
          }
        }

        this.services.set(serviceName, instanceOrPromise);
        console.log(
          `[DependencyContainer] 🔧 Created instance from factory: ${serviceName}`
        );
        return instanceOrPromise as T;
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
        const instanceOrPromise = factory();

        // Nếu factory trả về Promise, await nó
        if (instanceOrPromise && typeof instanceOrPromise.then === "function") {
          try {
            const resolved = await instanceOrPromise;
            this.services.set(serviceName, resolved);
            resolvedCount++;
            console.log(
              `[DependencyContainer] ✅ Resolved async: ${serviceName}`
            );
          } catch (error) {
            console.error(
              `[DependencyContainer] ❌ Failed to resolve async factory ${serviceName}:`,
              error
            );
          }
        } else {
          this.services.set(serviceName, instanceOrPromise);
          resolvedCount++;
          console.log(`[DependencyContainer] ✅ Resolved: ${serviceName}`);
        }
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
