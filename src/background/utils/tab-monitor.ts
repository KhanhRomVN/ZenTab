// Tab Monitor - Theo dõi trạng thái tab để tránh spam request
export class TabMonitor {
  private static instance: TabMonitor;
  private tabStates: Map<number, TabState> = new Map();
  private readonly MIN_FREE_TIME = 2000; // 2 giây trước khi tab có thể nhận request mới

  public static getInstance(): TabMonitor {
    if (!TabMonitor.instance) {
      TabMonitor.instance = new TabMonitor();
    }
    return TabMonitor.instance;
  }

  private constructor() {
    this.setupTabListeners();
  }

  private setupTabListeners(): void {
    // Listen for tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabStates.delete(tabId);
    });

    // Listen for tab updates (URL changes, etc.)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "complete" || changeInfo.url) {
        // Reset tab state khi tab được reload hoặc URL thay đổi
        if (this.tabStates.has(tabId)) {
          this.tabStates.get(tabId)!.lastUsed = 0;
        }
      }
    });
  }

  public canAcceptRequest(tabId: number): boolean {
    const state = this.tabStates.get(tabId);
    if (!state) {
      return true; // Chưa có state, có thể nhận request
    }

    // Kiểm tra tab có đang bận không và đã đủ thời gian chờ chưa
    if (state.isBusy) {
      return false;
    }

    return Date.now() - state.lastUsed >= this.MIN_FREE_TIME;
  }

  public markTabBusy(tabId: number): void {
    this.tabStates.set(tabId, {
      isBusy: true,
      lastUsed: Date.now(),
    });
  }

  public markTabFree(tabId: number): void {
    this.tabStates.set(tabId, {
      isBusy: false,
      lastUsed: Date.now(),
    });
  }

  public getTabStatus(tabId: number): TabState | undefined {
    return this.tabStates.get(tabId);
  }
}

interface TabState {
  isBusy: boolean;
  lastUsed: number; // timestamp
}
