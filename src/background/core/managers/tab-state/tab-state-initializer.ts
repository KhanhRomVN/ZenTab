// src/background/core/managers/tab-state/tab-state-initializer.ts

import { TabStateCache } from "./tab-state-cache";
import { TabStateStorage } from "./tab-state-storage";
import { TabStateData } from "../../types/core/tab-state.types";

/**
 * Tab Initializer - Xử lý initialization của các tab mới
 */
export class TabStateInitializer {
  private initializationLocks: Map<number, Promise<void>> = new Map();
  private readonly INIT_TIMEOUT = 10000; // 10 seconds

  constructor(private cache: TabStateCache, private storage: TabStateStorage) {}

  /**
   * Setup tab event listeners
   */
  public async setupTabListeners(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    // Listen for new tabs created
    browserAPI.tabs.onCreated.addListener((tab: any) => {
      if (this.isAIChatTab(tab)) {
        // Wait for tab to fully load before initializing
        setTimeout(() => {
          this.initializeNewTab(tab.id);
        }, 2000);
      }
    });

    // Listen for tab URL changes
    browserAPI.tabs.onUpdated.addListener(
      (tabId: number, changeInfo: any, tab: any) => {
        if (changeInfo.status === "complete" && this.isAIChatTab(tab)) {
          // Check if tab already has state
          this.storage.getTabState(tabId).then((existingState) => {
            if (!existingState) {
              this.initializeNewTab(tabId);
            }
          });
        }
      }
    );

    // Listen for tab removal
    browserAPI.tabs.onRemoved.addListener((tabId: number) => {
      this.cache.delete(tabId);
      this.storage.removeTabState(tabId);
      this.initializationLocks.delete(tabId);
    });
  }

  /**
   * Initialize một tab mới
   */
  public async initializeNewTab(tabId: number): Promise<void> {
    // Check existing lock
    const existingLock = this.initializationLocks.get(tabId);
    if (existingLock) {
      try {
        await existingLock;

        // Check if state was initialized
        const existingState = await this.storage.getTabState(tabId);
        if (existingState) {
          return;
        }
      } catch (lockError) {
        console.error(
          `[TabStateInitializer] ❌ Lock wait error for tab ${tabId}:`,
          lockError
        );
      }
    }

    // Create new lock
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    this.initializationLocks.set(tabId, lockPromise);

    // Auto-cleanup lock sau timeout
    const timeoutId = setTimeout(() => {
      const lock = this.initializationLocks.get(tabId);
      if (lock === lockPromise) {
        console.warn(
          `[TabStateInitializer] ⚠️ Initialization lock timeout for tab ${tabId}`
        );
        this.initializationLocks.delete(tabId);
      }
    }, this.INIT_TIMEOUT);

    try {
      // Check if tab exists
      const tab = await this.getTabInfo(tabId);
      if (!tab) {
        console.warn(
          `[TabStateInitializer] ⚠️ Tab ${tabId} not found, aborting initialization`
        );
        return;
      }

      // Check if state already exists
      const existingState = await this.storage.getTabState(tabId);
      if (existingState) {
        this.cache.set(tabId, existingState);
        return;
      }

      // Determine initial status
      const initialStatus = await this.determineInitialStatus(tabId, tab);

      // Create new state
      const newState: TabStateData = {
        status: initialStatus,
        requestId: null,
        requestCount: 0,
        folderPath: null,
      };

      // Save to storage
      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
      }

      // Invalidate cache để force UI refresh
      this.cache.delete(tabId);
    } catch (error) {
      console.error(
        `[TabStateInitializer] ❌ Exception initializing tab ${tabId}:`,
        error
      );
    } finally {
      // Cleanup
      clearTimeout(timeoutId);
      this.initializationLocks.delete(tabId);
      resolveLock!();

      // Notify UI về tab mới
      await this.notifyUIUpdate();
    }
  }

  /**
   * Lấy thông tin tab
   */
  public async getTabInfo(tabId: number): Promise<any> {
    try {
      const browserAPI = this.getBrowserAPI();

      return await new Promise<any>((resolve, reject) => {
        browserAPI.tabs.get(tabId, (result: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(result);
        });
      });
    } catch (error) {
      console.error(
        `[TabStateInitializer] ❌ Error getting tab info ${tabId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Kiểm tra nếu tab là AI chat tab
   */
  public isAIChatTab(tab: any): boolean {
    const url = tab.url || tab.pendingUrl || "";
    const title = tab.title || "";

    return (
      url.includes("deepseek.com") ||
      url.includes("chatgpt.com") ||
      url.includes("openai.com") ||
      url.includes("aistudio.google.com/prompts") ||
      url.includes("grok.com") ||
      url.includes("claude.ai") ||
      title.includes("DeepSeek") ||
      title.includes("ChatGPT") ||
      title.includes("Gemini") ||
      title.includes("Grok") ||
      title.includes("Claude")
    );
  }

  /**
   * Kiểm tra nếu tab là sleep tab
   */
  private isSleepTab(tab: any): boolean {
    // Check discarded property
    if (tab.discarded === true) {
      return true;
    }

    // Check title có chứa sleep emoji
    const title = tab.title || "";
    if (title.includes("💤")) {
      return true;
    }

    return false;
  }

  /**
   * Xác định initial status của tab
   */
  private async determineInitialStatus(
    tabId: number,
    tab: any
  ): Promise<"free" | "busy" | "sleep"> {
    // Check sleep state trước
    if (this.isSleepTab(tab)) {
      return "sleep";
    }

    // Check button state để xác định status
    try {
      const isBusy = await this.checkButtonState(tabId);
      return isBusy ? "busy" : "free";
    } catch (error) {
      console.error(
        `[TabStateInitializer] ❌ Button check error for tab ${tabId}:`,
        error
      );
      return "free";
    }
  }

  /**
   * Kiểm tra button state
   */
  private async checkButtonState(tabId: number): Promise<boolean> {
    try {
      const browserAPI = this.getBrowserAPI();

      const scriptCode = `
        (function() {
          const sendButton = document.querySelector(".ds-icon-button._7436101");
          
          if (!sendButton) {
            return { isBusy: false, reason: "button_not_found" };
          }

          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";

          const isStopIcon = pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");
          const isSendIcon = pathData.includes("M8.3125 0.981648") && pathData.includes("9.2627 1.4338");

          if (isStopIcon) {
            return { isBusy: true, reason: "stop_icon_detected" };
          }

          return { isBusy: false, reason: "send_icon_or_not_found" };
        })();
      `;

      const result = await new Promise<any>((resolve, reject) => {
        browserAPI.tabs.executeScript(
          tabId,
          { code: scriptCode },
          (results?: any[]) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve(results);
          }
        );
      });

      const buttonState = (Array.isArray(result) && result[0]) || {
        isBusy: false,
        reason: "no_result",
      };

      return buttonState.isBusy;
    } catch (error) {
      return false;
    }
  }

  /**
   * Notify UI về tab state changes
   */
  private async notifyUIUpdate(): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

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
      // Silent error handling
    }
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
