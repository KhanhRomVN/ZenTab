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
        this.broadcastFocusedTabs();
      }

      // THÊM: Listen for WebSocket connection established
      if (changes.triggerFocusedTabsBroadcast) {
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
      let selectedTabs: Record<string, number> = {};

      try {
        const browserAPI =
          typeof (globalThis as any).browser !== "undefined"
            ? (globalThis as any).browser
            : chrome;

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

      if (Object.keys(selectedTabs).length === 0) {
        console.warn("[TabBroadcaster] ⚠️ No selected tabs found in storage!");
        console.warn(
          "[TabBroadcaster] User needs to select tabs via ZenTab sidebar first."
        );
        return [];
      }

      let containers: any[] = [];
      let retries = 3;

      while (retries > 0 && containers.length === 0) {
        try {
          const browserAPI =
            typeof (globalThis as any).browser !== "undefined"
              ? (globalThis as any).browser
              : chrome;

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

          if (Array.isArray(result)) {
            containers = result;
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
        try {
          // ✅ Step 3.1: Validate tabId type
          const tabIdNum =
            typeof tabId === "number" ? tabId : parseInt(String(tabId));

          if (isNaN(tabIdNum) || tabIdNum <= 0) {
            console.error("[TabBroadcaster] ❌ Invalid tabId:", tabId);
            continue;
          }

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

          // ✅ Step 3.5: Add to focused tabs
          const focusedTab = {
            tabId: tab.id,
            containerName: container.name,
            title: tab.title || "Untitled",
            url: tab.url,
          };

          focusedTabs.push(focusedTab);
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

      return focusedTabs;
    } catch (error) {
      console.error("[TabBroadcaster] FATAL ERROR in getFocusedTabs:", error);
      return [];
    }
  }
}
