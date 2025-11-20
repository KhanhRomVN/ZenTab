export interface TabStateData {
  status: "free" | "busy";
  requestId: string | null;
  lastUsed: number;
  requestCount: number;
}

export interface TabStateInfo {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  status: "free" | "busy";
  canAccept: boolean;
  lastUsed: number;
  requestCount: number;
}

export class TabStateManager {
  private static instance: TabStateManager;
  private readonly STORAGE_KEY = "zenTabStates";
  private isEnabled = false;

  public static getInstance(): TabStateManager {
    if (!TabStateManager.instance) {
      TabStateManager.instance = new TabStateManager();
    }
    return TabStateManager.instance;
  }

  private constructor() {
    this.enable();
  }

  private async enable(): Promise<void> {
    this.isEnabled = true;
    await chrome.storage.session.set({ [this.STORAGE_KEY]: {} });

    await this.scanAndInitializeAllTabs();
  }

  private async scanAndInitializeAllTabs(): Promise<void> {
    let tabs: chrome.tabs.Tab[] = [];
    try {
      const result = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        chrome.tabs.query(
          {
            url: [
              "https://chat.deepseek.com/*",
              "https://*.deepseek.com/*",
              "*://chat.deepseek.com/*",
              "*://*.deepseek.com/*",
            ],
          },
          (queriedTabs) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[TabStateManager] ❌ Query error:",
                chrome.runtime.lastError
              );
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(queriedTabs || []);
          }
        );
      });

      tabs = Array.isArray(result) ? result : [];

      if (tabs.length === 0) {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "[TabStateManager] ❌ Alternative query error:",
                  chrome.runtime.lastError
                );
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(queriedTabs || []);
            });
          }
        );

        tabs = Array.isArray(allTabs)
          ? allTabs.filter(
              (tab) =>
                tab.url?.includes("deepseek.com") ||
                tab.title?.includes("DeepSeek") ||
                tab.url?.includes("deepseek")
            )
          : [];
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Error querying tabs:", error);
      console.error(
        "[TabStateManager] 🔍 Error type:",
        error instanceof Error ? error.constructor.name : typeof error
      );
      console.error(
        "[TabStateManager] 🔍 Error message:",
        error instanceof Error ? error.message : String(error)
      );

      try {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "[TabStateManager] ❌ Fallback query error:",
                  chrome.runtime.lastError
                );
                reject(chrome.runtime.lastError);
                return;
              }

              resolve(queriedTabs || []);
            });
          }
        );

        tabs = Array.isArray(allTabs)
          ? allTabs.filter(
              (tab) =>
                tab.url?.includes("deepseek") || tab.title?.includes("DeepSeek")
            )
          : [];
      } catch (fallbackError) {
        console.error(
          "[TabStateManager] ❌ Fallback also failed:",
          fallbackError
        );
        console.error(
          "[TabStateManager] 🔍 Fallback error type:",
          fallbackError instanceof Error
            ? fallbackError.constructor.name
            : typeof fallbackError
        );
        return;
      }
    }

    if (tabs.length === 0) {
      console.warn(
        "[TabStateManager] ⚠️  No DeepSeek tabs found to initialize"
      );
      return;
    }

    const states: Record<number, TabStateData> = {};

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (!tab.id) {
        console.warn(
          `[TabStateManager] ⚠️  Tab at index ${i} has no ID, skipping...`
        );
        continue;
      }

      try {
        const buttonState = await Promise.race([
          this.checkButtonState(tab.id),
          new Promise<{ isBusy: false }>((resolve) =>
            setTimeout(() => {
              console.warn(
                `[TabStateManager] ⏱️  Button check timeout for tab ${tab.id} - defaulting to FREE`
              );
              resolve({ isBusy: false });
            }, 3000)
          ),
        ]);

        states[tab.id] = {
          status: buttonState.isBusy ? "busy" : "free",
          requestId: null,
          lastUsed: Date.now(),
          requestCount: 0,
        };
      } catch (buttonError) {
        console.error(
          `[TabStateManager] ❌ Button check failed for tab ${tab.id}:`,
          buttonError
        );
        // Default to free state if check fails
        states[tab.id] = {
          status: "free",
          requestId: null,
          lastUsed: Date.now(),
          requestCount: 0,
        };
      }
    }

    await new Promise<void>((resolve, reject) => {
      chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[TabStateManager] ❌ Error saving states:",
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async checkButtonState(tabId: number): Promise<{ isBusy: boolean }> {
    try {
      const browserAPI = typeof browser !== "undefined" ? browser : chrome;

      // Script code as string for Firefox compatibility
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

          // 🔧 FIX: Chỉ coi là busy khi có STOP ICON (AI đang trả lời)
          // Send icon (dù enabled hay disabled) đều là trạng thái FREE
          if (isStopIcon) {
            return { isBusy: true, reason: "stop_icon_ai_responding" };
          }

          if (isSendIcon) {
            // Send icon = tab rảnh (không quan tâm disabled hay không)
            return { isBusy: false, reason: "send_icon_tab_free" };
          }

          // Không xác định được icon → mặc định free để tránh block tab
          return { isBusy: false, reason: "unknown_icon_assume_free" };
        })();
      `;

      const result = await new Promise<any>((resolve, reject) => {
        browserAPI.tabs.executeScript(
          tabId,
          { code: scriptCode },
          (results?: any[]) => {
            if (browserAPI.runtime.lastError) {
              console.error(
                `[TabStateManager]   ✗ executeScript error for tab ${tabId}:`,
                browserAPI.runtime.lastError
              );
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

      return { isBusy: buttonState.isBusy };
    } catch (error) {
      console.error(
        `[TabStateManager]   ✗ Error checking button state for tab ${tabId}:`,
        error
      );
      return { isBusy: false };
    }
  }

  public async getAllTabStates(): Promise<TabStateInfo[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await new Promise<any>((resolve, reject) => {
      chrome.storage.session.get([this.STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[TabStateManager] ❌ Error reading session storage:",
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(data || {});
      });
    });

    const states = (result && result[this.STORAGE_KEY]) || {};

    let tabs: chrome.tabs.Tab[] = [];
    try {
      const result = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        chrome.tabs.query(
          {
            url: [
              "https://chat.deepseek.com/*",
              "https://*.deepseek.com/*",
              "*://chat.deepseek.com/*",
              "*://*.deepseek.com/*",
            ],
          },
          (queriedTabs) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[TabStateManager] ❌ getAllTabStates query error:",
                chrome.runtime.lastError
              );
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(queriedTabs || []);
          }
        );
      });

      tabs = Array.isArray(result) ? result : [];

      if (tabs.length === 0) {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "[TabStateManager] ❌ getAllTabStates alternative query error:",
                  chrome.runtime.lastError
                );
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(queriedTabs || []);
            });
          }
        );

        tabs = Array.isArray(allTabs)
          ? allTabs.filter(
              (tab) =>
                tab.url?.includes("deepseek.com") ||
                tab.title?.includes("DeepSeek") ||
                tab.url?.includes("deepseek")
            )
          : [];
      }
    } catch (error) {
      console.error(
        "[TabStateManager] ❌ getAllTabStates error querying tabs:",
        error
      );
      console.error("[TabStateManager] 🔍 Error details:", {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      try {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "[TabStateManager] ❌ getAllTabStates fallback error:",
                  chrome.runtime.lastError
                );
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(queriedTabs || []);
            });
          }
        );

        tabs = Array.isArray(allTabs)
          ? allTabs.filter(
              (tab) =>
                tab.url?.includes("deepseek") || tab.title?.includes("DeepSeek")
            )
          : [];
      } catch (fallbackError) {
        console.error(
          "[TabStateManager] ❌ Fallback also failed:",
          fallbackError
        );
        console.error("[TabStateManager] 🔍 Fallback error details:", {
          type:
            fallbackError instanceof Error
              ? fallbackError.constructor.name
              : typeof fallbackError,
          message:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        });
        return [];
      }
    }
    if (tabs.length === 0) {
      console.warn(
        "[TabStateManager] ⚠️ No DeepSeek tabs found! Please open https://chat.deepseek.com first"
      );
      return [];
    }

    const tabStates = tabs.map((tab) => {
      const state = states[tab.id!] || {
        status: "free",
        lastUsed: 0,
        requestCount: 0,
      };
      const canAccept = this.canAcceptRequest(state);

      return {
        tabId: tab.id!,
        containerName: `Tab ${tab.id}`,
        title: tab.title || "Untitled",
        url: tab.url,
        status: state.status,
        canAccept: canAccept,
        lastUsed: state.lastUsed,
        requestCount: state.requestCount || 0,
      };
    });

    return tabStates;
  }

  private canAcceptRequest(state: TabStateData): boolean {
    if (state.status !== "free") {
      return false;
    }

    const MIN_FREE_TIME = 2000;
    return Date.now() - state.lastUsed >= MIN_FREE_TIME;
  }

  public async markTabBusy(tabId: number, requestId: string): Promise<boolean> {
    try {
      const result = await chrome.storage.session.get([this.STORAGE_KEY]);
      const states = (result && result[this.STORAGE_KEY]) || {};

      const currentState = states[tabId] || { requestCount: 0 };
      states[tabId] = {
        status: "busy",
        requestId: requestId,
        lastUsed: Date.now(),
        requestCount: (currentState.requestCount || 0) + 1,
      };

      await chrome.storage.session.set({ [this.STORAGE_KEY]: states });
      return true;
    } catch (error) {
      console.error("[TabStateManager] Error marking tab busy:", error);
      return false;
    }
  }

  /**
   * Đánh dấu tab rảnh - CHỈ được gọi từ monitorButtonStateUntilComplete
   */
  public async markTabFree(tabId: number): Promise<boolean> {
    try {
      const result = await chrome.storage.session.get([this.STORAGE_KEY]);
      const states = (result && result[this.STORAGE_KEY]) || {};

      const currentState = states[tabId] || { requestCount: 0 };
      states[tabId] = {
        status: "free",
        requestId: null,
        lastUsed: Date.now(),
        requestCount: currentState.requestCount || 0,
      };

      await chrome.storage.session.set({ [this.STORAGE_KEY]: states });
      return true;
    } catch (error) {
      console.error("[TabStateManager] Error marking tab free:", error);
      return false;
    }
  }

  public async getTabState(tabId: number): Promise<TabStateData | null> {
    const result = await chrome.storage.session.get([this.STORAGE_KEY]);
    const states = (result && result[this.STORAGE_KEY]) || {};
    return states[tabId] || null;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).TabStateManager = TabStateManager;
}
