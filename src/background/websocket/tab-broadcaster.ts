// src/background/websocket/tab-broadcaster.ts
import { WSManagerNew } from "./ws-manager-new";

const getBrowserAPI = () => {
  if (typeof (globalThis as any).browser !== "undefined") {
    console.debug("[TabBroadcaster] Using Firefox browser API");
    return (globalThis as any).browser;
  }
  if (typeof chrome !== "undefined") {
    console.debug("[TabBroadcaster] Using Chrome API");
    return chrome;
  }
  throw new Error("[TabBroadcaster] No browser API available!");
};

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
    console.debug("[TabBroadcaster] ===== START getFocusedTabs =====");

    try {
      // ✅ Step 1: Get selected tabs - Firefox-compatible
      console.debug(
        "[TabBroadcaster] 🔍 Step 1: Reading zenTabSelectedTabs from storage..."
      );

      let selectedTabs: Record<string, number> = {};

      try {
        // ✅ Firefox-compatible Promise wrapper - PROPER WAY
        const browserAPI =
          typeof (globalThis as any).browser !== "undefined"
            ? (globalThis as any).browser
            : chrome;

        console.debug(
          "[TabBroadcaster] 📦 Browser API type:",
          typeof browserAPI
        );
        console.debug(
          "[TabBroadcaster] 📦 storage.local.get type:",
          typeof browserAPI.storage?.local?.get
        );

        // ✅ CRITICAL FIX: Wrap trong Promise constructor để handle Firefox callback
        const result = await new Promise<any>((resolve, reject) => {
          try {
            browserAPI.storage.local.get(
              ["zenTabSelectedTabs"],
              (data: any) => {
                // ✅ Check for errors
                if (browserAPI.runtime.lastError) {
                  console.error(
                    "[TabBroadcaster] ❌ Storage read error:",
                    browserAPI.runtime.lastError
                  );
                  reject(browserAPI.runtime.lastError);
                  return;
                }

                console.debug("[TabBroadcaster] 📦 Raw storage data:", data);
                resolve(data || {});
              }
            );
          } catch (callError) {
            console.error(
              "[TabBroadcaster] ❌ Exception in storage.local.get call:",
              callError
            );
            reject(callError);
          }
        });

        selectedTabs = result?.zenTabSelectedTabs || {};

        console.debug("[TabBroadcaster] ✅ Storage read successful");
        console.debug(
          "[TabBroadcaster] Selected tabs from storage:",
          JSON.stringify(selectedTabs)
        );
        console.debug(
          "[TabBroadcaster] Selected tabs keys:",
          Object.keys(selectedTabs)
        );
        console.debug(
          "[TabBroadcaster] Selected tabs count:",
          Object.keys(selectedTabs).length
        );
      } catch (storageError) {
        console.error(
          "[TabBroadcaster] ❌ CRITICAL: Failed to read storage:",
          storageError
        );
        console.error("[TabBroadcaster] Error details:", {
          name: storageError instanceof Error ? storageError.name : "unknown",
          message:
            storageError instanceof Error
              ? storageError.message
              : String(storageError),
          stack: storageError instanceof Error ? storageError.stack : undefined,
          toString: String(storageError),
        });
        return [];
      }

      // ✅ Early return nếu không có tab nào được chọn
      if (Object.keys(selectedTabs).length === 0) {
        console.warn("[TabBroadcaster] ⚠️ No selected tabs found in storage!");
        console.warn(
          "[TabBroadcaster] User needs to select tabs via ZenTab sidebar first."
        );
        return [];
      }

      // ✅ Step 2: Get all containers - Firefox-compatible
      console.debug("[TabBroadcaster] 🔍 Step 2: Loading containers...");

      let containers: any[] = [];
      let retries = 3;

      while (retries > 0 && containers.length === 0) {
        try {
          const browserAPI =
            typeof (globalThis as any).browser !== "undefined"
              ? (globalThis as any).browser
              : chrome;

          console.debug(
            "[TabBroadcaster] Attempting to load containers (attempt",
            4 - retries,
            ")"
          );

          if (
            !browserAPI.contextualIdentities ||
            !browserAPI.contextualIdentities.query
          ) {
            console.error(
              "[TabBroadcaster] ❌ contextualIdentities API not available!"
            );
            console.error(
              "[TabBroadcaster] Check manifest.json permissions: contextualIdentities"
            );
            break;
          }

          const result = await browserAPI.contextualIdentities.query({});

          console.debug(
            "[TabBroadcaster] contextualIdentities.query result type:",
            typeof result
          );
          console.debug(
            "[TabBroadcaster] contextualIdentities.query result:",
            result
          );

          if (Array.isArray(result)) {
            containers = result;
            console.debug(
              "[TabBroadcaster] ✅ Containers loaded successfully:",
              containers.length
            );
            console.debug(
              "[TabBroadcaster] Container IDs:",
              containers.map((c) => c.cookieStoreId)
            );
          } else {
            console.warn(
              "[TabBroadcaster] ⚠️ Query returned non-array:",
              result
            );
          }
        } catch (containerError) {
          console.error(
            "[TabBroadcaster] ❌ Container load attempt",
            4 - retries,
            "failed:",
            containerError
          );
          console.error("[TabBroadcaster] Error details:", {
            name:
              containerError instanceof Error ? containerError.name : "unknown",
            message:
              containerError instanceof Error
                ? containerError.message
                : String(containerError),
            stack:
              containerError instanceof Error
                ? containerError.stack
                : undefined,
          });

          retries--;

          if (retries > 0) {
            console.debug("[TabBroadcaster] Waiting 500ms before retry...");
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (containers.length === 0) {
        console.error(
          "[TabBroadcaster] ❌ CRITICAL: Could not load any containers after all retries!"
        );
        return [];
      }

      // ✅ Step 3: Build focused tabs array with detailed error handling
      const focusedTabs: FocusedTab[] = [];

      for (const [cookieStoreId, tabId] of Object.entries(selectedTabs)) {
        console.debug("[TabBroadcaster] 🔄 Processing:", {
          cookieStoreId,
          tabId,
        });

        try {
          // ✅ Step 3.1: Validate tabId type
          const tabIdNum =
            typeof tabId === "number" ? tabId : parseInt(String(tabId));

          if (isNaN(tabIdNum) || tabIdNum <= 0) {
            console.error("[TabBroadcaster] ❌ Invalid tabId:", tabId);
            continue;
          }

          console.debug(
            "[TabBroadcaster] 🔍 Getting tab details for tabId:",
            tabIdNum
          );

          // ✅ Step 3.2: Get tab details với Firefox-compatible approach
          let tab: chrome.tabs.Tab;
          try {
            const browserAPI =
              typeof (globalThis as any).browser !== "undefined"
                ? (globalThis as any).browser
                : chrome;

            // ✅ CRITICAL FIX: Wrap chrome.tabs.get trong Promise cho Firefox
            tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
              try {
                browserAPI.tabs.get(tabIdNum, (result: chrome.tabs.Tab) => {
                  if (browserAPI.runtime.lastError) {
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  if (!result) {
                    reject(new Error("Tab not found"));
                    return;
                  }
                  resolve(result);
                });
              } catch (callError) {
                reject(callError);
              }
            });

            console.debug("[TabBroadcaster] ✅ Tab found:", {
              id: tab.id,
              title: tab.title,
              url: tab.url,
              cookieStoreId: (tab as any).cookieStoreId,
            });
          } catch (tabError) {
            console.error(
              "[TabBroadcaster] ❌ Tab not found (may have been closed):",
              tabIdNum,
              tabError
            );

            // Xóa tab không tồn tại khỏi storage để tránh lỗi lần sau
            try {
              const browserAPI =
                typeof (globalThis as any).browser !== "undefined"
                  ? (globalThis as any).browser
                  : chrome;

              const result = await new Promise<any>((resolve, reject) => {
                browserAPI.storage.local.get(
                  ["zenTabSelectedTabs"],
                  (data: any) => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve(data || {});
                  }
                );
              });

              const currentSelected = result?.zenTabSelectedTabs || {};
              delete currentSelected[cookieStoreId];

              await new Promise<void>((resolve, reject) => {
                browserAPI.storage.local.set(
                  { zenTabSelectedTabs: currentSelected },
                  () => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve();
                  }
                );
              });

              console.warn(
                "[TabBroadcaster] 🗑️ Removed invalid tab from storage:",
                cookieStoreId
              );
            } catch (cleanupError) {
              console.error(
                "[TabBroadcaster] Failed to cleanup invalid tab:",
                cleanupError
              );
            }

            continue;
          }

          // ✅ Step 3.3: Validate tab data
          if (!tab || !tab.id) {
            console.warn("[TabBroadcaster] ⚠️ Invalid tab object:", tab);
            continue;
          }

          console.debug(
            "[TabBroadcaster] 🔍 Finding container for:",
            cookieStoreId
          );

          // ✅ Step 3.4: Find matching container
          const container = containers.find(
            (c) => c && c.cookieStoreId === cookieStoreId
          );

          if (!container) {
            console.warn(
              "[TabBroadcaster] ⚠️ Container not found for:",
              cookieStoreId,
              "\nAvailable containers:",
              containers.map((c) => ({
                id: c.cookieStoreId,
                name: c.name,
              }))
            );
            continue;
          }

          console.debug("[TabBroadcaster] ✅ Container found:", {
            id: container.cookieStoreId,
            name: container.name,
          });

          // ✅ Step 3.5: Add to focused tabs
          const focusedTab = {
            tabId: tab.id,
            containerName: container.name,
            title: tab.title || "Untitled",
            url: tab.url,
          };

          focusedTabs.push(focusedTab);

          console.debug("[TabBroadcaster] ✅ Successfully added focused tab:", {
            tabId: focusedTab.tabId,
            container: focusedTab.containerName,
            title: focusedTab.title,
            currentCount: focusedTabs.length,
          });
        } catch (error) {
          console.error(
            "[TabBroadcaster] ❌ CRITICAL: Unexpected error processing tab:",
            {
              tabId,
              cookieStoreId,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            }
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
