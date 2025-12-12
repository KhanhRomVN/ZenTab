// src/background/events/runtime-events/runtime-handler.ts

import { TabStateManager } from "../../core/managers/tab-state";
import { WSManager } from "../../core/managers/websocket";
import { Message } from "../../types/messaging/message.types";

/**
 * Runtime Event Handler - Xử lý runtime events (messages, alarms, etc.)
 */
export class RuntimeEventHandler {
  private tabStateManager: TabStateManager;
  private wsManager: WSManager;

  constructor(tabStateManager: TabStateManager, wsManager: WSManager) {
    this.tabStateManager = tabStateManager;
    this.wsManager = wsManager;
  }

  /**
   * Setup runtime event listeners
   */
  public async setupListeners(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    // Setup message listener
    browserAPI.runtime.onMessage.addListener(
      (message: any, sender: any, sendResponse: any) => {
        this.handleRuntimeMessage(message, sender, sendResponse);
        // Important: Return false/undefined synchronously so we don't block other listeners
        // unless we explicitly handle it (which we don't in this generic handler)
        return false;
      }
    );

    // Setup alarm listeners
    browserAPI.alarms.onAlarm.addListener((alarm: any) => {
      this.handleAlarm(alarm);
    });

    // Setup startup listener
    browserAPI.runtime.onStartup.addListener(() => {
      this.handleStartup();
    });

    // Setup installed/updated listener
    browserAPI.runtime.onInstalled.addListener((details: any) => {
      this.handleInstalled(details);
    });
  }

  /**
   * Cleanup listeners
   */
  public async cleanup(): Promise<void> {
    // Note: Chrome API doesn't provide a way to remove these listeners
  }

