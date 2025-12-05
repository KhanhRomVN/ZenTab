// src/background/core/storage/storage-manager.ts

/**
 * Storage Manager - Unified storage API với error handling
 */
export class StorageManager {
  private browserAPI: any;

  constructor() {
    this.browserAPI = this.getBrowserAPI();
  }

  /**
   * Get value từ storage
   */
  public async get<T = any>(key: string): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      this.browserAPI.storage.local.get([key], (result: any) => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve(result[key] !== undefined ? result[key] : null);
      });
    });
  }

  /**
   * Set value vào storage
   */
  public async set(key: string, value: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.browserAPI.storage.local.set({ [key]: value }, () => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Remove key từ storage
   */
  public async remove(keys: string | string[]): Promise<void> {
    const keysArray = Array.isArray(keys) ? keys : [keys];

    return new Promise<void>((resolve, reject) => {
      this.browserAPI.storage.local.remove(keysArray, () => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Lấy tất cả data từ storage
   */
  public async getAll(): Promise<Record<string, any>> {
    return new Promise<Record<string, any>>((resolve, reject) => {
      this.browserAPI.storage.local.get(null, (result: any) => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve(result || {});
      });
    });
  }

  /**
   * Xóa tất cả data từ storage
   */
  public async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.browserAPI.storage.local.clear(() => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Listen for storage changes
   */
  public onChange(callback: (changes: any, areaName: string) => void): void {
    this.browserAPI.storage.onChanged.addListener(callback);
  }

  /**
   * Remove storage change listener
   */
  public removeChangeListener(
    callback: (changes: any, areaName: string) => void
  ): void {
    this.browserAPI.storage.onChanged.removeListener(callback);
  }

  /**
   * Get session storage value
   */
  public async getSession<T = any>(key: string): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      this.browserAPI.storage.session.get([key], (result: any) => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve(result[key] !== undefined ? result[key] : null);
      });
    });
  }

  /**
   * Set session storage value
   */
  public async setSession(key: string, value: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.browserAPI.storage.session.set({ [key]: value }, () => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Remove session storage key
   */
  public async removeSession(keys: string | string[]): Promise<void> {
    const keysArray = Array.isArray(keys) ? keys : [keys];

    return new Promise<void>((resolve, reject) => {
      this.browserAPI.storage.session.remove(keysArray, () => {
        if (this.browserAPI.runtime.lastError) {
          reject(this.browserAPI.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

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
