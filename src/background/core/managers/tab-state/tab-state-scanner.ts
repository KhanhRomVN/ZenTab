// src/background/core/managers/tab-state/tab-state-scanner.ts

import { TabStateCache } from "./tab-state-cache";
import { TabStateStorage } from "./tab-state-storage";
import { TabStateInitializer } from "./tab-state-initializer";
import { TabStateData, TabStateInfo } from "../../types/core/tab-state.types";

/**
 * Tab Scanner - Scan và initialize tất cả tabs
 */
export class TabStateScanner {
  constructor(
    private cache: TabStateCache,
    private storage: TabStateStorage,
    private initializer: TabStateInitializer
  ) {}

  /**
   * Scan và initialize tất cả AI chat tabs
   */
  public async scanAndInitializeAllTabs(): Promise<void> {
    try {
      const tabs = await this.getAllAIChatTabs();

      if (tabs.length === 0) {
        return;
      }

      const states: Record<number, TabStateData> = {};

      // Fetch existing states FIRST
      const existingStates = await this.storage.getAllTabStates();

      for (const tab of tabs) {
        if (!tab.id) {
          continue;
        }

        try {
          const isSleepTab = this.isSleepTab(tab);
          const existingState = existingStates[tab.id];

          if (isSleepTab) {
            states[tab.id] = {
              status: "sleep" as const,
              requestId: null,
              requestCount: existingState?.requestCount || 0,
              folderPath: existingState?.folderPath || null,
              conversationId: existingState?.conversationId || null,
            };
            continue;
          }

          // Check button state với timeout
          const isBusy = await this.checkButtonStateWithTimeout(tab.id);

          states[tab.id] = {
            status: (isBusy ? "busy" : "free") as "free" | "busy",
            requestId: isBusy ? existingState?.requestId || null : null,
            requestCount: existingState?.requestCount || 0,
            folderPath: existingState?.folderPath || null,
            conversationId: existingState?.conversationId || null,
          };
        } catch (buttonError) {
          const existingState = existingStates[tab.id];
          // Default to free state nếu check fails
          states[tab.id] = {
            status: "free" as const,
            requestId: null,
            requestCount: existingState?.requestCount || 0,
            folderPath: existingState?.folderPath || null,
            conversationId: existingState?.conversationId || null,
          };
        }
      }

      // Save all states
      await this.saveAllStates(states);

      // Notify UI về tab states
      await this.notifyUIUpdate();
    } catch (error) {
      console.error("[TabStateScanner] ❌ Error scanning tabs:", error);
    }
  }

  /**
   * Lấy tất cả tab states với đầy đủ thông tin
   */
  public async getAllTabStates(): Promise<TabStateInfo[]> {
    try {
      const tabs = await this.getAllAIChatTabs();
      const states = await this.storage.getAllTabStates();

      const tabStates: TabStateInfo[] = [];

      for (const tab of tabs) {
        if (!tab.id) {
          continue;
        }

        const state = states[tab.id] || {
          status: "free",
          requestCount: 0,
          folderPath: null,
        };

        // Override status nếu phát hiện sleep tab
        const isSleepTab = this.isSleepTab(tab);
        const actualStatus = isSleepTab ? "sleep" : state.status;

        const canAccept = this.canAcceptRequest({
          status: actualStatus,
          requestId: "requestId" in state ? state.requestId || null : null,
          requestCount: state.requestCount || 0,
          folderPath: state.folderPath || null,
        });

        // Get container name from Firefox Multi Account Container
        const containerName = await this.getContainerName(tab.cookieStoreId);

        // Detect LLM provider
        const provider = this.detectProvider(tab.url);

        tabStates.push({
          tabId: tab.id,
          containerName: containerName || `Tab ${tab.id}`,
          title: tab.title || "Untitled",
          url: tab.url,
          status: actualStatus,
          canAccept: canAccept,
          requestCount: state.requestCount || 0,
          folderPath: state.folderPath || null,
          conversationId:
            "conversationId" in state ? state.conversationId || null : null,
          provider: provider,
          cookieStoreId: tab.cookieStoreId,
        });
      }

      return tabStates;
    } catch (error) {
      console.error(
        "[TabStateScanner] ❌ Error getting all tab states:",
        error
      );
      return [];
    }
  }

  /**
   * Detect LLM provider từ URL
   */
  private detectProvider(
    url?: string
  ): "deepseek" | "chatgpt" | "gemini" | "grok" | "claude" | undefined {
    if (!url) return undefined;

    const urlLower = url.toLowerCase();

    if (urlLower.includes("deepseek.com")) return "deepseek";
    if (urlLower.includes("chatgpt.com") || urlLower.includes("openai.com"))
      return "chatgpt";
    if (urlLower.includes("aistudio.google.com/prompts")) return "gemini";
    if (urlLower.includes("grok.com")) return "grok";
    if (urlLower.includes("claude.ai")) return "claude";

    return undefined;
  }

