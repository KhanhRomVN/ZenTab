const DEEPSEEK_URL = "https://chat.deepseek.com";

export class ZenTabManager {
  private browserAPI: any;
  private containerManager: any;
  private managedTabs: Set<number> = new Set();
  private blacklistedContainers: Set<string> = new Set();

  constructor(browserAPI: any, containerManager: any) {
    this.browserAPI = browserAPI;
    this.containerManager = containerManager;
    this.initializeManagedTabs();
    this.loadBlacklistedContainers();
  }

  private async loadBlacklistedContainers(): Promise<void> {
    try {
      const result = await this.browserAPI.storage.local.get([
        "zenTabBlacklist",
      ]);
      this.blacklistedContainers = new Set(result.zenTabBlacklist || []);
    } catch (error) {
      console.error("[ZenTabManager] Failed to load blacklist:", error);
    }
  }

  private async saveBlacklistedContainers(): Promise<void> {
    await this.browserAPI.storage.local.set({
      zenTabBlacklist: Array.from(this.blacklistedContainers),
    });
  }

  public async addToBlacklist(containerId: string): Promise<void> {
    this.blacklistedContainers.add(containerId);
    await this.saveBlacklistedContainers();

    // Remove from ZenTab management and close the tab
    await this.containerManager.removeContainerFromZenTab(containerId);
    await this.closeZenTab(containerId);
  }

  public async removeFromBlacklist(containerId: string): Promise<void> {
    this.blacklistedContainers.delete(containerId);
    await this.saveBlacklistedContainers();
  }

  public isBlacklisted(containerId: string): boolean {
    return this.blacklistedContainers.has(containerId);
  }

  private async initializeManagedTabs(): Promise<void> {
    const zenTabContainers = await this.containerManager.getZenTabContainers();

    for (const container of zenTabContainers) {
      if (!this.isBlacklisted(container.cookieStoreId)) {
        await this.ensureZenTab(container.cookieStoreId);
      }
    }
  }

  public async ensureAllZenTabs(): Promise<void> {
    const zenTabContainers = await this.containerManager.getZenTabContainers();

    for (const container of zenTabContainers) {
      if (!this.isBlacklisted(container.cookieStoreId)) {
        await this.ensureZenTab(container.cookieStoreId);
      }
    }
  }

  public async ensureZenTab(containerId: string): Promise<void> {
    try {
      // Skip if blacklisted
      if (this.isBlacklisted(containerId)) {
        return;
      }

      // Find existing ZenTab for this container
      const existingTabs = await this.browserAPI.tabs.query({
        cookieStoreId: containerId,
        url: `${DEEPSEEK_URL}/*`,
      });

      if (existingTabs.length > 0) {
        // Keep only one tab, close extras
        const tabsToClose = existingTabs.slice(1);
        for (const tab of tabsToClose) {
          await this.browserAPI.tabs.remove(tab.id);
        }

        const zenTab = existingTabs[0];
        this.managedTabs.add(zenTab.id);

        // Hide from tab bar and prevent sleep
        await this.protectZenTab(zenTab.id);
      } else {
        // Create new ZenTab
        const newTab = await this.browserAPI.tabs.create({
          url: DEEPSEEK_URL,
          cookieStoreId: containerId,
          active: false,
        });

        this.managedTabs.add(newTab.id);
        await this.protectZenTab(newTab.id);
      }
    } catch (error) {
      console.error("[ZenTabManager] Failed to ensure ZenTab:", error);
    }
  }

  private async closeZenTab(containerId: string): Promise<void> {
    try {
      const existingTabs = await this.browserAPI.tabs.query({
        cookieStoreId: containerId,
        url: `${DEEPSEEK_URL}/*`,
      });

      for (const tab of existingTabs) {
        await this.browserAPI.tabs.remove(tab.id);
        this.managedTabs.delete(tab.id);
      }
    } catch (error) {
      console.error("[ZenTabManager] Failed to close ZenTab:", error);
    }
  }

  private async protectZenTab(tabId: number): Promise<void> {
    try {
      // Hide tab from browser tab bar
      if (this.browserAPI.tabs.hide) {
        await this.browserAPI.tabs.hide([tabId]);
      }

      // Note: Firefox doesn't support 'discarded' property in tabs.update
      // The tab will be kept alive by regular activity
    } catch (error) {
      console.warn("[ZenTabManager] Could not fully protect tab:", error);
    }
  }

  public async handleTabCreated(tab: any): Promise<void> {
    // Only manage tabs that are explicitly created as DeepSeek chat tabs
    if (tab.url === DEEPSEEK_URL && !this.managedTabs.has(tab.id)) {
      const zenTabContainers =
        await this.containerManager.getZenTabContainers();
      const isZenTabContainer = zenTabContainers.some(
        (container: any) => container.cookieStoreId === tab.cookieStoreId
      );

      if (isZenTabContainer && !this.isBlacklisted(tab.cookieStoreId)) {
        this.managedTabs.add(tab.id);
        await this.protectZenTab(tab.id);
      }
    }
  }

  public async handleTabRemoved(tabId: number): Promise<void> {
    this.managedTabs.delete(tabId);

    // Check if this was a ZenTab and recreate if needed
    const zenTabContainers = await this.containerManager.getZenTabContainers();
    const allTabs = await this.browserAPI.tabs.query({});

    for (const container of zenTabContainers) {
      if (this.isBlacklisted(container.cookieStoreId)) {
        continue;
      }

      const hasZenTab = allTabs.some(
        (tab: any) =>
          tab.cookieStoreId === container.cookieStoreId &&
          tab.url === DEEPSEEK_URL
      );

      if (!hasZenTab) {
        await this.ensureZenTab(container.cookieStoreId);
      }
    }
  }

  public async handleTabUpdated(
    tabId: number,
    changeInfo: any,
    _tab: any
  ): Promise<void> {
    // If a ZenTab URL changes, restore it to DeepSeek
    if (
      this.managedTabs.has(tabId) &&
      changeInfo.url &&
      changeInfo.url !== DEEPSEEK_URL
    ) {
      await this.browserAPI.tabs.update(tabId, { url: DEEPSEEK_URL });
    }
  }

  public async openZenTab(containerId: string): Promise<void> {
    if (this.isBlacklisted(containerId)) {
      return;
    }

    const tabs = await this.browserAPI.tabs.query({
      cookieStoreId: containerId,
      url: DEEPSEEK_URL,
    });

    if (tabs.length > 0) {
      // Show and activate the ZenTab
      await this.browserAPI.tabs.update(tabs[0].id, { active: true });
      if (this.browserAPI.tabs.show) {
        await this.browserAPI.tabs.show([tabs[0].id]);
      }

      // Focus window
      if (tabs[0].windowId) {
        await this.browserAPI.windows.update(tabs[0].windowId, {
          focused: true,
        });
      }
    } else {
      await this.ensureZenTab(containerId);
    }
  }

  public isTabManaged(tabId: number): boolean {
    return this.managedTabs.has(tabId);
  }
}
