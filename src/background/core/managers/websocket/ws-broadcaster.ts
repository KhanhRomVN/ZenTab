// src/background/core/managers/websocket/ws-broadcaster.ts

import { WSManager } from "./ws-manager";

interface FocusedTab {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
}

/**
 * Tab Broadcaster - Broadcast focused tabs information via WebSocket
 */
export class TabBroadcaster {
  private wsManager: WSManager;
  private lastBroadcastTime = 0;
  private readonly BROADCAST_THROTTLE = 2000; // 2 seconds
  private pendingBroadcast: NodeJS.Timeout | null = null;

  constructor(wsManager: WSManager) {
    this.wsManager = wsManager;
    this.setupListeners();
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    const browserAPI = this.getBrowserAPI();

    // Debounced broadcast function
    const debouncedBroadcast = () => {
      if (this.pendingBroadcast) {
        clearTimeout(this.pendingBroadcast);
      }

      this.pendingBroadcast = setTimeout(() => {
        this.broadcastFocusedTabs().catch(() => {});
        this.pendingBroadcast = null;
      }, 500);
    };

    // Storage listeners
    browserAPI.storage.onChanged.addListener(
      (
        changes: { zenTabSelectedTabs: any; wsStates: any; wsMessages: any },
        areaName: string
      ) => {
        if (areaName !== "local") return;

        // Selected tabs changed
        if (changes.zenTabSelectedTabs) {
          debouncedBroadcast();
        }

        // WebSocket states changed
        if (changes.wsStates) {
          this.handleWSStateChange(changes.wsStates);
        }

        // WebSocket messages
        if (changes.wsMessages) {
          this.handleWSMessages(changes.wsMessages);
        }
      }
    );

    // Tab events
    browserAPI.tabs.onUpdated.addListener(
      (changeInfo: { title: any; url: any }, tab: { url: string }) => {
        if (
          tab.url?.startsWith("https://chat.deepseek.com") &&
          (changeInfo.title || changeInfo.url)
        ) {
          debouncedBroadcast();
        }
      }
    );

    browserAPI.tabs.onRemoved.addListener(() => {
      debouncedBroadcast();
    });
  }

  /**
   * Handle WebSocket state changes
   */
  private handleWSStateChange(change: any): void {
    const newStates = change.newValue || {};
    const oldStates = change.oldValue || {};

    // Check for disconnections
    let hasDisconnected = false;

    for (const [connId, newState] of Object.entries(newStates)) {
      const oldState = oldStates[connId];
      if (
        oldState?.status === "connected" &&
        (newState as any).status === "disconnected"
      ) {
        hasDisconnected = true;
        break;
      }
    }

    // Check for new connections
    let hasNewConnection = false;
    const newConnIds = Object.keys(newStates);
    const oldConnIds = Object.keys(oldStates);

    if (newConnIds.length > 0) {
      const latestConnId = newConnIds[0];

      if (!oldConnIds.includes(latestConnId)) {
        const newState = newStates[latestConnId] as any;
        if (newState.status === "connected") {
          hasNewConnection = true;
        }
      } else {
        const newState = newStates[latestConnId] as any;
        const oldState = oldStates[latestConnId] as any;

        if (
          newState.status === "connected" &&
          oldState?.status !== "connected"
        ) {
          hasNewConnection = true;
        }
      }
    }

    // Handle disconnections
    if (hasDisconnected) {
      const disconnectMessage = {
        type: "focusedTabsUpdate",
        data: [],
        timestamp: Date.now(),
      };

      this.wsManager.broadcastToAll(disconnectMessage);
    }

    // Handle new connections
    if (hasNewConnection) {
      setTimeout(() => {
        this.broadcastFocusedTabs().catch(() => {});
      }, 1000);
    }
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWSMessages(change: any): Promise<void> {
    const messages = change.newValue || {};

    for (const [, msgArray] of Object.entries(messages)) {
      const msgs = msgArray as Array<{ timestamp: number; data: any }>;
      const recentMsgs = msgs.filter((msg) => {
        const age = Date.now() - msg.timestamp;
        return age < 5000;
      });

      if (recentMsgs.length === 0) continue;

      const latestMsg = recentMsgs[recentMsgs.length - 1];

      if (latestMsg.data.type === "requestFocusedTabs") {
        await this.broadcastFocusedTabs();
      }
    }
  }

  /**
   * Broadcast focused tabs information
   */
  public async broadcastFocusedTabs(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE) {
      return;
    }

    const hasConnections = await this.wsManager.hasActiveConnections();
    if (!hasConnections) {
      return;
    }

    this.lastBroadcastTime = now;

    try {
      const focusedTabs = await this.getFocusedTabs();

      if (focusedTabs.length === 0) {
        return;
      }

      const message = {
        type: "focusedTabsUpdate",
        data: focusedTabs,
        timestamp: Date.now(),
      };

      this.wsManager.broadcastToAll(message);
    } catch (error) {
      console.error(
        "[TabBroadcaster] ❌ Error broadcasting focused tabs:",
        error
      );
    }
  }

  /**
   * Get all focused DeepSeek tabs
   */
  private async getFocusedTabs(): Promise<FocusedTab[]> {
    try {
      const browserAPI = this.getBrowserAPI();

      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        browserAPI.tabs.query(
          { url: "https://chat.deepseek.com/*" },
          (tabs: chrome.tabs.Tab[]) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve(tabs || []);
          }
        );
      });

      const focusedTabs: FocusedTab[] = [];

      for (const tab of tabs) {
        if (!tab || !tab.id) {
          continue;
        }

        focusedTabs.push({
          tabId: tab.id,
          containerName: `Tab ${tab.id}`,
          title: tab.title || "Untitled",
          url: tab.url,
        });
      }

      return focusedTabs;
    } catch (error) {
      console.error("[TabBroadcaster] ❌ Error getting focused tabs:", error);
      return [];
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
