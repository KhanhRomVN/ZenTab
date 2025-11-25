/**
 * 🔒 Simple Mutex Lock với auto-timeout để tránh deadlock
 */
class StorageMutex {
  private queue: Array<() => void> = [];
  private locked = false;
  private readonly LOCK_TIMEOUT = 5000; // 5 seconds max lock time
  private lockTimestamp: number = 0;

  async acquire(): Promise<void> {
    // 🆕 CRITICAL: Check for stale lock (deadlock prevention)
    if (this.locked && this.lockTimestamp > 0) {
      const lockAge = Date.now() - this.lockTimestamp;
      if (lockAge > this.LOCK_TIMEOUT) {
        console.error(
          `[StorageMutex] ⚠️ Detected stale lock (${lockAge}ms old), force releasing...`
        );
        this.forceRelease();
      }
    }

    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        this.lockTimestamp = Date.now();
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    this.lockTimestamp = 0;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.lockTimestamp = Date.now();
        next();
      }
    } else {
      this.locked = false;
    }
  }

  /**
   * 🆕 Force release lock (emergency deadlock recovery)
   */
  private forceRelease(): void {
    this.locked = false;
    this.lockTimestamp = 0;

    // Process all queued requests
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
        break; // Only process one, let others queue normally
      }
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
  private initializationLocks: Map<number, Promise<void>> = new Map();

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
    // 🔒 CRITICAL: Deduplicate initialization requests
    const existingLock = this.initializationLocks.get(tabId);
    if (existingLock) {
      await existingLock;
      return;
    }

    // Create new lock promise
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.initializationLocks.set(tabId, lockPromise);

    // 🆕 CRITICAL: Auto-cleanup lock sau 10 giây (timeout protection)
    const timeoutId = setTimeout(() => {
      const lock = this.initializationLocks.get(tabId);
      if (lock === lockPromise) {
        console.warn(
          `[TabStateManager] ⚠️ Initialization lock timeout for tab ${tabId}, force cleaning...`
        );
        this.initializationLocks.delete(tabId);
      }
    }, 10000);

    try {
      // Check if tab still exists
      const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
        chrome.tabs.get(tabId, (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result);
        });
      });

      if (!tab) {
        return;
      }

      // 🔒 CRITICAL: Check if state already exists (race condition protection)
      const existingStateCheck = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const existingStates =
        (existingStateCheck && existingStateCheck[this.STORAGE_KEY]) || {};
      if (existingStates[tabId]) {
        return;
      }

      // Kiểm tra sleep state trước
      const isSleepTab = this.isSleepTab(tab);

      let initialStatus: "free" | "busy" | "sleep" = "free";

      if (isSleepTab) {
        initialStatus = "sleep";
      } else {
        // Check button state to determine initial status
        let abortController: AbortController | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        try {
          abortController = new AbortController();

          const buttonCheckPromise = this.checkButtonState(
            tabId,
            abortController.signal
          );

          const timeoutPromise = new Promise<{ isBusy: false }>((resolve) => {
            timeoutId = setTimeout(() => {
              if (abortController) {
                abortController.abort();
              }
              resolve({ isBusy: false });
            }, 2000);
          });

          const buttonState = await Promise.race([
            buttonCheckPromise,
            timeoutPromise,
          ]);

          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          initialStatus = buttonState.isBusy ? "busy" : "free";
        } catch (error) {
          initialStatus = "free";
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          abortController = null;
        }
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

      // Verification
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
      verifyStates[tabId];

      // Invalidate cache to force UI refresh
      this.invalidateCache(tabId);

      // Notify UI about state change
      setTimeout(() => {
        this.notifyUIUpdate();

        setTimeout(() => {
          this.notifyUIUpdate();
        }, 2000);
      }, 100);
    } catch (error) {
      // Silent error handling
    } finally {
      // 🔓 CRITICAL: Release lock và cleanup timeout
      clearTimeout(timeoutId);
      this.initializationLocks.delete(tabId);
      resolveLock!();
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
      try {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
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
        return;
      }
    }

    if (tabs.length === 0) {
      return;
    }

    const states: Record<number, TabStateData> = {};

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (!tab.id) {
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

        // 🆕 CRITICAL: Sử dụng AbortController giống như initializeNewTab()
        let abortController: AbortController | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        try {
          abortController = new AbortController();

          const buttonCheckPromise = this.checkButtonState(
            tab.id,
            abortController.signal
          );

          const timeoutPromise = new Promise<{ isBusy: false }>((resolve) => {
            timeoutId = setTimeout(() => {
              if (abortController) {
                abortController.abort(); // ✅ Cancel button check
              }
              resolve({ isBusy: false });
            }, 2000);
          });

          const buttonState = await Promise.race([
            buttonCheckPromise,
            timeoutPromise,
          ]);

          // ✅ Cleanup timeout nếu button check win
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          const determinedStatus = buttonState.isBusy ? "busy" : "free";

          states[tab.id] = {
            status: determinedStatus,
            requestId: null,
            requestCount: 0,
            folderPath: null,
          };
        } finally {
          // ✅ Cleanup resources
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          abortController = null;
        }
      } catch (buttonError) {
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
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });

    // 🆕 VERIFICATION: Đọc lại từ storage để verify
    await new Promise<any>((resolve, reject) => {
      chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(data || {});
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private async checkButtonState(
    tabId: number,
    signal?: AbortSignal
  ): Promise<{ isBusy: boolean; uncertain?: boolean }> {
    const logPrefix = `[TabStateManager.checkButtonState(${tabId})]`;

    try {
      if (signal?.aborted) {
        console.log(`${logPrefix} ⏹️ Aborted before execution`);
        return { isBusy: false, uncertain: true };
      }

      console.log(`${logPrefix} 🔍 Starting button state check...`);

      const browserAPI =
        typeof (globalThis as any).browser !== "undefined"
          ? (globalThis as any).browser
          : chrome;

      const scriptCode = `
      (function() {
        const sendButton = document.querySelector(".ds-icon-button._7436101");
        
        if (!sendButton) {
          return { isBusy: false, reason: "button_not_found", uncertain: true };
        }

        const isButtonDisabled = 
          sendButton.hasAttribute("disabled") ||
          sendButton.getAttribute("aria-disabled") === "true" ||
          sendButton.classList.contains("ds-icon-button--disabled");

        const svg = sendButton.querySelector("svg");
        const path = svg?.querySelector("path");
        const pathData = path?.getAttribute("d") || "";

        const isStopIcon = pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");
        const isSendIcon = pathData.includes("M8.3125 0.981648") && pathData.includes("9.2627 1.4338");

        if (isStopIcon && !isButtonDisabled) {
          return { isBusy: true, reason: "stop_icon_ai_responding", uncertain: false };
        }

        if (isSendIcon || (isStopIcon && isButtonDisabled)) {
          return { isBusy: false, reason: "send_icon_or_disabled_stop_icon", uncertain: false };
        }

        return { isBusy: !isButtonDisabled, reason: "fallback_by_disabled_state", uncertain: true };
      })();
    `;

      const result = await new Promise<any>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("Aborted"));
          return;
        }

        browserAPI.tabs.executeScript(
          tabId,
          { code: scriptCode },
          (results?: any[]) => {
            if (signal?.aborted) {
              reject(new Error("Aborted"));
              return;
            }

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
        uncertain: true,
      };

      console.log(`${logPrefix} ✅ Button state checked:`, {
        isBusy: buttonState.isBusy,
        reason: buttonState.reason,
        uncertain: buttonState.uncertain,
        timestamp: Date.now(),
      });

      return {
        isBusy: buttonState.isBusy,
        uncertain: buttonState.uncertain || false,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "Aborted") {
        console.log(`${logPrefix} ⏹️ Check aborted`);
        return { isBusy: false, uncertain: true };
      }

      console.error(`${logPrefix} ❌ Error checking button state:`, error);
      // 🆕 CRITICAL: Return uncertain state instead of assuming "free"
      return { isBusy: false, uncertain: true };
    }
  }

  public async getAllTabStates(): Promise<TabStateInfo[]> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await new Promise<any>((resolve, reject) => {
      chrome.storage.session.get([this.STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
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
      try {
        const allTabs = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            chrome.tabs.query({}, (queriedTabs) => {
              if (chrome.runtime.lastError) {
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
        return [];
      }
    }
    if (tabs.length === 0) {
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
    const logPrefix = `[TabStateManager.markTabBusy(${tabId})]`;
    console.log(`${logPrefix} 🔄 Attempting to mark tab as BUSY...`, {
      requestId,
      timestamp: Date.now(),
    });

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

      console.log(`${logPrefix} 📊 Current state before update:`, {
        status: currentState.status,
        requestId: currentState.requestId,
        requestCount: currentState.requestCount,
        folderPath: currentState.folderPath,
      });

      // 🔥 CRITICAL: Preserve folderPath - use currentState.folderPath directly
      // KHÔNG dùng || null vì có thể gây mất dữ liệu
      states[tabId] = {
        status: "busy",
        requestId: requestId,
        requestCount: (currentState.requestCount || 0) + 1,
        folderPath: currentState.folderPath ?? null, // ✅ Dùng ?? thay vì ||
      };

      console.log(`${logPrefix} 📝 New state to save:`, states[tabId]);

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

      // 🔥 NEW: Verify state was saved correctly
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

      if (verifyState && verifyState.status === "busy") {
        this.invalidateCache(tabId);

        // 🔥 NEW: Notify UI immediately after marking BUSY
        this.notifyUIUpdate();

        console.log(`${logPrefix} ✅ Successfully marked tab as BUSY`);
        return true;
      } else {
        console.error(`${logPrefix} ❌ Verification failed - state mismatch!`);
        return false;
      }
    } catch (error) {
      console.error(`${logPrefix} ❌ Failed to mark tab as BUSY:`, error);
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
    const logPrefix = `[TabStateManager.markTabFree(${tabId})]`;
    console.log(`${logPrefix} 🔄 Attempting to mark tab as FREE...`, {
      timestamp: Date.now(),
    });

    try {
      // CRITICAL: ĐỌC state MỚI NHẤT từ storage (không dùng cache)
      console.log(
        `${logPrefix} 🔍 STEP 1: Reading current state from storage...`
      );
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Storage.get failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(
            `${logPrefix} ✅ Storage.get success, data keys:`,
            Object.keys(data || {})
          );
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      console.log(`${logPrefix} 📊 Current state before update:`, {
        status: currentState.status,
        requestId: currentState.requestId,
        requestCount: currentState.requestCount,
        folderPath: currentState.folderPath,
        allTabIds: Object.keys(states),
        timestamp: Date.now(),
      });

      console.log(`${logPrefix} 🔧 STEP 2: Preparing new state...`);
      states[tabId] = {
        status: "free",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: currentState.folderPath || null,
      };

      console.log(`${logPrefix} 📝 New state to save:`, {
        newState: states[tabId],
        timestamp: Date.now(),
      });

      console.log(`${logPrefix} 💾 STEP 3: Writing to storage...`);
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Storage.set failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(`${logPrefix} ✅ Storage.set success`);
          resolve();
        });
      });

      console.log(
        `${logPrefix} 💾 State saved to storage, invalidating cache...`
      );
      this.invalidateCache(tabId);
      console.log(`${logPrefix} ✅ Cache invalidated`);

      console.log(`${logPrefix} 🔍 STEP 4: Verifying saved state...`);
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Verification storage.get failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(`${logPrefix} ✅ Verification storage.get success`);
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      console.log(`${logPrefix} 📊 Verified state from storage:`, {
        verifyState,
        expectedStatus: "free",
        actualStatus: verifyState?.status,
        statusMatch: verifyState?.status === "free",
        timestamp: Date.now(),
      });

      if (verifyState && verifyState.status === "free") {
        console.log(`${logPrefix} ✅ Verification SUCCESS - notifying UI...`);
        console.log(`${logPrefix} 📢 STEP 5: Calling notifyUIUpdate()...`);
        this.notifyUIUpdate();
        console.log(`${logPrefix} ✅ notifyUIUpdate() called`);

        return true;
      } else {
        console.error(`${logPrefix} ❌ Verification FAILED - state mismatch!`, {
          expected: "free",
          actual: verifyState?.status,
          verifyStateExists: !!verifyState,
          verifyStateKeys: verifyState ? Object.keys(verifyState) : [],
          timestamp: Date.now(),
        });
        return false;
      }
    } catch (error) {
      console.error(`${logPrefix} ❌ Exception in markTabFree:`, error);
      console.error(`${logPrefix} 🔍 Exception details:`, {
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      });
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
        return false;
      }
    } catch (error) {
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
        return false;
      }

      if (currentState.status !== "sleep") {
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
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  public async markTabFreeWithFolder(
    tabId: number,
    folderPath: string | null
  ): Promise<boolean> {
    const logPrefix = `[TabStateManager.markTabFreeWithFolder(${tabId})]`;
    console.log(
      `${logPrefix} 🔄 Attempting to mark tab as FREE with folder...`,
      {
        folderPath,
        timestamp: Date.now(),
      }
    );

    // 🔥 CRITICAL: Use mutex lock to prevent race conditions
    await this.storageMutex.acquire();
    try {
      console.log(
        `${logPrefix} 🔍 STEP 1: Reading current state from storage...`
      );
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Storage.get failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(`${logPrefix} ✅ Storage.get success`);
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      const currentState = states[tabId] || {
        requestCount: 0,
        folderPath: null,
      };

      console.log(`${logPrefix} 📊 Current state before update:`, {
        status: currentState.status,
        requestId: currentState.requestId,
        requestCount: currentState.requestCount,
        currentFolderPath: currentState.folderPath,
        newFolderPath: folderPath,
        timestamp: Date.now(),
      });

      console.log(`${logPrefix} 🔧 STEP 2: Preparing new state...`);
      states[tabId] = {
        status: "free",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: folderPath,
      };

      console.log(`${logPrefix} 📝 New state to save:`, {
        newState: states[tabId],
        timestamp: Date.now(),
      });

      console.log(`${logPrefix} 💾 STEP 3: Writing to storage...`);
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Storage.set failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(`${logPrefix} ✅ Storage.set success`);
          resolve();
        });
      });

      console.log(`${logPrefix} 🔍 STEP 4: Verifying saved state...`);
      const verifyResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (chrome.runtime.lastError) {
            console.error(
              `${logPrefix} ❌ Verification storage.get failed:`,
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          console.log(`${logPrefix} ✅ Verification storage.get success`);
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const verifyState = verifyStates[tabId];

      console.log(`${logPrefix} 📊 Verified state from storage:`, {
        verifyState,
        expectedStatus: "free",
        expectedFolderPath: folderPath,
        actualStatus: verifyState?.status,
        actualFolderPath: verifyState?.folderPath,
        statusMatch: verifyState?.status === "free",
        folderPathMatch: verifyState?.folderPath === folderPath,
        timestamp: Date.now(),
      });

      if (
        verifyState &&
        verifyState.status === "free" &&
        verifyState.folderPath === folderPath
      ) {
        console.log(
          `${logPrefix} ✅ Verification SUCCESS - invalidating cache...`
        );
        this.invalidateCache(tabId);
        console.log(`${logPrefix} ✅ Cache invalidated`);

        console.log(`${logPrefix} 📢 STEP 5: Calling notifyUIUpdate()...`);
        this.notifyUIUpdate();
        console.log(`${logPrefix} ✅ notifyUIUpdate() called`);

        return true;
      } else {
        console.error(`${logPrefix} ❌ Verification FAILED - state mismatch!`, {
          expectedStatus: "free",
          expectedFolderPath: folderPath,
          actualStatus: verifyState?.status,
          actualFolderPath: verifyState?.folderPath,
          verifyStateExists: !!verifyState,
          timestamp: Date.now(),
        });
        return false;
      }
    } catch (error) {
      console.error(`${logPrefix} ❌ Exception in markTabFreeWithFolder:`, {
        error,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      });
      return false;
    } finally {
      // 🔓 CRITICAL: Release mutex lock
      this.storageMutex.release();
      console.log(`${logPrefix} 🔓 Mutex lock released`);
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
        return false;
      }
    } catch (error) {
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

      // 🆕 CRITICAL: Clear accumulated tokens for this folder
      try {
        // Dynamic import để tránh circular dependency
        const { PromptController } = await import(
          "../deepseek/prompt-controller"
        );
        await PromptController.clearTokensForFolder(folderPath);
      } catch (error) {
        // Silent error handling
      }

      return true;
    } catch (error) {
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
      // Silent error handling
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

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        const tabId = parseInt(tabIdStr);

        if (tabState.status === "busy") {
          const buttonState = await this.checkButtonState(tabId);
          if (!buttonState.isBusy) {
            const freeSuccess = await this.markTabFreeInternal(tabId);

            if (freeSuccess) {
              recoveredCount++;
            }
          }
        }
      }

      if (recoveredCount > 0) {
        this.notifyUIUpdate();
      }
    } catch (error) {
      // Silent error handling
    } finally {
      this.storageMutex.release();
    }
  }

  public async forceResetTab(tabId: number): Promise<boolean> {
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
      // Silent error handling
    }
  }

  private notifyUIUpdate(): void {
    const logPrefix = `[TabStateManager.notifyUIUpdate]`;
    console.log(`${logPrefix} 📢 Sending UI update notification...`, {
      timestamp: Date.now(),
    });

    try {
      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

      console.log(`${logPrefix} 📦 Message payload prepared:`, messagePayload);

      // 🆕 FIX: Handle both Promise and callback-based sendMessage
      console.log(`${logPrefix} 🚀 Calling chrome.runtime.sendMessage()...`);

      // Strategy: Use callback + Promise wrapper for reliability
      const sendWithCallback = () => {
        return new Promise<boolean>((resolve) => {
          chrome.runtime.sendMessage(messagePayload, (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                `${logPrefix} ⚠️ Callback received error:`,
                chrome.runtime.lastError
              );
              resolve(false);
              return;
            }
            console.log(`${logPrefix} ✅ Callback received success`);
            resolve(true);
          });
        });
      };

      // Try callback-based approach with timeout
      const timeoutMs = 1000;
      const sendPromise = Promise.race([
        sendWithCallback(),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), timeoutMs)
        ),
      ]);

      sendPromise
        .then((success) => {
          if (success) {
            console.log(`${logPrefix} ✅ UI notification sent successfully`, {
              timestamp: Date.now(),
            });
          } else {
            console.warn(
              `${logPrefix} ⚠️ First attempt failed or timed out, retrying...`,
              {
                timestamp: Date.now(),
              }
            );

            // Retry after short delay
            setTimeout(() => {
              console.log(`${logPrefix} 🔄 Executing retry attempt...`);
              const retryPromise = sendWithCallback();

              retryPromise
                .then((retrySuccess) => {
                  if (retrySuccess) {
                    console.log(
                      `${logPrefix} ✅ Retry notification sent successfully`,
                      {
                        timestamp: Date.now(),
                      }
                    );
                  } else {
                    console.error(`${logPrefix} ❌ Retry also failed`, {
                      timestamp: Date.now(),
                    });
                  }
                })
                .catch((retryError) => {
                  console.error(`${logPrefix} ❌ Retry exception:`, {
                    retryError,
                    errorType:
                      retryError instanceof Error
                        ? retryError.constructor.name
                        : typeof retryError,
                    errorMessage:
                      retryError instanceof Error
                        ? retryError.message
                        : String(retryError),
                    timestamp: Date.now(),
                  });
                });
            }, 500);
          }
        })
        .catch((error) => {
          console.error(`${logPrefix} ❌ Send promise rejected:`, {
            error,
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
        });
    } catch (error) {
      console.error(`${logPrefix} ❌ Exception in notifyUIUpdate:`, {
        error,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      });
    }
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).TabStateManager = TabStateManager;
}
