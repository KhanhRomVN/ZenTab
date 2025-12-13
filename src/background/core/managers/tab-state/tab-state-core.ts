// src/background/core/managers/tab-state/tab-state-core.ts

import { TabStateCache } from "./tab-state-cache";
import { TabStateStorage } from "./tab-state-storage";
import { TabStateInitializer } from "./tab-state-initializer";
import { TabStateScanner } from "./tab-state-scanner";
import { TabStateData, TabStateInfo } from "../../types/core/tab-state.types";

/**
 * Core business logic cho Tab State Management
 */
export class TabStateCore {
  constructor(
    private cache: TabStateCache,
    private storage: TabStateStorage,
    private initializer: TabStateInitializer,
    private scanner: TabStateScanner
  ) {}

  /**
   * Get all tab states với đầy đủ thông tin
   */
  public async getAllTabStates(): Promise<TabStateInfo[]> {
    return this.scanner.getAllTabStates();
  }

  /**
   * Get state của một tab cụ thể
   */
  public async getTabState(tabId: number): Promise<TabStateData | null> {
    // Check cache trước
    const cached = this.cache.get(tabId);
    if (cached) {
      return cached;
    }

    // Lấy từ storage
    const state = await this.storage.getTabState(tabId);

    // Nếu không có state, thử initialize tab
    if (!state) {
      const tabInfo = await this.initializer.getTabInfo(tabId);
      if (tabInfo && this.isAIChatTab(tabInfo)) {
        await this.initializer.initializeNewTab(tabId);

        // Retry lấy state
        const retryState = await this.storage.getTabState(tabId);
        if (retryState) {
          this.cache.set(tabId, retryState);
          return retryState;
        }
      }
      return null;
    }

    // Cache state
    this.cache.set(tabId, state);
    return state;
  }

