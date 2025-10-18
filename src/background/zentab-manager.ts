const DEEPSEEK_URL = "https://chat.deepseek.com";

export class ZenTabManager {
  private browserAPI: any;
  private containerManager: any;
  private selectedTabs: Map<string, number> = new Map(); // containerId -> tabId

  constructor(browserAPI: any, containerManager: any) {
    this.browserAPI = browserAPI;
    this.containerManager = containerManager;
    this.loadSelectedTabs();
  }

  private async loadSelectedTabs(): Promise<void> {
    try {
      const result = await this.browserAPI.storage.local.get([
        "zenTabSelectedTabs",
      ]);
      const saved = result.zenTabSelectedTabs || {};
      this.selectedTabs = new Map(Object.entries(saved));
    } catch (error) {
      console.error("[ZenTabManager] Failed to load selected tabs:", error);
    }
  }

  private async saveSelectedTabs(): Promise<void> {
    const obj = Object.fromEntries(this.selectedTabs);
    await this.browserAPI.storage.local.set({ zenTabSelectedTabs: obj });
  }

  public async selectTab(containerId: string, tabId: number): Promise<void> {
    this.selectedTabs.set(containerId, tabId);
    await this.saveSelectedTabs();
  }

  public async unselectTab(containerId: string): Promise<void> {
    this.selectedTabs.delete(containerId);
    await this.saveSelectedTabs();
  }

  public getSelectedTab(containerId: string): number | undefined {
    return this.selectedTabs.get(containerId);
  }

  public getAllSelectedTabs(): Map<string, number> {
    return new Map(this.selectedTabs);
  }

  public async handleTabRemoved(tabId: number): Promise<void> {
    // Tìm container có tab bị xóa và bỏ chọn
    for (const [containerId, selectedTabId] of this.selectedTabs.entries()) {
      if (selectedTabId === tabId) {
        await this.unselectTab(containerId);
        break;
      }
    }
  }

  public async openSelectedTab(containerId: string): Promise<void> {
    const tabId = this.selectedTabs.get(containerId);
    if (!tabId) return;

    try {
      const tab = await this.browserAPI.tabs.get(tabId);
      await this.browserAPI.tabs.update(tabId, { active: true });
      if (tab.windowId) {
        await this.browserAPI.windows.update(tab.windowId, { focused: true });
      }
    } catch (error) {
      console.error("[ZenTabManager] Failed to open selected tab:", error);
    }
  }
}
