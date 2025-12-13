// src/background/core/managers/websocket/ws-broadcaster.ts

import { WSManager } from "./ws-manager";

interface FocusedTab {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  provider?: "deepseek" | "chatgpt" | "gemini" | "grok" | "claude";
  cookieStoreId?: string;
  folderPath?: string | null;
  conversationId?: string | null;
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
          console.log("[TabBroadcaster] 🔔 wsMessages changed, handling...");
          this.handleWSMessages(changes.wsMessages);
        }
      }
    );

    // Tab events
    browserAPI.tabs.onUpdated.addListener(
      (
        _tabId: number,
        changeInfo: { title?: string; url?: string },
        tab: chrome.tabs.Tab
      ) => {
        // 🆕 Check tất cả AI chat URLs (không chỉ DeepSeek)
        if (!tab.url) return;

        const isAIChatTab =
          tab.url.includes("deepseek.com") ||
          tab.url.includes("chatgpt.com") ||
          tab.url.includes("openai.com") ||
          tab.url.includes("claude.ai") ||
          tab.url.includes("aistudio.google.com/prompts") ||
          tab.url.includes("grok.com");

        if (isAIChatTab && (changeInfo.title || changeInfo.url)) {
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

    console.log(
      "[TabBroadcaster] 📬 Checking wsMessages:",
      Object.keys(messages).length,
      "connections"
    );

    for (const [connId, msgArray] of Object.entries(messages)) {
      const msgs = msgArray as Array<{ timestamp: number; data: any }>;
      const recentMsgs = msgs.filter((msg) => {
        const age = Date.now() - msg.timestamp;
        return age < 5000;
      });

      console.log(
        `[TabBroadcaster] 📨 Connection ${connId}: ${recentMsgs.length} recent messages`
      );

      if (recentMsgs.length === 0) continue;

      const latestMsg = recentMsgs[recentMsgs.length - 1];

      console.log(
        `[TabBroadcaster] 🔍 Latest message type: ${latestMsg.data.type}`
      );

      if (latestMsg.data.type === "requestFocusedTabs") {
        console.log(
          "[TabBroadcaster] 🎯 requestFocusedTabs detected, broadcasting tabs"
        );
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
      console.log(
        "[TabBroadcaster] ⚠️ No active connections, skipping broadcast"
      );
      return;
    }

    this.lastBroadcastTime = now;

    try {
      const focusedTabs = await this.getFocusedTabs();

      console.log(
        `[TabBroadcaster] 📡 Broadcasting ${focusedTabs.length} tabs:`,
        focusedTabs.map((t) => ({ tabId: t.tabId, container: t.containerName }))
      );

      if (focusedTabs.length === 0) {
        console.log("[TabBroadcaster] ⚠️ No tabs to broadcast");
        return;
      }

      const message = {
        type: "focusedTabsUpdate",
        data: focusedTabs,
        timestamp: Date.now(),
      };

      this.wsManager.broadcastToAll(message);
      console.log("[TabBroadcaster] ✅ Broadcast sent");
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

      // 🆕 Get tab states from session storage
      const storage = await new Promise<any>((resolve) => {
        if (!browserAPI.storage || !browserAPI.storage.session) {
          resolve({});
          return;
        }
        browserAPI.storage.session.get("zenTabStates", (result: any) => {
          resolve(result || {});
        });
      });
      const zenTabStates = storage.zenTabStates || {};

      // 🆕 Query tất cả AI chat tabs (không chỉ DeepSeek)
      const urlPatterns = [
        "https://chat.deepseek.com/*",
        "https://chatgpt.com/*",
        "https://*.openai.com/*",
        "https://claude.ai/*",
        "https://aistudio.google.com/prompts/*",
        "https://grok.com/*",
      ];

      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        browserAPI.tabs.query(
          { url: urlPatterns },
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

        // 🆕 Detect provider from URL
        const provider = this.detectProvider(tab.url);

        // 🆕 FIX: Get cookieStoreId và container name
        const cookieStoreId = (tab as any).cookieStoreId || undefined;
        const containerName = await this.getContainerName(cookieStoreId);

        // Get state from storage
        const tabState = zenTabStates[tab.id];

        focusedTabs.push({
          tabId: tab.id,
          containerName: containerName || `Tab ${tab.id}`,
          title: tab.title || "Untitled",
          url: tab.url,
          provider: provider,
          cookieStoreId: cookieStoreId,
          folderPath: tabState?.folderPath || null,
          conversationId: tabState?.conversationId || null,
        });
      }

      return focusedTabs;
    } catch (error) {
      console.error("[TabBroadcaster] ❌ Error getting focused tabs:", error);
      return [];
    }
  }

  /**
   * 🆕 Detect provider from URL
   */
  private detectProvider(
    url?: string
  ): "deepseek" | "chatgpt" | "gemini" | "grok" | "claude" | undefined {
    if (!url) return undefined;

    const urlLower = url.toLowerCase();

    if (urlLower.includes("deepseek.com")) return "deepseek";
    if (urlLower.includes("chatgpt.com") || urlLower.includes("openai.com"))
      return "chatgpt";
    if (urlLower.includes("aistudio.google.com/prompts")) return "gemini";
    if (urlLower.includes("grok.com")) return "grok";
    if (urlLower.includes("claude.ai")) return "claude";

    return undefined;
  }

  /**
   * 🆕 Get container name from cookieStoreId
   */
  private async getContainerName(
    cookieStoreId?: string
  ): Promise<string | null> {
    if (!cookieStoreId || cookieStoreId === "firefox-default") {
      return null;
    }

    try {
      const isFirefox = typeof (globalThis as any).browser !== "undefined";
      if (!isFirefox) return null;

      const browserAPI = (globalThis as any).browser;
      if (!browserAPI.contextualIdentities) return null;

      const container = await browserAPI.contextualIdentities.get(
        cookieStoreId
      );
      return container?.name || null;
    } catch (error) {
      return null;
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