  /**
   * Handle runtime messages
   */
  private async handleRuntimeMessage(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean | undefined> {
    console.log(
      `[RuntimeEventHandler] 🕵️ [${Date.now()}] Checking message:`,
      message.type || message.action
    );
    // Handle message based on type
    switch (message.type) {
      case "ping":
        return this.handlePing(message, sender, sendResponse);

      case "getTabState":
        return this.handleGetTabState(message, sender, sendResponse);

      case "updateTabState":
        return this.handleUpdateTabState(message, sender, sendResponse);

      case "getAllTabs":
        return this.handleGetAllTabs(message, sender, sendResponse);

      case "cleanupTabs":
        return this.handleCleanupTabs(message, sender, sendResponse);

      case "getWSStatus":
        return this.handleGetWSStatus(message, sender, sendResponse);

      case "sendTestPrompt":
        return this.handleSendTestPrompt(message, sender, sendResponse);

      case "getStorageUsage":
        return this.handleGetStorageUsage(message, sender, sendResponse);

      default:
        // Don't respond to unknown messages - let other listeners handle them
        console.log(
          `[RuntimeEventHandler] 🤷 [${Date.now()}] Ignoring unknown message:`,
          message.action || message.type
        );
        return false;
    }
  }

  /**
   * Handle ping message
   */
  private async handlePing(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    sendResponse({
      success: true,
      type: "pong",
      timestamp: Date.now(),
      version: chrome.runtime.getManifest().version,
    });
    return true;
  }

  /**
   * Handle getTabState message
   */
  private async handleGetTabState(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const { tabId } = message;

      if (!tabId) {
        sendResponse({
          success: false,
          error: "tabId is required",
        });
        return false;
      }

      const tabState = await this.tabStateManager.getTabState(tabId);

      sendResponse({
        success: true,
        tabState: tabState || null,
      });
      return true;
    } catch (error) {
      console.error("[RuntimeEventHandler] ❌ Error getting tab state:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle updateTabState message
   */
  private async handleUpdateTabState(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const { tabId, status, requestId, folderPath } = message;

      if (!tabId || !status) {
        sendResponse({
          success: false,
          error: "tabId and status are required",
        });
        return false;
      }

      switch (status) {
        case "free":
          await this.tabStateManager.markTabFree(tabId);
          break;

        case "busy":
          if (!requestId) {
            sendResponse({
              success: false,
              error: "requestId is required for busy status",
            });
            return false;
          }
          await this.tabStateManager.markTabBusy(tabId, requestId);
          break;

        case "sleep":
          await this.tabStateManager.markTabSleep(tabId);
          break;

        default:
          sendResponse({
            success: false,
            error: `Invalid status: ${status}`,
          });
          return false;
      }

      // Update folder path if provided
      if (folderPath) {
        await this.tabStateManager.linkTabToFolder(tabId, folderPath);
      }

      sendResponse({
        success: true,
      });
      return true;
    } catch (error) {
      console.error(
        "[RuntimeEventHandler] ❌ Error updating tab state:",
        error
      );
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle getAllTabs message
   */
  private async handleGetAllTabs(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const allTabStates = await this.tabStateManager.getAllTabStates();

      // Get tab info từ browser API
      const browserAPI = this.getBrowserAPI();
      const tabs = await new Promise<any[]>((resolve) => {
        browserAPI.tabs.query({}, (tabs: any[]) => {
          resolve(tabs || []);
        });
      });

      // Kết hợp tab states với tab info
      const enhancedTabs = tabs.map((tab) => {
        const tabState = allTabStates.find((state) => state.tabId === tab.id);
        return {
          ...tab,
          state: tabState || null,
        };
      });

      sendResponse({
        success: true,
        tabs: enhancedTabs,
        count: enhancedTabs.length,
      });
      return true;
    } catch (error) {
      console.error("[RuntimeEventHandler] ❌ Error getting all tabs:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle cleanupTabs message
   */
  private async handleCleanupTabs(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const { force } = message;

      // Note: cleanupStaleTabs không tồn tại trong TabStateManager
      // Trả về thông báo không hỗ trợ
      sendResponse({
        success: false,
        error: "cleanupTabs feature is not available",
        message: "This feature requires implementation in TabStateManager",
      });
      return true;
    } catch (error) {
      console.error("[RuntimeEventHandler] ❌ Error cleaning up tabs:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle getWSStatus message
   */
  private async handleGetWSStatus(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const wsConnectionInfo = this.wsManager.getConnectionInfo();

      sendResponse({
        success: true,
        wsStatus: wsConnectionInfo,
      });
      return true;
    } catch (error) {
      console.error(
        "[RuntimeEventHandler] ❌ Error getting WebSocket status:",
        error
      );
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle sendTestPrompt message
   */
  private async handleSendTestPrompt(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const { tabId, prompt } = message;

      if (!tabId || !prompt) {
        sendResponse({
          success: false,
          error: "tabId and prompt are required",
        });
        return false;
      }

      // Dynamic import để tránh circular dependencies
      const { DeepSeekController } = await import(
        "../../ai-services/deepseek/controller"
      );

      const requestId = `test_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const success = await DeepSeekController.sendPrompt(
        tabId,
        prompt,
        requestId,
        true
      );

      sendResponse({
        success: true,
        requestId,
        sent: success,
        message: success
          ? "Test prompt sent successfully"
          : "Failed to send test prompt",
      });
      return true;
    } catch (error) {
      console.error(
        "[RuntimeEventHandler] ❌ Error sending test prompt:",
        error
      );
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle getStorageUsage message
   */
  private async handleGetStorageUsage(
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      const browserAPI = this.getBrowserAPI();

      const storage = await new Promise<any>((resolve) => {
        browserAPI.storage.local.getBytesInUse(null, (bytes: number) => {
          resolve({ bytes, mb: bytes / (1024 * 1024) });
        });
      });

      // Get item count (ước lượng)
      const allItems = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get(null, (items: any) => {
          resolve(items || {});
        });
      });

      const itemCount = Object.keys(allItems).length;

      sendResponse({
        success: true,
        storage: {
          bytes: storage.bytes,
          megabytes: Math.round(storage.mb * 100) / 100,
          itemCount,
        },
      });
      return true;
    } catch (error) {
      console.error(
        "[RuntimeEventHandler] ❌ Error getting storage usage:",
        error
      );
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle alarm events
   */
  private async handleAlarm(alarm: any): Promise<void> {
    switch (alarm.name) {
      case "cleanupStorage":
        await this.cleanupStorage();
        break;

      case "checkWebSocketConnections":
        // Note: checkConnections không tồn tại trong WSManager
        break;

      default:
    }
  }

  /**
   * Handle startup event
   */
  private async handleStartup(): Promise<void> {
    // Setup cleanup alarms
    await this.setupAlarms();
  }

  /**
   * Handle installed/updated event
   */
  private async handleInstalled(details: any): Promise<void> {
    // Clear old storage data nếu cần
    if (details.reason === "update") {
      await this.cleanupLegacyData();
    }

    // Setup alarms
    await this.setupAlarms();
  }

  /**
   * Setup cleanup alarms
   */
  private async setupAlarms(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    // Cleanup storage every 30 minutes
    browserAPI.alarms.create("cleanupStorage", {
      periodInMinutes: 30,
    });

    // Check WebSocket connections every minute (placeholder)
    browserAPI.alarms.create("checkWebSocketConnections", {
      periodInMinutes: 1,
    });
  }

  /**
   * Cleanup legacy data
   */
  private async cleanupLegacyData(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    const legacyKeys = [
      "wsStates",
      "wsMessages",
      "wsOutgoingMessage",
      "wsIncomingRequest",
      "wsConnection",
      "wsConnectionId",
      "wsPort",
      "wsUrl",
      "lastConnected",
    ];

    await new Promise<void>((resolve) => {
      browserAPI.storage.local.remove(legacyKeys, () => {
        resolve();
      });
    });
  }

  /**
   * Cleanup storage (remove old data)
   */
  private async cleanupStorage(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    // Cleanup old messages
    const result = await new Promise<any>((resolve) => {
      browserAPI.storage.local.get(["wsMessages"], (data: any) => {
        resolve(data || {});
      });
    });

    const messages = result.wsMessages || {};
    const now = Date.now();
    let cleanedCount = 0;

    for (const [connectionId, msgArray] of Object.entries(messages)) {
      const msgs = msgArray as Array<{ timestamp: number; data: any }>;
      const recentMsgs = msgs.filter((msg) => {
        const age = now - msg.timestamp;
        return age < 600000; // 10 minutes
      });

      if (recentMsgs.length !== msgs.length) {
        messages[connectionId] = recentMsgs;
        cleanedCount += msgs.length - recentMsgs.length;
      }
    }

    if (cleanedCount > 0) {
      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set({ wsMessages: messages }, () => {
          resolve();
        });
      });
    }
  }

  /**
   * Helper để lấy browser API
   */
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
