// src/background/core/managers/tab-state/tab-state-storage.ts

import { TabStateData } from "../../types/core/tab-state.types";
import { StorageMutex } from "../../storage/mutex";

/**
 * Storage manager cho tab states
 * Xử lý tất cả storage operations với mutex protection
 */
export class TabStateStorage {
  private readonly STORAGE_KEY = "zenTabStates";
  private storageMutex = new StorageMutex();

  /**
   * Initialize storage
   */
  public async initialize(): Promise<void> {
    await this.storageMutex.acquire();
    try {
      const browserAPI = this.getBrowserAPI();

      await new Promise<void>((resolve, reject) => {
        browserAPI.storage.session.get([this.STORAGE_KEY], (result: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }

          // Nếu chưa có data, khởi tạo empty object
          if (!result || !result[this.STORAGE_KEY]) {
            browserAPI.storage.session.set({ [this.STORAGE_KEY]: {} }, () => {
              if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
                return;
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Lấy state của một tab
   */
  public async getTabState(tabId: number): Promise<TabStateData | null> {
    await this.storageMutex.acquire();
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      return states[tabId] || null;
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error getting tab state ${tabId}:`,
        error
      );
      return null;
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Lưu state của một tab
   */
  public async saveTabState(
    tabId: number,
    state: TabStateData
  ): Promise<boolean> {
    await this.storageMutex.acquire();
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};
      states[tabId] = state;

      await new Promise<void>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve();
        });
      });

      // Verify save
      const verifyResult = await new Promise<any>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const verifyStates =
        (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
      const savedState = verifyStates[tabId];

      return savedState !== undefined;
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error saving tab state ${tabId}:`,
        error
      );
      return false;
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Xóa state của một tab
   */
  public async removeTabState(tabId: number): Promise<boolean> {
    await this.storageMutex.acquire();
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = (result && result[this.STORAGE_KEY]) || {};

      if (states[tabId]) {
        delete states[tabId];

        await new Promise<void>((resolve, reject) => {
          const browserAPI = this.getBrowserAPI();

          browserAPI.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve();
          });
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error removing tab state ${tabId}:`,
        error
      );
      return false;
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Lấy tất cả tab states
   */
  public async getAllTabStates(): Promise<Record<number, TabStateData>> {
    await this.storageMutex.acquire();
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const browserAPI = this.getBrowserAPI();

        browserAPI.storage.session.get([this.STORAGE_KEY], (data: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      return (result && result[this.STORAGE_KEY]) || {};
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error getting all tab states:`,
        error
      );
      return {};
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Tìm tab theo conversationId
   */
  public async getTabByConversation(
    conversationId: string
  ): Promise<number | null> {
    await this.storageMutex.acquire();
    try {
      const states = await this.getAllTabStates();

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        if (tabState.conversationId === conversationId) {
          return parseInt(tabIdStr);
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error finding tab by conversation ${conversationId}:`,
        error
      );
      return null;
    } finally {
      this.storageMutex.release();
    }
  }

  /**
   * Unlink tất cả tabs từ một folder
   */
  public async unlinkFolder(folderPath: string): Promise<boolean> {
    await this.storageMutex.acquire();
    try {
      const states = await this.getAllTabStates();
      let updated = false;

      for (const [tabIdStr, state] of Object.entries(states)) {
        const tabState = state as TabStateData;
        if (tabState.folderPath === folderPath) {
          const tabId = parseInt(tabIdStr);
          states[tabId] = {
            ...tabState,
            folderPath: null,
          };
          updated = true;
        }
      }

      if (updated) {
        const browserAPI = this.getBrowserAPI();

        await new Promise<void>((resolve, reject) => {
          browserAPI.storage.session.set({ [this.STORAGE_KEY]: states }, () => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve();
          });
        });
      }

      return true;
    } catch (error) {
      console.error(
        `[TabStateStorage] ❌ Error unlinking folder ${folderPath}:`,
        error
      );
      return false;
    } finally {
      this.storageMutex.release();
    }
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
