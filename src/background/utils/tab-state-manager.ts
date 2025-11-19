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
    console.log(
      "[TabStateManager] ✅ Starting tab state manager on extension load..."
    );
    this.isEnabled = true;

    console.log(
      "[TabStateManager] 🗑️  Clearing old tab states from session storage..."
    );
    await chrome.storage.session.set({ [this.STORAGE_KEY]: {} });

    console.log("[TabStateManager] 🔍 Starting tab scan and initialization...");
    await this.scanAndInitializeAllTabs();
    console.log(
      "[TabStateManager] ✅ Tab state manager fully enabled and ready"
    );
  }

  private async scanAndInitializeAllTabs(): Promise<void> {
    console.log("[TabStateManager] 🔍 Scanning all DeepSeek tabs...");

    let tabs: chrome.tabs.Tab[] = [];
    try {
      console.log(
        "[TabStateManager] 🔍 Step 1: Attempting chrome.tabs.query with URL patterns..."
      );

      // 🆕 FIX: Wrap query in Promise to handle both callback and Promise-based APIs
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
            console.log(
              `[TabStateManager] 🔍 Query callback received: ${
                queriedTabs?.length || 0
              } tabs`
            );
            resolve(queriedTabs || []);
          }
        );
      });

      tabs = Array.isArray(result) ? result : [];
      console.log(
        `[TabStateManager] ✅ Query successful: found ${tabs.length} DeepSeek tabs`
      );

      // 🆕 FIX: If no tabs found with patterns, try a broader query
      if (tabs.length === 0) {
        console.log(
          "[TabStateManager] 🔧 Step 2: Trying alternative tab discovery (query all tabs)..."
        );

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
              console.log(
                `[TabStateManager] 🔍 Alternative query callback received: ${
                  queriedTabs?.length || 0
                } tabs`
              );
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
        console.log(
          `[TabStateManager] 🔧 Alternative query found ${tabs.length} tabs`
        );
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

      // 🆕 FIX: Fallback to manual tab discovery
      try {
        console.log(
          "[TabStateManager] 🔧 Step 3: Attempting fallback query (all tabs)..."
        );

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
              console.log(
                `[TabStateManager] 🔍 Fallback query callback received: ${
                  queriedTabs?.length || 0
                } tabs`
              );
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
        console.log(`[TabStateManager] 🔧 Fallback found ${tabs.length} tabs`);
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

    console.log(
      `[TabStateManager] 📋 Starting initialization for ${tabs.length} tabs...`
    );

    const states: Record<number, TabStateData> = {};

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (!tab.id) {
        console.warn(
          `[TabStateManager] ⚠️  Tab at index ${i} has no ID, skipping...`
        );
        continue;
      }

      console.log(
        `[TabStateManager] [${i + 1}/${
          tabs.length
        }] Checking button state for tab ${tab.id} ("${tab.title?.substring(
          0,
          50
        )}...")...`
      );

      // 🆕 FIX: Add timeout and error handling for button state check
      try {
        const buttonState = await Promise.race([
          this.checkButtonState(tab.id),
          new Promise<{ isBusy: false }>((resolve) =>
            setTimeout(() => {
              console.warn(
                `[TabStateManager] ⏱️  Button check timeout for tab ${tab.id}`
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

        console.log(
          `[TabStateManager] [${i + 1}/${tabs.length}] Tab ${
            tab.id
          } initialized: status=${states[tab.id].status}, isBusy=${
            buttonState.isBusy
          }`
        );
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

    console.log("[TabStateManager] 💾 Saving tab states to session storage...");
    console.log(
      `[TabStateManager] 📊 States to save:`,
      JSON.stringify(states, null, 2)
    );

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
        console.log("[TabStateManager] ✅ States saved successfully");
        resolve();
      });
    });

    // 🆕 FIX: Add small delay to ensure storage is synced
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(
      `[TabStateManager] ✅ All ${
        Object.keys(states).length
      } tabs initialized successfully`
    );
  }

  private async checkButtonState(tabId: number): Promise<{ isBusy: boolean }> {
    try {
      console.log(`[TabStateManager]   → Executing script on tab ${tabId}...`);

      // 🆕 CRITICAL FIX: Use browser.tabs.executeScript for Firefox compatibility
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

          if (isStopIcon) {
            return { isBusy: true, reason: "stop_icon" };
          }

          if (isSendIcon) {
            const isDisabled = sendButton.classList.contains("ds-icon-button--disabled");
            return {
              isBusy: isDisabled,
              reason: isDisabled ? "send_icon_disabled" : "send_icon_enabled"
            };
          }

          return { isBusy: false, reason: "unknown_icon" };
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
            console.log(
              `[TabStateManager]   ✓ executeScript callback received for tab ${tabId}:`,
              results
            );
            resolve(results);
          }
        );
      });

      const buttonState = (Array.isArray(result) && result[0]) || {
        isBusy: false,
        reason: "no_result",
      };
      console.log(
        `[TabStateManager]   ✓ Tab ${tabId} button state: isBusy=${buttonState.isBusy}, reason=${buttonState.reason}`
      );

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
    console.log("[TabStateManager] getAllTabStates() called");

    // 🆕 FIX: Add small delay before reading to ensure storage is synced
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
        console.log(
          "[TabStateManager] 🔍 Session storage read callback:",
          data
        );
        resolve(data || {});
      });
    });

    const states = (result && result[this.STORAGE_KEY]) || {};

    console.log(
      "[TabStateManager] Current states from session storage:",
      Object.keys(states).length
    );
    console.log("[TabStateManager] 📊 States details:", states);

    let tabs: chrome.tabs.Tab[] = [];
    try {
      console.log(
        "[TabStateManager] 🔍 getAllTabStates: Step 1 - Querying with URL patterns..."
      );

      // 🆕 CRITICAL FIX: Wrap query in Promise for Firefox compatibility
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
            console.log(
              `[TabStateManager] 🔍 getAllTabStates query callback: ${
                queriedTabs?.length || 0
              } tabs`
            );
            resolve(queriedTabs || []);
          }
        );
      });

      tabs = Array.isArray(result) ? result : [];

      console.log(
        `[TabStateManager] 🔍 Query returned ${tabs.length} DeepSeek tabs`
      );

      // 🆕 FIX: Fallback if no tabs found
      if (tabs.length === 0) {
        console.log(
          "[TabStateManager] 🔧 getAllTabStates: Step 2 - Trying alternative discovery..."
        );

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
        console.log(
          `[TabStateManager] 🔧 Alternative found ${tabs.length} tabs`
        );
      }

      if (tabs.length > 0) {
        console.log(
          "[TabStateManager] 📋 Tab IDs:",
          tabs
            .map((t) => `${t.id} ("${t.title?.substring(0, 30)}...")`)
            .join(", ")
        );
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

      // 🆕 FIX: Fallback for getAllTabStates too
      try {
        console.log(
          "[TabStateManager] 🔧 getAllTabStates: Step 3 - Attempting fallback..."
        );

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
        console.log(`[TabStateManager] 🔧 Fallback found ${tabs.length} tabs`);
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

    console.log(`[TabStateManager] Found ${tabs.length} DeepSeek tabs`);

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

      console.log(
        `[TabStateManager] Tab ${tab.id}: status=${state.status}, canAccept=${canAccept}, lastUsed=${state.lastUsed}, requestCount=${state.requestCount}`
      );

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

    console.log(`[TabStateManager] Returning ${tabStates.length} tab states`);
    return tabStates;
  }

  /**
   * Kiểm tra tab có thể nhận request không
   */
  private canAcceptRequest(state: TabStateData): boolean {
    if (state.status !== "free") {
      return false;
    }

    const MIN_FREE_TIME = 2000;
    return Date.now() - state.lastUsed >= MIN_FREE_TIME;
  }

  /**
   * Đánh dấu tab bận - CHỈ được gọi từ monitorButtonStateUntilComplete
   */
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
      console.log(`[TabStateManager] Tab ${tabId} marked as BUSY`);
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
      console.log(`[TabStateManager] Tab ${tabId} marked as FREE`);
      return true;
    } catch (error) {
      console.error("[TabStateManager] Error marking tab free:", error);
      return false;
    }
  }

  /**
   * Lấy trạng thái của 1 tab cụ thể
   */
  public async getTabState(tabId: number): Promise<TabStateData | null> {
    const result = await chrome.storage.session.get([this.STORAGE_KEY]);
    const states = (result && result[this.STORAGE_KEY]) || {};
    return states[tabId] || null;
  }

  /**
   * Kiểm tra xem tab state manager có đang enabled không
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }
}

// Expose to global scope for non-module contexts
if (typeof globalThis !== "undefined") {
  (globalThis as any).TabStateManager = TabStateManager;
}
