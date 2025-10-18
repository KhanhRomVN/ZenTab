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
  private readonly BROADCAST_THROTTLE = 500; // 500ms throttle

  constructor(wsManager: WSManagerNew) {
    this.wsManager = wsManager;
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for tab selection changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.zenTabSelectedTabs) {
        console.debug("[TabBroadcaster] Selected tabs changed");
        this.broadcastFocusedTabs();
      }

      // THÊM: Listen for WebSocket connection established
      if (changes.triggerFocusedTabsBroadcast) {
        console.debug(
          "[TabBroadcaster] WebSocket connected, broadcasting initial state"
        );
        this.broadcastFocusedTabs();
      }
    });

    // Listen for tab updates (title change, url change, etc.)
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.title || changeInfo.url) {
        this.broadcastFocusedTabs();
      }
    });

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener(() => {
      this.broadcastFocusedTabs();
    });
  }

  /**
   * Broadcast focused tabs to all connected WebSocket clients
   */
  public async broadcastFocusedTabs(): Promise<void> {
    // Throttle broadcasts
    const now = Date.now();
    if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE) {
      return;
    }
    this.lastBroadcastTime = now;

    try {
      const focusedTabs = await this.getFocusedTabs();

      console.debug(
        "[TabBroadcaster] Broadcasting focused tabs:",
        focusedTabs.length
      );

      // Send to all connected WebSocket clients
      const message = {
        type: "focusedTabsUpdate",
        data: focusedTabs,
        timestamp: Date.now(),
      };

      this.wsManager.broadcastToAll(message);
    } catch (error) {
      console.error("[TabBroadcaster] Failed to broadcast:", error);
    }
  }

  /**
   * Get all focused tabs with their details
   */
  private async getFocusedTabs(): Promise<FocusedTab[]> {
    try {
      // ✅ Step 1: Get selected tabs with detailed logging
      const result = await new Promise<any>((resolve, reject) => {
        chrome.storage.local.get(["zenTabSelectedTabs"], (data) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data || {});
          }
        });
      });

      const selectedTabs = result?.zenTabSelectedTabs || {};

      console.debug(
        "[TabBroadcaster] Selected tabs from storage:",
        selectedTabs
      );
      console.debug(
        "[TabBroadcaster] Selected tabs count:",
        Object.keys(selectedTabs).length
      );

      // ✅ Early return nếu không có tab nào được chọn
      if (Object.keys(selectedTabs).length === 0) {
        console.warn(
          "[TabBroadcaster] No selected tabs found in storage! This is likely the issue."
        );
        console.warn(
          "[TabBroadcaster] User needs to select tabs via ZenTab sidebar first."
        );
        return [];
      }

      // ✅ Step 2: Get all containers with retry logic
      let containers: any[] = [];
      let retries = 3;

      while (retries > 0 && containers.length === 0) {
        try {
          // Check if running in Firefox environment
          const browserAPI =
            typeof globalThis !== "undefined" && (globalThis as any).browser
              ? (globalThis as any).browser
              : chrome;

          if (
            (browserAPI as any).contextualIdentities &&
            (browserAPI as any).contextualIdentities.query
          ) {
            const result = await (browserAPI as any).contextualIdentities.query(
              {}
            );

            if (Array.isArray(result)) {
              containers = result;
              console.debug(
                "[TabBroadcaster] Containers loaded:",
                containers.length
              );
            } else {
              console.warn(
                "[TabBroadcaster] contextualIdentities.query returned non-array:",
                result
              );
            }
          } else {
            console.warn(
              "[TabBroadcaster] contextualIdentities API not available - check Firefox permissions"
            );
            break;
          }
        } catch (containerError) {
          console.error(
            "[TabBroadcaster] Failed to get containers (attempt",
            4 - retries,
            "):",
            containerError
          );
          retries--;

          if (retries > 0) {
            // Wait 500ms before retry
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (containers.length === 0) {
        console.error(
          "[TabBroadcaster] CRITICAL: Could not load any containers after retries!"
        );
        return [];
      }

      // ✅ Step 3: Build focused tabs array with detailed error handling
      const focusedTabs: FocusedTab[] = [];

      for (const [cookieStoreId, tabId] of Object.entries(selectedTabs)) {
        console.debug("[TabBroadcaster] Processing:", { cookieStoreId, tabId });

        try {
          // Get tab details
          const tab = await chrome.tabs.get(tabId as number);
          console.debug("[TabBroadcaster] Tab found:", {
            id: tab.id,
            title: tab.title,
            url: tab.url,
          });

          // Find matching container
          const container = containers.find(
            (c) => c && c.cookieStoreId === cookieStoreId
          );

          if (!container) {
            console.warn(
              "[TabBroadcaster] Container not found for:",
              cookieStoreId,
              "Available containers:",
              containers.map((c) => c.cookieStoreId)
            );
            continue;
          }

          console.debug("[TabBroadcaster] Container found:", container.name);

          // ✅ Validate tab before adding
          if (tab && tab.id) {
            focusedTabs.push({
              tabId: tab.id,
              containerName: container.name,
              title: tab.title || "Untitled",
              url: tab.url,
            });

            console.debug("[TabBroadcaster] ✅ Added focused tab:", {
              tabId: tab.id,
              container: container.name,
              title: tab.title,
            });
          } else {
            console.warn("[TabBroadcaster] Invalid tab data:", {
              tab,
              container: container.name,
            });
          }
        } catch (error) {
          console.error(
            "[TabBroadcaster] Failed to process tab:",
            tabId,
            "in container:",
            cookieStoreId,
            "Error:",
            error
          );
        }
      }

      console.debug("[TabBroadcaster] ===== FINAL RESULT =====", {
        inputTabsCount: Object.keys(selectedTabs).length,
        outputTabsCount: focusedTabs.length,
        tabs: focusedTabs,
      });

      return focusedTabs;
    } catch (error) {
      console.error("[TabBroadcaster] FATAL ERROR in getFocusedTabs:", error);
      return [];
    }
  }
}
