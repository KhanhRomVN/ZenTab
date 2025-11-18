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
  private readonly BROADCAST_THROTTLE = 1000; // 🆕 TĂNG: 1s throttle để giảm spam
  private broadcastCount = 0; // 🆕 THÊM: Đếm số lần broadcast

  constructor(wsManager: WSManagerNew) {
    this.wsManager = wsManager;
    this.setupListeners();
  }

  private setupListeners(): void {
    let pendingBroadcast: NodeJS.Timeout | null = null;

    // 🆕 ĐƠN GIẢN HÓA: Chỉ dùng debounce đơn giản
    const debouncedBroadcast = () => {
      if (pendingBroadcast) {
        clearTimeout(pendingBroadcast);
      }
      pendingBroadcast = setTimeout(() => {
        this.broadcastFocusedTabs();
        pendingBroadcast = null;
      }, 500);
    };

    // 🆕 GIẢM: Chỉ lắng nghe storage changes quan trọng
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      // 🆕 CHỈ broadcast khi có thay đổi thực sự
      if (changes.zenTabSelectedTabs || changes.wsConnectionEstablished) {
        debouncedBroadcast();
      }

      // 🆕 GIẢM LOG: Chỉ log wsStates changes khi có kết nối mới
      if (changes.wsStates) {
        const newStates = changes.wsStates.newValue || {};
        const oldStates = changes.wsStates.oldValue || {};

        let hasNewConnection = false;
        for (const [connId, newState] of Object.entries(newStates)) {
          const typedNewState = newState as { status: string; port: number };
          const oldState = oldStates[connId] as
            | { status: string; port: number }
            | undefined;

          // 🆕 CHỈ quan tâm đến port 1500
          if (
            typedNewState.port === 1500 &&
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

    // 🆕 GIẢM: Chỉ lắng nghe tab events quan trọng
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (
        tab.url?.startsWith("https://chat.deepseek.com") &&
        (changeInfo.title || changeInfo.url)
      ) {
        debouncedBroadcast();
      }
    });

    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      debouncedBroadcast();
    });
  }

  /**
   * Broadcast focused tabs to all connected WebSocket clients
   */
  public async broadcastFocusedTabs(): Promise<void> {
    this.broadcastCount++;

    // 🆕 GIẢM LOG: Chỉ log mỗi 10 lần broadcast
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
    } catch (error) {
      console.error("[TabBroadcaster] ❌ Failed to broadcast:", error);
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

      // ✅ Step 1: Get ALL DeepSeek tabs (including sleeping, duplicate containers)
      let allDeepSeekTabs: chrome.tabs.Tab[] = [];

      try {
        const result = await new Promise<chrome.tabs.Tab[]>(
          (resolve, reject) => {
            try {
              browserAPI.tabs.query(
                { url: "https://chat.deepseek.com/*" },
                (tabs: chrome.tabs.Tab[]) => {
                  if (browserAPI.runtime.lastError) {
                    console.error(
                      "[TabBroadcaster] ❌ Tabs query error:",
                      browserAPI.runtime.lastError
                    );
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve(tabs || []);
                }
              );
            } catch (callError) {
              console.error(
                "[TabBroadcaster] ❌ Exception in tabs.query call:",
                callError
              );
              reject(callError);
            }
          }
        );

        allDeepSeekTabs = result || [];
      } catch (tabsError) {
        console.error(
          "[TabBroadcaster] ❌ CRITICAL: Failed to query tabs:",
          tabsError
        );
        console.error("[TabBroadcaster] Error details:", {
          name: tabsError instanceof Error ? tabsError.name : "unknown",
          message:
            tabsError instanceof Error ? tabsError.message : String(tabsError),
          stack: tabsError instanceof Error ? tabsError.stack : undefined,
          toString: String(tabsError),
        });
        return [];
      }

      if (allDeepSeekTabs.length === 0) {
        console.warn("[TabBroadcaster] ⚠️ No DeepSeek tabs found in browser!");
        console.warn(
          "[TabBroadcaster] User needs to open DeepSeek tabs first."
        );
        return [];
      }

      // Step 2: Build focused tabs array (no container filtering)
      const focusedTabs: FocusedTab[] = [];

      for (const tab of allDeepSeekTabs) {
        try {
          // Validate tab data
          if (!tab || !tab.id) {
            console.warn("[TabBroadcaster] ⚠️ Invalid tab object:", tab);
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
        } catch (error) {
          console.error(
            "[TabBroadcaster] ❌ CRITICAL: Unexpected error processing tab:",
            {
              tabId: tab.id,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            }
          );
        }
      }

      return focusedTabs;
    } catch (error) {
      console.error("[TabBroadcaster] FATAL ERROR in getFocusedTabs:", error);
      return [];
    }
  }
}
