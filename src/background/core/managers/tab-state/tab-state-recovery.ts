// src/background/core/managers/tab-state/tab-state-recovery.ts

import { TabStateCache } from "./tab-state-cache";
import { TabStateStorage } from "./tab-state-storage";

/**
 * Auto-recovery system cho stuck tabs
 */
export class TabStateRecovery {
  private recoveryInterval: NodeJS.Timeout | null = null;
  private readonly RECOVERY_INTERVAL = 10000; // 10 seconds
  private isRunning = false;

  constructor(private cache: TabStateCache, private storage: TabStateStorage) {}

  /**
   * Start auto recovery system
   */
  public async startAutoRecovery(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Chạy recovery ngay lập tức
    await this.recoverStuckTabs();

    // Setup interval
    this.recoveryInterval = setInterval(() => {
      this.recoverStuckTabs().catch((error) => {
        console.error("[TabStateRecovery] ❌ Auto recovery error:", error);
      });
    }, this.RECOVERY_INTERVAL);
  }

  /**
   * Stop auto recovery system
   */
  public stopAutoRecovery(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }

    this.isRunning = false;
  }

  /**
   * Recover stuck tabs
   */
  private async recoverStuckTabs(): Promise<void> {
    try {
      // Invalidate cache để lấy state mới nhất
      this.cache.invalidate();

      const states = await this.storage.getAllTabStates();
      let recoveredCount = 0;

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabId = parseInt(tabIdStr);

        if (state.status === "busy") {
          // Check button state để verify
          const isActuallyBusy = await this.checkButtonState(tabId);

          if (!isActuallyBusy) {
            // Tab không còn busy → mark as free
            const newState = {
              ...state,
              status: "free" as const,
              requestId: null,
            };

            const success = await this.storage.saveTabState(tabId, newState);
            if (success) {
              this.cache.set(tabId, newState);
              recoveredCount++;
            }
          }
        }
      }

      if (recoveredCount > 0) {
        // Notify UI về changes
        await this.notifyUIUpdate();
      }
    } catch (error) {
      console.error(
        "[TabStateRecovery] ❌ Error recovering stuck tabs:",
        error
      );
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
          if (!sendButton) return { isBusy: false };
          
          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";
          
          return { isBusy: pathData.includes("M2 4.88006") };
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
      };
      return buttonState.isBusy;
    } catch (error) {
      return false;
    }
  }

  /**
   * Notify UI về changes
   */
  private async notifyUIUpdate(): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

      await new Promise<void>((resolve, reject) => {
        browserAPI.runtime.sendMessage(messagePayload, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
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
