export class ContainerManager {
  private browserAPI: any;
  private containers: any[] = [];

  constructor(browserAPI: any) {
    this.browserAPI = browserAPI;
  }

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
          const promise = this.browserAPI.runtime.sendMessage({
            action: "containersUpdated",
            containers: this.containers,
          });

          // Only handle promise if it exists
          if (promise && typeof promise.catch === "function") {
            promise.catch(() => {}); // Ignore errors if no receivers
          }
        } catch (error) {
          // Ignore errors if no receivers
        }
      } else {
        this.containers = [];
      }
    } catch (error) {
      this.containers = [];
    }
  }

  public async getContainers(): Promise<any[]> {
    if (this.containers.length === 0) {
      await this.initializeContainers();
    }
    return this.containers;
  }

  public async getUnusedContainers(): Promise<any[]> {
    const allContainers = await this.getContainers();
    const usedContainerIds = await this.getUsedContainerIds();

    return allContainers.filter(
      (container) => !usedContainerIds.includes(container.cookieStoreId)
    );
  }

  private async getUsedContainerIds(): Promise<string[]> {
    const result = await this.browserAPI.storage.local.get([
      "zenTabContainers",
    ]);
    const usedContainers = result.zenTabContainers || [];
    return usedContainers.map((container: any) => container.cookieStoreId);
  }

  private async saveContainers(): Promise<void> {
    await this.browserAPI.storage.local.set({
      zenTabContainers: this.containers,
    });
  }

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

  public async removeContainerFromZenTab(containerId: string): Promise<void> {
    const existing = await this.getZenTabContainers();
    const filtered = existing.filter(
      (c: any) => c.cookieStoreId !== containerId
    );
    await this.browserAPI.storage.local.set({ zenTabContainers: filtered });
  }

  public async getZenTabContainers(): Promise<any[]> {
    const result = await this.browserAPI.storage.local.get([
      "zenTabContainers",
    ]);
    return result.zenTabContainers || [];
  }
}
