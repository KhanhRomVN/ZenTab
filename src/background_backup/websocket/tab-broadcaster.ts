// src/background/websocket/tab-broadcaster.ts
import { WSManagerNew } from "./ws-manager-new";

interface FocusedTab {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
}

export class TabBroadcaster {
  private wsManager: WSManagerNew;
  private lastBroadcastTime = 0;
  private readonly BROADCAST_THROTTLE = 2000; // 2 seconds để tránh spam
  private broadcastCount = 0;

  constructor(wsManager: WSManagerNew) {
    this.wsManager = wsManager;
    this.setupListeners();
  }

  private setupListeners(): void {
    let pendingBroadcast: NodeJS.Timeout | null = null;

    const debouncedBroadcast = () => {
      if (pendingBroadcast) {
        clearTimeout(pendingBroadcast);
      }
      pendingBroadcast = setTimeout(() => {
        this.broadcastFocusedTabs();
        pendingBroadcast = null;
      }, 500);
    };

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.zenTabSelectedTabs) {
        debouncedBroadcast();
      }

      if (changes.wsStates) {
        const newStates = changes.wsStates.newValue || {};
        const oldStates = changes.wsStates.oldValue || {};

        let hasDisconnected = false;

        for (const [connId, newState] of Object.entries(newStates)) {
          const oldState = oldStates[connId];
          if (
            oldState?.status === "connected" &&
            newState.status === "disconnected"
          ) {
            hasDisconnected = true;
            break;
          }
        }

        if (
          Object.keys(newStates).length === 0 &&
          Object.keys(oldStates).length > 0
        ) {
          hasDisconnected = true;
        }

        const newConnIds = Object.keys(newStates);
        const oldConnIds = Object.keys(oldStates);

        if (oldConnIds.length > 0 && newConnIds.length === 0) {
          hasDisconnected = true;
        } else if (newConnIds.length > 0) {
          for (const connId of newConnIds) {
            const oldState = oldStates[connId];
            const newState = newStates[connId];

            if (
              oldState?.status === "connected" &&
              newState?.status === "disconnected"
            ) {
              hasDisconnected = true;
              break;
            }
          }
        }

        let hasNewConnection = false;

        if (newConnIds.length > 0) {
          const latestConnId = newConnIds[0];

          if (!oldConnIds.includes(latestConnId)) {
            const newState = newStates[latestConnId] as { status: string };

            if (newState.status === "connected") {
              hasNewConnection = true;
            }
          } else {
            const newState = newStates[latestConnId] as { status: string };
            const oldState = oldStates[latestConnId] as
              | { status: string }
              | undefined;

            if (
              newState.status === "connected" &&
              oldState?.status !== "connected"
            ) {
              hasNewConnection = true;
            }
          }
        }

        if (hasDisconnected) {
          const disconnectMessage = {
            type: "focusedTabsUpdate",
            data: [],
            timestamp: Date.now(),
          };

          this.wsManager.broadcastToAll(disconnectMessage);
        } else if (hasNewConnection) {
          debouncedBroadcast();
        }
      }
    });

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsMessages) {
        const messages = changes.wsMessages.newValue || {};

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
    });

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (
        tab.url?.startsWith("https://chat.deepseek.com") &&
        (changeInfo.title || changeInfo.url)
      ) {
        debouncedBroadcast();
      }
    });

    chrome.tabs.onRemoved.addListener((_tabId) => {
      debouncedBroadcast();
    });
  }

  public async broadcastFocusedTabs(): Promise<void> {
    this.broadcastCount++;

    const hasConnections = await this.wsManager.hasActiveConnections();

    if (!hasConnections) {
      return;
    }

    const now = Date.now();
    if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE) {
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
      // Keep the error handling but remove console.error
    }
  }

  /**
   * Get all focused tabs with their details
   */
  private async getFocusedTabs(): Promise<FocusedTab[]> {
    try {
      const browserAPI =
        typeof (globalThis as any).browser !== "undefined"
          ? (globalThis as any).browser
          : chrome;

      let allDeepSeekTabs: chrome.tabs.Tab[] = [];

      try {
        const result = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            try {
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
            } catch (callError) {
              reject(callError);
            }
          }
        );

        allDeepSeekTabs = result || [];
      } catch (tabsError) {
        return [];
      }

      if (allDeepSeekTabs.length === 0) {
        return [];
      }

      const focusedTabs: FocusedTab[] = [];

      for (const tab of allDeepSeekTabs) {
        try {
          if (!tab || !tab.id) {
            continue;
          }

          const focusedTab = {
            tabId: tab.id,
            containerName: `Tab ${tab.id}`,
            title: tab.title || "Untitled",
            url: tab.url,
          };

          focusedTabs.push(focusedTab);
        } catch (error) {}
      }

      return focusedTabs;
    } catch (error) {
      return [];
    }
  }
}
