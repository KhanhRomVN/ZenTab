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
  private readonly BROADCAST_THROTTLE = 1000;
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

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.zenTabSelectedTabs) {
        debouncedBroadcast();
      }

      if (changes.wsStates) {
        const newStates = changes.wsStates.newValue || {};
        const oldStates = changes.wsStates.oldValue || {};

        let hasNewConnection = false;
        for (const [connId, newState] of Object.entries(newStates)) {
          const typedNewState = newState as { status: string };
          const oldState = oldStates[connId] as { status: string } | undefined;

          // Không cần kiểm tra "default connection" vì chỉ có 1 connection duy nhất
          if (
            typedNewState.status === "connected" &&
            oldState?.status !== "connected"
          ) {
            hasNewConnection = true;
            break;
          }
        }

        if (hasNewConnection) {
          debouncedBroadcast();
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

    if (this.broadcastCount % 10 !== 1) {
      return;
    }

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
    } catch (error) {}
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

      // Step 2: Build focused tabs array (no container filtering)
      const focusedTabs: FocusedTab[] = [];

      for (const tab of allDeepSeekTabs) {
        try {
          // Validate tab data
          if (!tab || !tab.id) {
            continue;
          }

          // Add to focused tabs (without container info)
          const focusedTab = {
            tabId: tab.id,
            containerName: `Tab ${tab.id}`, // Simple identifier
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
