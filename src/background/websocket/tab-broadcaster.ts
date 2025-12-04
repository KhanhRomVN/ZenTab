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

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.zenTabSelectedTabs) {
        console.log(
          `[TabBroadcaster] 🔔 zenTabSelectedTabs changed, triggering broadcast`
        );
        debouncedBroadcast();
      }

      if (changes.wsStates) {
        console.log(`[TabBroadcaster] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[TabBroadcaster] 📡 wsStates CHANGED - Analyzing...`);
        console.log(`[TabBroadcaster] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const newStates = changes.wsStates.newValue || {};
        const oldStates = changes.wsStates.oldValue || {};

        console.log(`[TabBroadcaster] 📊 Storage Change Details:`);
        console.log(
          `[TabBroadcaster]   - oldStates keys: [${Object.keys(oldStates).join(
            ", "
          )}]`
        );
        console.log(
          `[TabBroadcaster]   - newStates keys: [${Object.keys(newStates).join(
            ", "
          )}]`
        );
        console.log(
          `[TabBroadcaster]   - oldStates content:`,
          JSON.stringify(oldStates, null, 2)
        );
        console.log(
          `[TabBroadcaster]   - newStates content:`,
          JSON.stringify(newStates, null, 2)
        );

        let hasNewConnection = false;

        // Check 1: Detect NEW connectionId (server restart)
        const newConnIds = Object.keys(newStates);
        const oldConnIds = Object.keys(oldStates);

        console.log(`[TabBroadcaster] 🔍 Connection ID Analysis:`);
        console.log(
          `[TabBroadcaster]   - Old connection IDs count: ${oldConnIds.length}`
        );
        console.log(
          `[TabBroadcaster]   - New connection IDs count: ${newConnIds.length}`
        );

        if (newConnIds.length > 0) {
          const latestConnId = newConnIds[0];
          console.log(
            `[TabBroadcaster]   - Latest connection ID: ${latestConnId}`
          );

          // Case 1: connectionId mới xuất hiện (không có trong oldStates)
          if (!oldConnIds.includes(latestConnId)) {
            console.log(
              `[TabBroadcaster] ✅ CASE 1: NEW connection ID detected!`
            );
            const newState = newStates[latestConnId] as { status: string };
            console.log(
              `[TabBroadcaster]   - New state status: ${newState.status}`
            );

            if (newState.status === "connected") {
              console.log(
                `[TabBroadcaster] 🔔 NEW CONNECTION ID detected (${latestConnId}), triggering broadcast`
              );
              hasNewConnection = true;
            } else {
              console.log(
                `[TabBroadcaster] ⚠️ New connection ID but status is NOT 'connected' (status: ${newState.status})`
              );
            }
          } else {
            console.log(
              `[TabBroadcaster] ✅ CASE 2: EXISTING connection ID, checking status change...`
            );
            // Case 2: connectionId cũ nhưng status changed to "connected"
            const newState = newStates[latestConnId] as { status: string };
            const oldState = oldStates[latestConnId] as
              | { status: string }
              | undefined;

            console.log(
              `[TabBroadcaster]   - Old status: ${
                oldState?.status || "undefined"
              }`
            );
            console.log(`[TabBroadcaster]   - New status: ${newState.status}`);

            if (
              newState.status === "connected" &&
              oldState?.status !== "connected"
            ) {
              console.log(
                `[TabBroadcaster] 🔔 Connection status changed to CONNECTED (${latestConnId}), triggering broadcast`
              );
              hasNewConnection = true;
            } else {
              console.log(
                `[TabBroadcaster] ⚠️ No status change to 'connected' detected`
              );
            }
          }
        } else {
          console.log(
            `[TabBroadcaster] ⚠️ No connection IDs in newStates (storage might be empty)`
          );
        }

        console.log(
          `[TabBroadcaster] 🎯 Final Decision: hasNewConnection = ${hasNewConnection}`
        );
        console.log(`[TabBroadcaster] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        if (hasNewConnection) {
          console.log(`[TabBroadcaster] 🚀 Calling debouncedBroadcast()...`);
          debouncedBroadcast();
        } else {
          console.log(
            `[TabBroadcaster] 🛑 NOT calling broadcast (no new connection detected)`
          );
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
    console.log(
      `[TabBroadcaster] 📊 Broadcast attempt #${this.broadcastCount}`
    );

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

      console.log(
        `[TabBroadcaster] 📡 Broadcasting ${focusedTabs.length} tabs to Zen extension`
      );
      this.wsManager.broadcastToAll(message);
    } catch (error) {
      console.error(`[TabBroadcaster] ❌ Error broadcasting tabs:`, error);
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