  /**
   * Get container name từ cookieStoreId (Firefox Multi Account Container)
   */
  /**
   * Get container name từ cookieStoreId (Firefox Multi Account Container)
   */
  private async getContainerName(
    cookieStoreId?: string
  ): Promise<string | null> {
    // 🆕 VALIDATION: Early return if no cookieStoreId
    if (!cookieStoreId) {
      return null;
    }

    // 🆕 VALIDATION: Skip firefox-default
    if (cookieStoreId === "firefox-default") {
      return null;
    }

    try {
      // 🆕 CHECK: Verify browser API availability
      const isFirefox = typeof (globalThis as any).browser !== "undefined";

      if (!isFirefox) {
        return null;
      }

      const browserAPI = (globalThis as any).browser;

      // 🆕 CHECK: Verify contextualIdentities API
      if (!browserAPI.contextualIdentities) {
        return null;
      }

      try {
        const container = await browserAPI.contextualIdentities.get(
          cookieStoreId
        );

        const containerName = container?.name || null;
        return containerName;
      } catch (apiError) {
        console.error(
          `[TabStateScanner] ❌ contextualIdentities.get failed for ${cookieStoreId}:`,
          apiError
        );
        return null;
      }
    } catch (error) {
      console.error(
        `[TabStateScanner] ❌ Error getting container name for ${cookieStoreId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Lấy tất cả AI chat tabs
   */
  private async getAllAIChatTabs(): Promise<any[]> {
    try {
      const browserAPI = this.getBrowserAPI();

      // Try specific queries first
      const queryPromises = [
        this.queryTabs([
          "https://chat.deepseek.com/*",
          "https://*.deepseek.com/*",
        ]),
        this.queryTabs(["https://chatgpt.com/*", "https://*.chatgpt.com/*"]),
        this.queryTabs(["https://*.openai.com/*"]),
        this.queryTabs(["https://aistudio.google.com/prompts/*"]),
        this.queryTabs(["https://grok.com/*", "https://*.grok.com/*"]),
        this.queryTabs(["https://claude.ai/*", "https://*.claude.ai/*"]),
      ];

      const results = await Promise.allSettled(queryPromises);

      let allTabs: any[] = [];

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.length > 0) {
          allTabs = [...allTabs, ...result.value];
        }
      }

      // Remove duplicates
      const uniqueTabs = this.removeDuplicateTabs(allTabs);

      if (uniqueTabs.length > 0) {
        return uniqueTabs;
      }

      // Fallback: query tất cả tabs và filter
      const allBrowserTabs = await new Promise<any[]>((resolve) => {
        browserAPI.tabs.query({}, (tabs: any[]) => {
          resolve(tabs || []);
        });
      });

      return allBrowserTabs.filter((tab) => this.initializer.isAIChatTab(tab));
    } catch (error) {
      console.error("[TabStateScanner] ❌ Error getting AI chat tabs:", error);
      return [];
    }
  }

  /**
   * Query tabs với URLs pattern
   */
  private async queryTabs(urlPatterns: string[]): Promise<any[]> {
    return new Promise<any[]>((resolve) => {
      const browserAPI = this.getBrowserAPI();

      browserAPI.tabs.query({ url: urlPatterns }, (tabs: any[]) => {
        resolve(tabs || []);
      });
    });
  }

  /**
   * Remove duplicate tabs (same tabId)
   */
  private removeDuplicateTabs(tabs: any[]): any[] {
    const seen = new Set<number>();
    return tabs.filter((tab) => {
      if (tab.id && !seen.has(tab.id)) {
        seen.add(tab.id);
        return true;
      }
      return false;
    });
  }

  /**
   * Kiểm tra sleep tab
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
   * Kiểm tra button state với timeout
   */
  private async checkButtonStateWithTimeout(tabId: number): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, 2000);

      try {
        const browserAPI = this.getBrowserAPI();

        const scriptCode = `
          (function() {
            const sendButton = document.querySelector(".ds-icon-button._7436101");
            if (!sendButton) return { isBusy: false };
            
            const svg = sendButton.querySelector("svg");
            const path = svg?.querySelector("path");
            const pathData = path?.getAttribute("d") || "";
            
            const isStopIcon = pathData.includes("M2 4.88006");
            return { isBusy: !!isStopIcon };
          })();
        `;

        browserAPI.tabs.executeScript(
          tabId,
          { code: scriptCode },
          (results?: any[]) => {
            clearTimeout(timeoutId);

            if (browserAPI.runtime.lastError) {
              resolve(false);
              return;
            }

            const buttonState = (Array.isArray(results) && results[0]) || {
              isBusy: false,
            };
            resolve(buttonState.isBusy);
          }
        );
      } catch (error) {
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }

  /**
   * Save tất cả states
   */
  private async saveAllStates(
    states: Record<number, TabStateData>
  ): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      await new Promise<void>((resolve, reject) => {
        browserAPI.storage.session.set({ zenTabStates: states }, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // Cache states
      for (const [tabId, state] of Object.entries(states)) {
        this.cache.set(parseInt(tabId), state);
      }
    } catch (error) {
      console.error("[TabStateScanner] ❌ Error saving all states:", error);
      throw error;
    }
  }

  /**
   * Kiểm tra tab có thể accept request không
   */
  private canAcceptRequest(state: TabStateData): boolean {
    return state.status === "free";
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

      await new Promise<void>((resolve, reject) => {
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
}
