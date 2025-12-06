// src/background/core/managers/tab-state/tab-state-manager.ts

import { TabStateCore } from "./tab-state-core";
import { TabStateCache } from "./tab-state-cache";
import { TabStateStorage } from "./tab-state-storage";
import { TabStateInitializer } from "./tab-state-initializer";
import { TabStateScanner } from "./tab-state-scanner";
import { TabStateRecovery } from "./tab-state-recovery";
import { TabStateData, TabStateInfo } from "../../types/core/tab-state.types";

/**
 * Public API cho Tab State Management
 * Facade pattern để expose các method cần thiết
 */
export class TabStateManager {
  private static instance: TabStateManager;
  private core: TabStateCore;
  private cache: TabStateCache;
  private storage: TabStateStorage;
  private initializer: TabStateInitializer;
  private scanner: TabStateScanner;
  private recovery: TabStateRecovery;

  private isInitialized = false;

  private constructor() {
    this.cache = new TabStateCache();
    this.storage = new TabStateStorage();
    this.initializer = new TabStateInitializer(this.cache, this.storage);
    this.scanner = new TabStateScanner(
      this.cache,
      this.storage,
      this.initializer
    );
    this.recovery = new TabStateRecovery(
      this.cache,
      this.storage,
      this.initializer
    );
    this.core = new TabStateCore(
      this.cache,
      this.storage,
      this.initializer,
      this.scanner,
      this.recovery
    );
  }

  public static getInstance(): TabStateManager {
    if (!TabStateManager.instance) {
      TabStateManager.instance = new TabStateManager();
    }
    return TabStateManager.instance;
  }

  /**
   * Initialize Tab State Manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize storage
      await this.storage.initialize();

      // Scan và initialize all tabs
      await this.scanner.scanAndInitializeAllTabs();

      // Setup tab listeners
      await this.initializer.setupTabListeners();

      // Start auto recovery
      await this.recovery.startAutoRecovery();

      this.isInitialized = true;
    } catch (error) {
      console.error("[TabStateManager] ❌ Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    await this.recovery.stopAutoRecovery();
    this.cache.clear();

    this.isInitialized = false;
  }

  /**
   * PUBLIC API METHODS
   */

  public async getAllTabStates(): Promise<TabStateInfo[]> {
    return this.core.getAllTabStates();
  }

  public async getTabState(tabId: number): Promise<TabStateData | null> {
    return this.core.getTabState(tabId);
  }

  public async markTabBusy(tabId: number, requestId: string): Promise<boolean> {
    return this.core.markTabBusy(tabId, requestId);
  }

  public async markTabFree(tabId: number): Promise<boolean> {
    return this.core.markTabFree(tabId);
  }

  public async markTabSleep(tabId: number): Promise<boolean> {
    return this.core.markTabSleep(tabId);
  }

  public async wakeUpTab(tabId: number): Promise<boolean> {
    return this.core.wakeUpTab(tabId);
  }

  public async markTabFreeWithFolder(
    tabId: number,
    folderPath: string | null
  ): Promise<boolean> {
    return this.core.markTabFreeWithFolder(tabId, folderPath);
  }

  public async linkTabToFolder(
    tabId: number,
    folderPath: string
  ): Promise<boolean> {
    return this.core.linkTabToFolder(tabId, folderPath);
  }

  public async unlinkTabFromFolder(tabId: number): Promise<boolean> {
    return this.core.unlinkTabFromFolder(tabId);
  }

  public async unlinkFolder(folderPath: string): Promise<boolean> {
    return this.core.unlinkFolder(folderPath);
  }

  public async getTabsByFolder(folderPath: string): Promise<TabStateInfo[]> {
    return this.core.getTabsByFolder(folderPath);
  }

  public async forceResetTab(tabId: number): Promise<boolean> {
    return this.core.forceResetTab(tabId);
  }

  /**
   * Notify UI về tab state changes
   */
  public async notifyUIUpdate(): Promise<void> {
    return this.core.notifyUIUpdate();
  }

  /**
   * Check if manager is enabled
   */
  public getEnabled(): boolean {
    return this.isInitialized;
  }
}
