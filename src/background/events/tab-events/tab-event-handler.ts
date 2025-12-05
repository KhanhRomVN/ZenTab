// src/background/events/tab-events/tab-event-handler.ts

import { TabStateManager } from "../../core/managers/tab-state";

/**
 * Tab Event Handler - Xử lý tất cả tab-related events
 */
export class TabEventHandler {
  private tabStateManager: TabStateManager;

  constructor(tabStateManager: TabStateManager) {
    this.tabStateManager = tabStateManager;
  }

  /**
   * Setup tab event listeners
   */
  public async setupListeners(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    // Tab created event
    browserAPI.tabs.onCreated.addListener((tab: any) => {
      this.handleTabCreated(tab);
    });

    // Tab updated event
    browserAPI.tabs.onUpdated.addListener(
      (tabId: number, changeInfo: any, tab: any) => {
        this.handleTabUpdated(tabId, changeInfo, tab);
      }
    );

    // Tab removed event
    browserAPI.tabs.onRemoved.addListener((tabId: number) => {
      this.handleTabRemoved(tabId);
    });

    // Tab activated event
    browserAPI.tabs.onActivated.addListener((activeInfo: any) => {
      this.handleTabActivated(activeInfo);
    });

    console.log("[TabEventHandler] ✅ Tab event listeners setup");
  }

  /**
   * Cleanup event listeners
   */
  public async cleanup(): Promise<void> {
    // Note: Chrome API doesn't provide a way to remove these listeners
    // They will be automatically cleaned up when extension is unloaded
    console.log("[TabEventHandler] 🧹 Tab event listeners cleanup");
  }

  /**
   * Handle tab created event
   */
  private async handleTabCreated(tab: any): Promise<void> {
    if (!this.isAIChatTab(tab)) {
      return;
    }

    console.log(`[TabEventHandler] 📝 Tab created: ${tab.id} - ${tab.url}`);

    // Wait for tab to load
    setTimeout(async () => {
      try {
        // Kiểm tra nếu tab đã có state
        const existingState = await this.tabStateManager.getTabState(tab.id);
        if (!existingState) {
          // Tab mới, chưa có state → initialize
          // Note: TabStateManager sẽ tự động handle việc này
          console.log(`[TabEventHandler] 🔄 Initializing new tab ${tab.id}`);
        }
      } catch (error) {
        console.error(
          `[TabEventHandler] ❌ Error handling tab created ${tab.id}:`,
          error
        );
      }
    }, 2000);
  }

  /**
   * Handle tab updated event
   */
  private async handleTabUpdated(
    tabId: number,
    changeInfo: any,
    tab: any
  ): Promise<void> {
    if (!this.isAIChatTab(tab)) {
      return;
    }

    // Only handle when tab is fully loaded
    if (changeInfo.status === "complete") {
      console.log(`[TabEventHandler] 📝 Tab updated: ${tabId} - ${tab.url}`);

      try {
        // Kiểm tra nếu tab đã có state
        const existingState = await this.tabStateManager.getTabState(tabId);

        if (!existingState) {
          // Tab mới được navigate tới AI chat site → initialize
          console.log(
            `[TabEventHandler] 🔄 Initializing navigated tab ${tabId}`
          );

          // Notify UI về tab mới
          setTimeout(async () => {
            await this.tabStateManager.notifyUIUpdate();
          }, 200);
        }
      } catch (error) {
        console.error(
          `[TabEventHandler] ❌ Error handling tab updated ${tabId}:`,
          error
        );
      }
    }
  }

  /**
   * Handle tab removed event
   */
  private async handleTabRemoved(tabId: number): Promise<void> {
    console.log(`[TabEventHandler] 🗑️ Tab removed: ${tabId}`);

    // TabStateManager sẽ tự động handle cleanup thông qua storage listener
    // Chúng ta chỉ cần log sự kiện này
  }

  /**
   * Handle tab activated event
   */
  private async handleTabActivated(activeInfo: any): Promise<void> {
    const { tabId } = activeInfo;

    // Log activated tab (có thể dùng cho analytics sau này)
    console.log(`[TabEventHandler] 👆 Tab activated: ${tabId}`);
  }

  /**
   * Kiểm tra nếu tab là AI chat tab
   */
  private isAIChatTab(tab: any): boolean {
    const url = tab.url || tab.pendingUrl || "";
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
