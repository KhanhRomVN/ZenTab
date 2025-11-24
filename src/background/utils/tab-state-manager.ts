/**
 * 🔒 Simple Mutex Lock để đảm bảo sequential access vào storage
 */
class StorageMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

export interface TabStateData {
  status: "free" | "busy" | "sleep";
  requestId: string | null;
  requestCount: number;
  folderPath?: string | null;
}

export interface TabStateInfo {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  status: "free" | "busy" | "sleep";
  canAccept: boolean;
  requestCount: number;
  folderPath?: string | null;
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

  private tabStateCache: Map<
    number,
    { state: TabStateData; timestamp: number }
  > = new Map();
  private readonly CACHE_TTL = 10000; // 10 seconds
  private readonly storageMutex = new StorageMutex();

  private constructor() {
    this.enable();
    this.startAutoRecovery();
    this.setupTabListeners();
  }

  private setupTabListeners(): void {
    // Listen for new tabs created
    chrome.tabs.onCreated.addListener((tab) => {
      if (
        tab.url?.includes("deepseek.com") ||
        tab.pendingUrl?.includes("deepseek.com")
      ) {
        // Wait for tab to fully load before initializing
        setTimeout(() => {
          this.initializeNewTab(tab.id!);
        }, 2000);
      }
    });

    // Listen for tab URL changes (when user navigates to DeepSeek)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (
        changeInfo.status === "complete" &&
        tab.url?.includes("deepseek.com")
      ) {
        // Đọc trực tiếp từ storage thay vì gọi getTabState() (tránh warn)
        chrome.storage.session.get([this.STORAGE_KEY], (result) => {
          const states = (result && result[this.STORAGE_KEY]) || {};
          const existingState = states[tabId];

          if (!existingState) {
            this.initializeNewTab(tabId);
          }
        });
      }
    });

    // Listen for tab removal (cleanup)
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.invalidateCache(tabId);
      this.removeTabState(tabId);
    });
  }

  /**
   * Kiểm tra xem tab có phải sleep tab không
   * Dựa vào:
   * 1. Tab bị discarded (tab.discarded === true)
   * 2. Title chứa emoji "💤" (do Auto Tab Discard extension thêm vào)
   */
  private isSleepTab(tab: chrome.tabs.Tab): boolean {
    // Check 1: Tab discarded property
    if (tab.discarded === true) {
      return true;
    }

    // Check 2: Title chứa "💤"
    const title = tab.title || "";
    if (title.includes("💤")) {
      return true;
    }

    return false;
  }

  private getCachedState(tabId: number): TabStateData | null {
    const cached = this.tabStateCache.get(tabId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.tabStateCache.delete(tabId);
      return null;
    }

    return cached.state;
  }

  private setCachedState(tabId: number, state: TabStateData): void {
    this.tabStateCache.set(tabId, {
      state: state,
      timestamp: Date.now(),
    });
  }

  private async initializeNewTab(tabId: number): Promise<void> {
    try {
      // Check if tab still exists
      const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
        chrome.tabs.get(tabId, (result) => {
          if (chrome.runtime.lastError) {
            console.warn(`[TabStateManager] ⚠️ Tab ${tabId} no longer exists`);
            resolve(null);
            return;
          }
          resolve(result);
        });
      });

      if (!tab) {
        return;
      }

      // Kiểm tra sleep state trước
      const isSleepTab = this.isSleepTab(tab);

      let initialStatus: "free" | "busy" | "sleep" = "free";

      if (isSleepTab) {
        initialStatus = "sleep";
      } else {
        // Check button state to determine initial status
        const buttonState = await Promise.race([
          this.checkButtonState(tabId),
          new Promise<{ isBusy: false }>((resolve) =>
            setTimeout(() => {
              console.warn(
                `[TabStateManager] ⏱️ Button check timeout for tab ${tabId}, assuming free`
              );
              resolve({ isBusy: false });
            }, 3000)
          ),
        ]);

        initialStatus = buttonState.isBusy ? "busy" : "free";
      }

      // Get current states
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};

      // Add new tab state
      states[tabId] = {
        status: initialStatus,
        requestId: null,
        requestCount: 0,
        folderPath: null,
      };

      // Save updated states
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // Invalidate cache to force UI refresh
      this.invalidateCache(tabId);

      // Notify UI about state change - với delay để đảm bảo storage đã sync
      setTimeout(() => {
        this.notifyUIUpdate();

        // Double check: Nếu UI vẫn chưa update sau 2s, force thêm 1 lần nữa
        setTimeout(() => {
          this.notifyUIUpdate();
        }, 2000);
      }, 100);
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Error initializing new tab ${tabId}:`,
        error
      );
    }
  }

  private invalidateCache(tabId?: number): void {
    if (tabId !== undefined) {
      this.tabStateCache.delete(tabId);
    } else {
      this.tabStateCache.clear();
    }
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
        // Kiểm tra sleep state TRƯỚC (dựa vào title hoặc discarded property)
        const isSleepTab = this.isSleepTab(tab);

        if (isSleepTab) {
          states[tab.id] = {
            status: "sleep",
            requestId: null,
            requestCount: 0,
            folderPath: null,
          };
          continue;
        }

        const buttonState = await Promise.race([
          this.checkButtonState(tab.id),
          new Promise<{ isBusy: false }>((resolve) =>
            setTimeout(() => {
              resolve({ isBusy: false });
            }, 2000)
          ),
        ]);

        states[tab.id] = {
          status: buttonState.isBusy ? "busy" : "free",
          requestId: null,
          requestCount: 0,
          folderPath: null,
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
          requestCount: 0,
          folderPath: null,
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
      const browserAPI =
        typeof (globalThis as any).browser !== "undefined"
          ? (globalThis as any).browser
          : chrome;

      // Script code as string for Firefox compatibility
      const scriptCode = `
        (function() {
          const sendButton = document.querySelector(".ds-icon-button._7436101");
          
          if (!sendButton) {
            return { isBusy: false, reason: "button_not_found" };
          }

          // ✅ NEW: Check button's disabled state AND aria-disabled
          const isButtonDisabled = 
            sendButton.hasAttribute("disabled") ||
            sendButton.getAttribute("aria-disabled") === "true" ||
            sendButton.classList.contains("ds-icon-button--disabled");

          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";

          const isStopIcon = pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");
          const isSendIcon = pathData.includes("M8.3125 0.981648") && pathData.includes("9.2627 1.4338");

          // ✅ CRITICAL: Stop icon + button NOT disabled = AI đang trả lời
          if (isStopIcon && !isButtonDisabled) {
            return { isBusy: true, reason: "stop_icon_ai_responding" };
          }

          // ✅ Send icon HOẶC Stop icon + button disabled = Tab rảnh
          if (isSendIcon || (isStopIcon && isButtonDisabled)) {
            return { isBusy: false, reason: "send_icon_or_disabled_stop_icon" };
          }

          // ✅ Fallback: Nếu không xác định được icon, check disabled state
          return { isBusy: !isButtonDisabled, reason: "fallback_by_disabled_state" };
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

    for (const [tabIdStr, state] of Object.entries(states)) {
      const tabId = parseInt(tabIdStr);
      this.setCachedState(tabId, state as TabStateData);
    }

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
        requestCount: 0,
        folderPath: null,
      };

      // Override status nếu phát hiện sleep tab (real-time check)
      const isSleepTab = this.isSleepTab(tab);
      const actualStatus = isSleepTab ? "sleep" : state.status;

      const canAccept = this.canAcceptRequest({
        ...state,
        status: actualStatus,
      });

      return {
        tabId: tab.id!,
        containerName: `Tab ${tab.id}`,
        title: tab.title || "Untitled",
        url: tab.url,
        status: actualStatus,
        canAccept: canAccept,
        requestCount: state.requestCount || 0,
        folderPath: state.folderPath || null,
      };
    });

    return tabStates;
  }

  private canAcceptRequest(state: TabStateData): boolean {
    // Tab chỉ có thể nhận request khi status là "free"
    // Status "busy" hoặc "sleep" đều KHÔNG thể nhận request
    if (state.status !== "free") {
      return false;
    }
    return true;
  }

  /**
   * 🔒 PUBLIC method with mutex lock
   */
  public async markTabBusy(tabId: number, requestId: string): Promise<boolean> {
    await this.storageMutex.acquire();
    try {
      return await this.markTabBusyInternal(tabId, requestId);
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * 🔓 INTERNAL method WITHOUT mutex
   */
  private async markTabBusyInternal(
    tabId: number,
    requestId: string
  ): Promise<boolean> {
    try {
      // 🔥 CRITICAL: Wrap storage.get() để đảm bảo async completion
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      // 🔥 CRITICAL: Preserve folderPath - use currentState.folderPath directly
      // KHÔNG dùng || null vì có thể gây mất dữ liệu
      states[tabId] = {
        status: "busy",
        requestId: requestId,
        requestCount: (currentState.requestCount || 0) + 1,
        folderPath: currentState.folderPath ?? null, // ✅ Dùng ?? thay vì ||
      };

      // 🔥 CRITICAL: Wrap storage.set() để đảm bảo async completion
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      this.invalidateCache(tabId);

      return true;
    } catch (error) {
      console.error("[TabStateManager] ❌ Error marking tab busy:", error);
      return false;
    }
  }

  /**
   * 🔒 PUBLIC method with mutex lock
   */
  public async markTabFree(tabId: number): Promise<boolean> {
    await this.storageMutex.acquire();
    try {
      return await this.markTabFreeInternal(tabId);
    } finally {
      this.storageMutex.release();
    }
  }

  private async markTabFreeInternal(tabId: number): Promise<boolean> {
    try {
      // CRITICAL: ĐỌC state MỚI NHẤT từ storage (không dùng cache)
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      states[tabId] = {
        status: "free",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: currentState.folderPath || null,
      };

      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `[TabStateManager] ❌ storage.set error for tab ${tabId}:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      this.invalidateCache(tabId);

      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      if (verifyState && verifyState.status === "free") {
        this.notifyUIUpdate();

        return true;
      } else {
        console.error(
          `[TabStateManager] ❌ Verification FAILED for tab ${tabId}! Expected status=free, got status=${
            verifyState?.status || "unknown"
          }`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ EXCEPTION in markTabFreeInternal for tab ${tabId}:`,
        error
      );
      return false;
    }
  }

  public async markTabSleep(tabId: number): Promise<boolean> {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      // Set status = "sleep", giữ nguyên các field khác
      states[tabId] = {
        status: "sleep",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: currentState.folderPath || null,
      };

      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      this.invalidateCache(tabId);

      // VERIFY: Đọc lại state để đảm bảo đã save đúng
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      if (verifyState && verifyState.status === "sleep") {
        this.notifyUIUpdate();
        return true;
      } else {
        console.error(
          `[TabStateManager] ❌ Verification failed! Tab ${tabId} status: ${
            verifyState?.status || "unknown"
          }`
        );
        return false;
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Error marking tab sleep:", error);
      return false;
    }
  }

  public async wakeUpTab(tabId: number): Promise<boolean> {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId];

      if (!currentState) {
        console.warn(
          `[TabStateManager] ⚠️ Tab ${tabId} state not found, cannot wake up`
        );
        return false;
      }

      // Chỉ wake up nếu tab đang sleep
      if (currentState.status !== "sleep") {
        console.warn(
          `[TabStateManager] ⚠️ Tab ${tabId} is not sleeping (status: ${currentState.status})`
        );
        return false;
      }

      // Set status = "free"
      states[tabId] = {
        ...currentState,
        status: "free",
        requestId: null,
      };

      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      this.invalidateCache(tabId);

      // 🔥 FIX: Verify phải check status === "free", KHÔNG PHẢI "sleep"!
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      // ✅ ĐÚNG: Sau khi wake up, status phải là "free"
      if (verifyState && verifyState.status === "free") {
        this.notifyUIUpdate();
        return true;
      } else {
        console.error(
          `[TabStateManager] ❌ Verification failed! Tab ${tabId} status: ${
            verifyState?.status || "unknown"
          }`
        );
        return false;
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Error waking up tab:", error);
      return false;
    }
  }

  public async markTabFreeWithFolder(
    tabId: number,
    folderPath: string | null
  ): Promise<boolean> {
    try {
      // 🔥 ATOMIC OPERATION: Đọc → Update → Ghi trong 1 lần
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      // 🔥 CRITICAL: Update BOTH status and folderPath atomically
      states[tabId] = {
        status: "free",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: folderPath, // Use provided folderPath (not from currentState)
      };

      // 🔥 CRITICAL: Single write operation
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // 🔥 CRITICAL: Verify
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      if (
        verifyState &&
        verifyState.status === "free" &&
        verifyState.folderPath === folderPath
      ) {
        this.invalidateCache(tabId);
        return true;
      } else {
        console.error(
          `[TabStateManager] ❌ Atomic operation verification failed!`
        );
        console.error(
          `[TabStateManager] 🔍 Expected: status=free, folderPath=${folderPath}`
        );
        console.error(
          `[TabStateManager] 🔍 Got: status=${
            verifyState?.status || "unknown"
          }, folderPath=${verifyState?.folderPath || "null"}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Error in markTabFreeWithFolder:`,
        error
      );
      return false;
    }
  }

  public async linkTabToFolder(
    tabId: number,
    folderPath: string
  ): Promise<boolean> {
    try {
      // 🔥 CRITICAL: ĐỢI storage.get() hoàn thành TRƯỚC KHI đọc states
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        status: "free",
        requestCount: 0,
        requestId: null,
        folderPath: null,
      };

      states[tabId] = {
        ...currentState,
        folderPath: folderPath,
      };

      // 🔥 CRITICAL: Đợi storage.set() hoàn thành VÀ verify
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // 🔥 CRITICAL: Verify data đã được ghi thành công
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      if (verifyState && verifyState.folderPath === folderPath) {
        this.invalidateCache(tabId);
        return true;
      } else {
        console.error(
          `[TabStateManager] ❌ Verification failed! Expected folderPath: ${folderPath}, got: ${
            verifyState?.folderPath || "null"
          }`
        );
        console.error(
          `[TabStateManager] 🔍 Full verify state:`,
          JSON.stringify(verifyState, null, 2)
        );
        return false;
      }
    } catch (error) {
      console.error(`[TabStateManager] ❌ Error linking tab to folder:`, error);
      return false;
    }
  }

  public async unlinkFolder(folderPath: string): Promise<boolean> {
    try {
      const result = await chrome.storage.session.get([this.STORAGE_KEY]);
      const states = (result && result[this.STORAGE_KEY]) || {};

      let unlinkedCount = 0;
      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        if (tabState.folderPath === folderPath) {
          const tabId = parseInt(tabIdStr);
          states[tabId] = {
            ...tabState,
            folderPath: null,
          };
          this.invalidateCache(tabId);
          unlinkedCount++;
        }
      }

      if (unlinkedCount > 0) {
        await chrome.storage.session.set({ [this.STORAGE_KEY]: states });
      }

      return true;
    } catch (error) {
      console.error(`[TabStateManager] ❌ Error unlinking folder:`, error);
      return false;
    }
  }

  public async getTabsByFolder(folderPath: string): Promise<TabStateInfo[]> {
    try {
      const allTabs = await this.getAllTabStates();
      const matchingTabs = allTabs.filter(
        (tab) =>
          tab.folderPath === folderPath &&
          tab.status === "free" &&
          tab.canAccept
      );

      return matchingTabs;
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Error getting tabs by folder:`,
        error
      );
      return [];
    }
  }

  public async getTabState(tabId: number): Promise<TabStateData | null> {
    const cachedState = this.getCachedState(tabId);
    if (cachedState) {
      return cachedState;
    }

    const result = await chrome.storage.session.get([this.STORAGE_KEY]);
    const states = (result && result[this.STORAGE_KEY]) || {};
    const state = states[tabId] || null;

    if (state) {
      this.setCachedState(tabId, state);
      return state;
    }

    // Kiểm tra xem tab có phải DeepSeek tab không TRƯỚC KHI warn
    try {
      const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
        chrome.tabs.get(tabId, (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result);
        });
      });

      // Nếu KHÔNG PHẢI DeepSeek tab → return null ngay (không warn)
      if (!tab || !tab.url?.includes("deepseek.com")) {
        return null;
      }

      await this.initializeNewTab(tabId);

      // Retry đọc state sau khi init
      const retryResult = await chrome.storage.session.get([this.STORAGE_KEY]);
      const retryStates = (retryResult && retryResult[this.STORAGE_KEY]) || {};
      const retryState = retryStates[tabId] || null;

      if (retryState) {
        this.setCachedState(tabId, retryState);
        return retryState;
      }
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Error in getTabState fallback for tab ${tabId}:`,
        error
      );
    }

    return null;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  private startAutoRecovery(): void {
    setInterval(async () => {
      await this.autoRecoverStuckTabs();
    }, 10000); // Run every 10 seconds
  }

  private async autoRecoverStuckTabs(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    this.invalidateCache();

    await this.storageMutex.acquire();

    try {
      const result = await chrome.storage.session.get([this.STORAGE_KEY]);
      const states = (result && result[this.STORAGE_KEY]) || {};

      let recoveredCount = 0;
      let busyTabsFound = 0;

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        const tabId = parseInt(tabIdStr);

        if (tabState.status === "busy") {
          busyTabsFound++;
          const buttonState = await this.checkButtonState(tabId);
          if (!buttonState.isBusy) {
            console.warn(
              `[TabStateManager] 🔧 Auto-recovering stuck tab ${tabId} (button shows AI finished)`
            );

            const freeSuccess = await this.markTabFreeInternal(tabId);

            if (freeSuccess) {
              recoveredCount++;
            } else {
              console.error(
                `[TabStateManager] ❌ Failed to mark tab ${tabId} FREE`
              );
            }
          }
        }
      }

      if (recoveredCount > 0) {
        this.notifyUIUpdate();
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Error in auto-recovery:", error);
    } finally {
      this.storageMutex.release();
    }
  }

  public async forceResetTab(tabId: number): Promise<boolean> {
    console.warn(`[TabStateManager] 🔧 Force resetting tab ${tabId}`);
    this.invalidateCache(tabId);
    return await this.markTabFree(tabId);
  }

  private async removeTabState(tabId: number): Promise<void> {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};

      if (states[tabId]) {
        delete states[tabId];

        await new Promise<void>((resolve, reject) => {
          chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve();
          });
        });

        this.notifyUIUpdate();
      }
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Error removing tab state ${tabId}:`,
        error
      );
    }
  }

  private notifyUIUpdate(): void {
    try {
      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

      // Send message to UI to refresh tab list
      const promise = chrome.runtime.sendMessage(messagePayload);

      if (promise && typeof promise.catch === "function") {
        promise
          .then(() => {})
          .catch((error) => {
            console.warn(
              "[TabStateManager] ⚠️ Failed to send tabsUpdated message (no receivers?):",
              error
            );
            console.warn(
              `[TabStateManager] 🔍 Error type: ${typeof error}, message: ${
                error?.message || String(error)
              }`
            );

            // Retry after short delay (UI might still be initializing)
            setTimeout(() => {
              try {
                const retryPromise = chrome.runtime.sendMessage({
                  action: "tabsUpdated",
                  timestamp: Date.now(),
                  retry: true,
                });

                if (retryPromise && typeof retryPromise.catch === "function") {
                  retryPromise
                    .then(() => {})
                    .catch((retryError) => {
                      console.warn(
                        "[TabStateManager] ⚠️ Retry also failed, UI might not be ready"
                      );
                      console.warn(
                        `[TabStateManager] 🔍 Retry error: ${
                          retryError?.message || String(retryError)
                        }`
                      );
                    });
                }
              } catch (retryError) {
                console.error(
                  `[TabStateManager] ❌ Exception during retry:`,
                  retryError
                );
              }
            }, 500);
          });
      } else {
        console.warn(
          `[TabStateManager] ⚠️ sendMessage returned non-Promise value:`,
          promise
        );
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Exception in notifyUIUpdate:", error);
      console.error(
        `[TabStateManager] 🔍 Exception type: ${typeof error}, message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).TabStateManager = TabStateManager;
}
