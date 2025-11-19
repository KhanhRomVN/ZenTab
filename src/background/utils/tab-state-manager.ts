interface TabStateData {
  status: "free" | "busy";
  requestId: string | null;
  lastUsed: number;
  requestCount: number;
}

interface TabStateInfo {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  status: "free" | "busy";
  canAccept: boolean;
  lastUsed: number;
  requestCount: number;
}

class TabStateManager {
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
    this.setupWSListener();
    this.checkInitialWSState();
  }

  private setupWSListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsStates) {
        const states = changes.wsStates.newValue || {};
        const FIXED_CONNECTION_ID = "ws-default-1500";
        const wsState = states[FIXED_CONNECTION_ID];

        console.log(
          `[TabStateManager] WebSocket state changed: status=${wsState?.status}, isEnabled=${this.isEnabled}`
        );

        if (wsState?.status === "connected" && !this.isEnabled) {
          console.log(
            "[TabStateManager] 🟢 WebSocket connected → Enabling tab state manager..."
          );
          this.enable();
        } else if (wsState?.status !== "connected" && this.isEnabled) {
          console.log(
            `[TabStateManager] 🔴 WebSocket disconnected (status=${wsState?.status}) → Disabling tab state manager...`
          );
          this.disable();
        }
      }
    });
  }

  private async checkInitialWSState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(["wsStates"]);
      const states = result?.wsStates || {};
      const FIXED_CONNECTION_ID = "ws-default-1500";
      const wsState = states[FIXED_CONNECTION_ID];

      console.log(
        `[TabStateManager] Initial check - WebSocket status: ${wsState?.status}`
      );

      if (wsState?.status === "connected") {
        console.log(
          "[TabStateManager] 🟢 WebSocket already connected on startup → Enabling tab state manager..."
        );
        await this.enable();
      }
    } catch (error) {
      console.error(
        "[TabStateManager] Error checking initial WebSocket state:",
        error
      );
    }
  }

  private async enable(): Promise<void> {
    console.log("[TabStateManager] ✅ Enabling tab state manager...");
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

  private async disable(): Promise<void> {
    console.log("[TabStateManager] ❌ Disabling tab state manager...");
    this.isEnabled = false;

    console.log(
      "[TabStateManager] 🗑️  Clearing all tab states from session storage..."
    );
    await chrome.storage.session.remove([this.STORAGE_KEY]);
    console.log("[TabStateManager] ❌ Tab state manager fully disabled");
  }

  private async scanAndInitializeAllTabs(): Promise<void> {
    console.log("[TabStateManager] 🔍 Scanning all DeepSeek tabs...");

    let tabs: chrome.tabs.Tab[] = [];
    try {
      const result = await chrome.tabs.query({
        url: "https://chat.deepseek.com/*",
      });
      tabs = result || [];
      console.log(
        `[TabStateManager] ✅ Query successful: found ${tabs.length} DeepSeek tabs`
      );
    } catch (error) {
      console.error("[TabStateManager] ❌ Error querying tabs:", error);
      return;
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
        }] Checking button state for tab ${tab.id} (${tab.title})...`
      );

      const buttonState = await this.checkButtonState(tab.id);
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
    }

    console.log("[TabStateManager] 💾 Saving tab states to session storage...");
    await chrome.storage.session.set({ [this.STORAGE_KEY]: states });
    console.log(
      `[TabStateManager] ✅ All ${
        Object.keys(states).length
      } tabs initialized successfully`
    );
  }

  private async checkButtonState(tabId: number): Promise<{ isBusy: boolean }> {
    try {
      console.log(`[TabStateManager]   → Executing script on tab ${tabId}...`);

      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const sendButton = document.querySelector(
            ".ds-icon-button._7436101"
          ) as HTMLButtonElement;

          if (!sendButton) {
            return { isBusy: false, reason: "button_not_found" };
          }

          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";

          const isStopIcon =
            pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");
          const isSendIcon =
            pathData.includes("M8.3125 0.981648") &&
            pathData.includes("9.2627 1.4338");

          if (isStopIcon) {
            return { isBusy: true, reason: "stop_icon" };
          }

          if (isSendIcon) {
            const isDisabled = sendButton.classList.contains(
              "ds-icon-button--disabled"
            );
            return {
              isBusy: isDisabled,
              reason: isDisabled ? "send_icon_disabled" : "send_icon_enabled",
            };
          }

          return { isBusy: false, reason: "unknown_icon" };
        },
      });

      const buttonState = result[0]?.result || {
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
    if (!this.isEnabled) {
      console.warn(
        "[TabStateManager] Tab state manager is disabled (WebSocket not connected)"
      );
      return [];
    }

    console.log("[TabStateManager] getAllTabStates() called");

    const result = await chrome.storage.session.get([this.STORAGE_KEY]);
    const states = (result && result[this.STORAGE_KEY]) || {};

    console.log(
      "[TabStateManager] Current states from session storage:",
      states
    );

    let tabs: chrome.tabs.Tab[] = [];
    try {
      const result = await chrome.tabs.query({
        url: "https://chat.deepseek.com/*",
      });
      tabs = result || [];
    } catch (error) {
      console.error("[TabStateManager] Error querying tabs:", error);
      return [];
    }

    console.log(`[TabStateManager] Found ${tabs.length} DeepSeek tabs`);

    if (tabs.length === 0) {
      console.warn(
        "[TabStateManager] ⚠️ No DeepSeek tabs found! Please open https://chat.deepseek.com/ first"
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
    if (!this.isEnabled) {
      console.warn(
        "[TabStateManager] Cannot mark tab busy - manager is disabled"
      );
      return false;
    }

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
    if (!this.isEnabled) {
      console.warn(
        "[TabStateManager] Cannot mark tab free - manager is disabled"
      );
      return false;
    }

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
    if (!this.isEnabled) {
      return null;
    }

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