  /**
   * Đánh dấu tab là "busy"
   */
  public async markTabBusy(tabId: number, requestId: string): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);

      if (!state || state.status !== "free") {
        console.error(
          `[TabStateCore] ❌ Tab ${tabId} không thể mark as busy, current status: ${state?.status}`
        );
        return false;
      }

      const newState: TabStateData = {
        ...state,
        status: "busy",
        requestId: requestId,
        requestCount: (state.requestCount || 0) + 1,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      } else {
        console.error(
          `[TabStateCore] ❌ FAILED TO SAVE BUSY STATE - tabId: ${tabId}, requestId: ${requestId}`
        );
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error marking tab ${tabId} as busy:`,
        error
      );
      return false;
    }
  }

  /**
   * Đánh dấu tab là "free"
   */
  public async markTabFree(tabId: number): Promise<boolean> {
    return this.markTabWithStatus(tabId, "free");
  }

  /**
   * Đánh dấu tab là "sleep"
   */
  public async markTabSleep(tabId: number): Promise<boolean> {
    return this.markTabWithStatus(tabId, "sleep");
  }

  /**
   * Đánh dấu tab là "free" với folder path
   */
  public async markTabFreeWithFolder(
    tabId: number,
    folderPath: string | null
  ): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        status: "free",
        requestId: null,
        folderPath: folderPath,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error marking tab ${tabId} as free with folder:`,
        error
      );
      return false;
    }
  }

  /**
   * Đánh dấu tab là "free" với conversationId
   */
  public async markTabFreeWithConversation(
    tabId: number,
    conversationId: string | null,
    folderPath?: string | null
  ): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        status: "free",
        requestId: null,
        conversationId: conversationId,
        folderPath: folderPath !== undefined ? folderPath : state.folderPath,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error marking tab ${tabId} as free with conversation:`,
        error
      );
      return false;
    }
  }

  /**
   * Link tab tới một folder
   */
  public async linkTabToFolder(
    tabId: number,
    folderPath: string
  ): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        folderPath: folderPath,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error linking tab ${tabId} to folder:`,
        error
      );
      return false;
    }
  }

  /**
   * Link tab tới một conversation
   */
  public async linkTabToConversation(
    tabId: number,
    conversationId: string
  ): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        console.error(
          `[TabStateCore] ❌ Cannot link tab ${tabId} to conversation - state not found`
        );
        return false;
      }

      const newState: TabStateData = {
        ...state,
        conversationId: conversationId,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error linking tab ${tabId} to conversation:`,
        error
      );
      return false;
    }
  }

  /**
   * Unlink tab từ folder
   */
  public async unlinkTabFromFolder(tabId: number): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        folderPath: null,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error unlinking tab ${tabId} from folder:`,
        error
      );
      return false;
    }
  }

  /**
   * Unlink tab từ conversation
   */
  public async unlinkTabFromConversation(tabId: number): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        conversationId: null,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error unlinking tab ${tabId} from conversation:`,
        error
      );
      return false;
    }
  }

  /**
   * Unlink tất cả tabs từ một folder
   */
  public async unlinkFolder(folderPath: string): Promise<boolean> {
    try {
      const success = await this.storage.unlinkFolder(folderPath);
      if (success) {
        this.cache.clear();
        await this.notifyUIUpdate();
      }
      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error unlinking folder ${folderPath}:`,
        error
      );
      return false;
    }
  }

  /**
   * Lấy tất cả tabs trong một folder
   */
  public async getTabsByFolder(folderPath: string): Promise<TabStateInfo[]> {
    try {
      const allTabs = await this.getAllTabStates();
      return allTabs.filter(
        (tab) =>
          tab.folderPath === folderPath &&
          tab.status === "free" &&
          tab.canAccept
      );
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error getting tabs by folder ${folderPath}:`,
        error
      );
      return [];
    }
  }

  /**
   * Lấy tab theo conversationId
   */
  public async getTabByConversation(
    conversationId: string
  ): Promise<TabStateInfo | null> {
    try {
      const tabId = await this.storage.getTabByConversation(conversationId);
      if (!tabId) {
        return null;
      }

      const allTabs = await this.getAllTabStates();
      const tab = allTabs.find((t) => t.tabId === tabId);
      return tab || null;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error getting tab by conversation ${conversationId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Wake up một sleep tab
   */
  public async wakeUpTab(tabId: number): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state || state.status !== "sleep") {
        return false;
      }

      const newState: TabStateData = {
        ...state,
        status: "free",
        requestId: null,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      }

      return success;
    } catch (error) {
      console.error(`[TabStateCore] ❌ Error waking up tab ${tabId}:`, error);
      return false;
    }
  }

  /**
   * Force reset tab về trạng thái free
   */
  public async forceResetTab(tabId: number): Promise<boolean> {
    this.cache.delete(tabId);
    return this.markTabFree(tabId);
  }

  /**
   * Notify UI về tab state changes
   */
  public async notifyUIUpdate(): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      const messagePayload = {
        action: "tabsUpdated",
        timestamp: Date.now(),
      };

      // Send message với retry
      const sendWithRetry = async (retries = 2): Promise<boolean> => {
        for (let i = 0; i <= retries; i++) {
          try {
            await new Promise<void>((resolve, reject) => {
              browserAPI.runtime.sendMessage(messagePayload, () => {
                if (browserAPI.runtime.lastError) {
                  reject(browserAPI.runtime.lastError);
                  return;
                }
                resolve();
              });
            });
            return true;
          } catch (error) {
            if (i < retries) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }
        return false;
      };

      await sendWithRetry();
    } catch (error) {
      // Silent error handling
    }
  }

  /**
   * PRIVATE HELPER METHODS
   */

  private async markTabWithStatus(
    tabId: number,
    status: "free" | "busy" | "sleep"
  ): Promise<boolean> {
    try {
      const state = await this.storage.getTabState(tabId);
      if (!state) {
        console.error(
          `[TabStateCore] ❌ Cannot mark tab ${tabId} as ${status} - state not found`
        );
        return false;
      }

      const newState: TabStateData = {
        ...state,
        status: status,
        requestId: status === "free" ? null : state.requestId,
      };

      const success = await this.storage.saveTabState(tabId, newState);
      if (success) {
        this.cache.set(tabId, newState);
        await this.notifyUIUpdate();
      } else {
        console.error(
          `[TabStateCore] ❌ FAILED TO SAVE STATUS - tabId: ${tabId}, status: ${status}`
        );
      }

      return success;
    } catch (error) {
      console.error(
        `[TabStateCore] ❌ Error marking tab ${tabId} as ${status}:`,
        error
      );
      return false;
    }
  }

  private isAIChatTab(tab: any): boolean {
    const url = tab.url || "";
    const title = tab.title || "";

    return (
      url.includes("deepseek.com") ||
      url.includes("chatgpt.com") ||
      url.includes("openai.com") ||
      title.includes("DeepSeek") ||
      title.includes("ChatGPT")
    );
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
