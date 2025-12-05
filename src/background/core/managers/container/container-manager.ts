// src/background/core/managers/container/container-manager.ts

/**
 * Container Manager - Quản lý browser containers
 */
export class ContainerManager {
  private browserAPI: any;
  private containers: any[] = [];

  constructor(browserAPI: any) {
    this.browserAPI = browserAPI;
  }

  /**
   * Initialize containers
   */
  public async initializeContainers(): Promise<void> {
    try {
      if (
        this.browserAPI.contextualIdentities &&
        typeof this.browserAPI.contextualIdentities.query === "function"
      ) {
        this.containers = await this.browserAPI.contextualIdentities.query({});
        await this.saveContainers();

        // Notify UI about containers update
        try {
          this.browserAPI.runtime.sendMessage({
            action: "containersUpdated",
            containers: this.containers,
          });
        } catch (error) {
          // Ignore errors if no receivers
        }
      } else {
        this.containers = [];
      }
    } catch (error) {
      console.error(
        "[ContainerManager] ❌ Error initializing containers:",
        error
      );
      this.containers = [];
    }
  }

  /**
   * Get all containers
   */
  public async getContainers(): Promise<any[]> {
    if (this.containers.length === 0) {
      await this.initializeContainers();
    }
    return this.containers;
  }

  /**
   * Get unused containers
   */
  public async getUnusedContainers(): Promise<any[]> {
    const allContainers = await this.getContainers();
    const usedContainerIds = await this.getUsedContainerIds();

    return allContainers.filter(
      (container) => !usedContainerIds.includes(container.cookieStoreId)
    );
  }

  /**
   * Add container to ZenTab
   */
  public async addContainerToZenTab(containerId: string): Promise<void> {
    const container = this.containers.find(
      (c) => c.cookieStoreId === containerId
    );

    if (container) {
      const existing = await this.getZenTabContainers();
      if (!existing.find((c: any) => c.cookieStoreId === containerId)) {
        existing.push(container);
        await this.browserAPI.storage.local.set({ zenTabContainers: existing });
      }
    }
  }

  /**
   * Remove container from ZenTab
   */
  public async removeContainerFromZenTab(containerId: string): Promise<void> {
    const existing = await this.getZenTabContainers();
    const filtered = existing.filter(
      (c: any) => c.cookieStoreId !== containerId
    );
    await this.browserAPI.storage.local.set({ zenTabContainers: filtered });
  }

  /**
   * Get ZenTab containers
   */
  public async getZenTabContainers(): Promise<any[]> {
    const result = await this.browserAPI.storage.local.get([
      "zenTabContainers",
    ]);
    return result.zenTabContainers || [];
  }

  /**
   * Get used container IDs
   */
  private async getUsedContainerIds(): Promise<string[]> {
    const usedContainers = await this.getZenTabContainers();
    return usedContainers.map((container: any) => container.cookieStoreId);
  }

  /**
   * Save containers to storage
   */
  private async saveContainers(): Promise<void> {
    await this.browserAPI.storage.local.set({
      zenTabContainers: this.containers,
    });
  }
}
