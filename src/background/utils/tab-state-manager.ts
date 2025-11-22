export interface TabStateData {
  status: "free" | "busy";
  requestId: string | null;
  requestCount: number;
  folderPath?: string | null;
}

export interface TabStateInfo {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  status: "free" | "busy";
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

  private constructor() {
    this.enable();
    this.startAutoRecovery();
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
      const canAccept = this.canAcceptRequest(state);

      console.log(
        `[TabStateManager] 📊 Tab ${tab.id} state: status=${
          state.status
        }, folderPath=${state.folderPath || "null"}, canAccept=${canAccept}`
      );

      return {
        tabId: tab.id!,
        containerName: `Tab ${tab.id}`,
        title: tab.title || "Untitled",
        url: tab.url,
        status: state.status,
        canAccept: canAccept,
        requestCount: state.requestCount || 0,
        folderPath: state.folderPath || null,
      };
    });

    return tabStates;
  }

  private canAcceptRequest(state: TabStateData): boolean {
    if (state.status !== "free") {
      return false;
    }

    return true;
  }

  public async markTabBusy(tabId: number, requestId: string): Promise<boolean> {
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

      // 🆕 DEBUG: Log current state BEFORE marking busy
      console.log(
        `[TabStateManager] 🔍 markTabBusy - BEFORE update: tabId=${tabId}, currentState=`,
        JSON.stringify(currentState, null, 2)
      );

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

      console.log(
        `[TabStateManager] ✅ Tab ${tabId} marked BUSY, folderPath preserved: ${
          currentState.folderPath ?? "null"
        }`
      );

      return true;
    } catch (error) {
      console.error("[TabStateManager] ❌ Error marking tab busy:", error);
      return false;
    }
  }

  public async markTabFree(tabId: number): Promise<boolean> {
    try {
      // 🆕 CRITICAL: ĐỌC state MỚI NHẤT từ storage (không dùng cache)
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

      // 🆕 DEBUG: Log state BEFORE update
      console.log(
        `[TabStateManager] 🔍 markTabFree - BEFORE update: tabId=${tabId}, currentState=`,
        JSON.stringify(currentState, null, 2)
      );

      // 🔥 QUAN TRỌNG: GIỮ NGUYÊN folderPath từ storage (KHÔNG PHẢI từ cache)
      states[tabId] = {
        status: "free",
        requestId: null,
        requestCount: currentState.requestCount || 0,
        folderPath: currentState.folderPath || null, // ✅ Từ storage, KHÔNG phải cache
      };

      // 🔥 CRITICAL: Wrap storage.set in Promise để đảm bảo async/await
      await new Promise<void>((resolve, reject) => {
        chrome.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // 🆕 CRITICAL: Verify write success
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

      // 🆕 CRITICAL: Invalidate cache SAU KHI đã save (để force đọc lại storage lần sau)
      this.invalidateCache(tabId);

      console.log(
        `[TabStateManager] ✅ Tab ${tabId} marked FREE, folderPath preserved: ${
          currentState.folderPath || "null"
        } (verified: ${verifyState?.folderPath || "null"})`
      );

      return true;
    } catch (error) {
      console.error("[TabStateManager] ❌ Error marking tab free:", error);
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
        console.log(
          `[TabStateManager] ✅ Tab ${tabId} marked FREE with folderPath: ${
            folderPath || "null"
          } (atomic operation verified)`
        );
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

      // 🆕 LOG: Debug current state trước khi update
      console.log(
        `[TabStateManager] 🔍 Current state before link: status=${currentState.status}, requestId=${currentState.requestId}, folderPath=${currentState.folderPath}`
      );

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
        console.log(
          `[TabStateManager] ✅ Tab ${tabId} linked to folder: ${folderPath} (verified)`
        );
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
      console.log(
        `[TabStateManager] 🔍 Searching tabs for folder: ${folderPath}`
      );
      const allTabs = await this.getAllTabStates();
      console.log(`[TabStateManager] 📊 Total tabs found: ${allTabs.length}`);

      const matchingTabs = allTabs.filter(
        (tab) =>
          tab.folderPath === folderPath &&
          tab.status === "free" &&
          tab.canAccept
      );

      console.log(`[TabStateManager] ✅ Matching tabs: ${matchingTabs.length}`);
      matchingTabs.forEach((tab) => {
        console.log(
          `[TabStateManager]   → Tab ${tab.tabId}: status=${tab.status}, canAccept=${tab.canAccept}`
        );
      });

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

    console.warn(
      `[TabStateManager] ⚠️ Tab ${tabId} not found in storage, trying fallback...`
    );

    try {
      const allStates = await this.getAllTabStates();
      const tabState = allStates.find((t) => t.tabId === tabId);

      if (tabState) {
        const fallbackState: TabStateData = {
          status: tabState.status,
          requestId: null,
          requestCount: tabState.requestCount,
        };
        this.setCachedState(tabId, fallbackState);
        return fallbackState;
      }
    } catch (error) {
      console.error(
        `[TabStateManager] ❌ Fallback validation failed for tab ${tabId}:`,
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
    }, 30000); // Run every 30 seconds
  }

  private async autoRecoverStuckTabs(): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    this.invalidateCache();

    try {
      const result = await chrome.storage.session.get([this.STORAGE_KEY]);
      const states = (result && result[this.STORAGE_KEY]) || {};

      const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes
      let recoveredCount = 0;

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        const tabId = parseInt(tabIdStr);

        if (tabState.status === "busy") {
          // Check if tab has been busy for too long
          const tabInfo = await this.getDetailedTabInfo(tabId);

          if (
            tabInfo &&
            tabInfo.busyDuration &&
            tabInfo.busyDuration > STUCK_THRESHOLD
          ) {
            console.warn(
              `[TabStateManager] 🔧 Auto-recovering stuck tab ${tabId} (busy for ${Math.round(
                tabInfo.busyDuration / 1000
              )}s)`
            );

            await this.markTabFree(tabId);
            recoveredCount++;
          }
        }
      }
    } catch (error) {
      console.error("[TabStateManager] ❌ Error in auto-recovery:", error);
    }
  }

  private async getDetailedTabInfo(
    tabId: number
  ): Promise<{ busyDuration: number | null } | null> {
    try {
      const state = await this.getTabState(tabId);
      if (!state) {
        return null;
      }

      // Estimate busy duration based on requestId timestamp if available
      // For now, return null as we don't have busySince tracking yet
      return { busyDuration: null };
    } catch (error) {
      return null;
    }
  }

  public async forceResetTab(tabId: number): Promise<boolean> {
    console.warn(`[TabStateManager] 🔧 Force resetting tab ${tabId}`);
    this.invalidateCache(tabId);
    return await this.markTabFree(tabId);
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).TabStateManager = TabStateManager;
}
