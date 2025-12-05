// src/background/utils/browser/browser-api.ts

/**
 * Browser API Helper - Unified browser API interface
 */
export class BrowserAPI {
  private static instance: BrowserAPI;
  private api: any;

  private constructor() {
    this.api = this.getBrowserAPI();
  }

  public static getInstance(): BrowserAPI {
    if (!BrowserAPI.instance) {
      BrowserAPI.instance = new BrowserAPI();
    }
    return BrowserAPI.instance;
  }

  /**
   * Get browser API object
   */
  public getAPI(): any {
    return this.api;
  }

  /**
   * Check if running in Firefox
   */
  public isFirefox(): boolean {
    return typeof (globalThis as any).browser !== "undefined";
  }

  /**
   * Check if running in Chrome/Chromium
   */
  public isChrome(): boolean {
    return typeof chrome !== "undefined";
  }

  /**
   * Get runtime API
   */
  public get runtime(): any {
    return this.api.runtime;
  }

  /**
   * Get tabs API
   */
  public get tabs(): any {
    return this.api.tabs;
  }

  /**
   * Get storage API
   */
  public get storage(): any {
    return this.api.storage;
  }

  /**
   * Get contextual identities API (Firefox only)
   */
  public get contextualIdentities(): any {
    return this.api.contextualIdentities;
  }

  /**
   * Get scripting API (Chrome only)
   */
  public get scripting(): any {
    return this.api.scripting;
  }

  /**
   * Execute script in tab (cross-browser compatible)
   */
  public async executeScript(
    tabId: number,
    func: Function,
    args?: any[],
    scriptCode?: string
  ): Promise<any> {
    // Chrome/Chromium - use chrome.scripting
    if (this.scripting && this.scripting.executeScript) {
      const result = await this.scripting.executeScript({
        target: { tabId },
        func: func,
        args: args,
      });
      return result[0]?.result ?? null;
    }

    // Firefox - use browser.tabs.executeScript
    if (this.tabs && this.tabs.executeScript) {
      const funcString = args
        ? `(${func.toString()})(${args
            .map((arg) => JSON.stringify(arg))
            .join(", ")})`
        : `(${func.toString()})()`;

      const result = await this.tabs.executeScript(tabId, {
        code: funcString,
      });

      return result && result.length > 0 ? result[0] : null;
    }

    throw new Error("No script execution API available");
  }

  /**
   * Get tab information
   */
  public async getTab(tabId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.tabs.get(tabId, (result: any) => {
        if (this.runtime.lastError) {
          reject(this.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Query tabs
   */
  public async queryTabs(queryInfo: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.tabs.query(queryInfo, (results: any[]) => {
        if (this.runtime.lastError) {
          reject(this.runtime.lastError);
          return;
        }
        resolve(results || []);
      });
    });
  }

  /**
   * Send message to runtime
   */
  public async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.runtime.sendMessage(message, (response: any) => {
        if (this.runtime.lastError) {
          reject(this.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * Get storage value
   */
  public async getStorageValue<T = any>(
    key: string,
    area: "local" | "session" = "local"
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const storage =
        area === "local" ? this.storage.local : this.storage.session;

      storage.get([key], (result: any) => {
        if (this.runtime.lastError) {
          reject(this.runtime.lastError);
          return;
        }
        resolve(result[key] !== undefined ? result[key] : null);
      });
    });
  }

  /**
   * Set storage value
   */
  public async setStorageValue(
    key: string,
    value: any,
    area: "local" | "session" = "local"
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const storage =
        area === "local" ? this.storage.local : this.storage.session;

      storage.set({ [key]: value }, () => {
        if (this.runtime.lastError) {
          reject(this.runtime.lastError);
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

// Export singleton instance
export const browserAPI = BrowserAPI.getInstance();
