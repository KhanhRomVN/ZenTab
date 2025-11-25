import React, { useState, useEffect } from "react";
import TabCard from "./TabCard";
import CustomButton from "../common/CustomButton";
import MenuDrawer from "./MenuDrawer";
import SettingDrawer from "./SettingDrawer";
import { Settings, Power, PowerOff } from "lucide-react";
import { WSHelper } from "@/shared/lib/ws-helper";

interface TabStateResponse {
  success: boolean;
  tabStates?: any[];
  error?: string;
}

const Sidebar: React.FC = () => {
  const [tabs, setTabs] = useState<any[]>([]);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showSettingDrawer, setShowSettingDrawer] = useState(false);
  const [, setActiveTabs] = useState<Set<string>>(new Set());
  const [wsStatus, setWsStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  const [isTogglingWs, setIsTogglingWs] = useState(false);
  const [apiProvider, setApiProvider] = useState<string>("");
  const [wsConnection, setWsConnection] = useState<{
    id: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    // 🔥 FIX: Polling nhanh hơn để đảm bảo UI luôn sync với backend state
    const intervalId = setInterval(() => {
      loadWebSocketStatus();
    }, 500); // Check every 500ms - nhanh hơn để catch state change

    return () => clearInterval(intervalId);
  }, []); // Empty deps array - chạy 1 lần và maintain interval

  useEffect(() => {
    const initializeSidebar = async () => {
      // 🔥 CRITICAL: Đọc API Provider từ storage TRƯỚC (single source of truth)
      const storageResult = await chrome.storage.local.get(["apiProvider"]);
      const storedProvider = storageResult?.apiProvider || "";

      // 🔥 FIX: Sync UI state với storage value ngay lập tức (có thể là empty string)
      setApiProvider(storedProvider);
      console.log(
        `[Sidebar] 📊 Synced API Provider from storage: "${
          storedProvider || "(empty)"
        }"`
      );

      // Load WebSocket status (chỉ load, không auto-connect)
      await loadWebSocketStatus();

      // Load tabs
      await loadTabs();

      const port = chrome.runtime.connect({ name: "zenTab-sidebar" });

      return () => {
        port.disconnect();
      };
    };

    initializeSidebar();

    const messageListener = (message: any) => {
      if (message.action === "tabsUpdated") {
        loadTabs();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const tabCreatedListener = () => {
      loadTabs();
    };

    const tabRemovedListener = () => {
      loadTabs();
    };

    const tabUpdatedListener = (
      _tabId: number,
      changeInfo: { status?: string; url?: string; title?: string },
      tab: chrome.tabs.Tab
    ) => {
      if (
        changeInfo.status === "complete" &&
        tab.url?.includes("deepseek.com")
      ) {
        setTimeout(() => {
          loadTabs();
        }, 1000);
      }
    };

    chrome.tabs.onCreated.addListener(tabCreatedListener);
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);

    const storageListener = async (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;

      if (changes.wsStates) {
        await loadWebSocketStatus();
      }

      if (changes.apiProvider) {
        const newProvider = changes.apiProvider.newValue;
        const oldProvider = changes.apiProvider.oldValue;

        // 🔥 FIX: Sync UI state khi storage thay đổi (từ Settings hoặc backend)
        if (newProvider && newProvider !== oldProvider) {
          console.log(
            `[Sidebar] 🔄 API Provider changed: ${oldProvider} → ${newProvider}`
          );
          setApiProvider(newProvider);

          // 🔥 NEW: Reload WebSocket status để update UI với connection mới
          loadWebSocketStatus();
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onCreated.removeListener(tabCreatedListener);
      chrome.tabs.onRemoved.removeListener(tabRemovedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const loadTabs = async (providedWsState?: { status: string }) => {
    try {
      let wsState = providedWsState;

      if (!wsState) {
        const storageResult = await chrome.storage.local.get(["wsStates"]);
        const states = storageResult?.wsStates || {};
        const connectionIds = Object.keys(states);
        if (connectionIds.length > 0) {
          wsState = states[connectionIds[0]];
        }
      }

      let response: TabStateResponse | null = null;
      let attempts = 0;
      const maxAttempts = 3;
      const timeoutMs = 3000;

      while (attempts < maxAttempts && !response) {
        attempts++;
        try {
          const attemptResponse = await Promise.race([
            new Promise<TabStateResponse | null>((resolve) => {
              chrome.runtime.sendMessage(
                { action: "getTabStates" },
                (response) => {
                  if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                  }

                  resolve(response as TabStateResponse);
                }
              );
            }),
            new Promise<null>((resolve) =>
              setTimeout(() => {
                resolve(null);
              }, timeoutMs)
            ),
          ]);

          if (attemptResponse && attemptResponse.success) {
            response = attemptResponse;
            break;
          }
        } catch (error) {
          console.error(`[Sidebar] ❌ Attempt ${attempts} threw error:`, error);
          console.error(`[Sidebar] 🔍 Error type: ${typeof error}`);
          console.error(
            `[Sidebar] 🔍 Error message: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        // Wait before retry (except on last attempt)
        if (attempts < maxAttempts && !response) {
          const retryDelay = 1000;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }

      if (!response) {
        console.error(
          `[Sidebar] ❌ All ${maxAttempts} attempts failed - no valid response`
        );
        console.error(
          `[Sidebar] 💡 Possible causes: ServiceWorker not responding, TabStateManager disabled, or timeout too short`
        );
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      if (!response.success) {
        console.error(
          "[Sidebar] ❌ Failed to get tab states:",
          response?.error || "Unknown error"
        );
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      const tabStates = response.tabStates || [];
      setTabs(tabStates);
      const activeTabIds: Set<string> = new Set(
        tabStates.map((t: any) => String(t.tabId))
      );

      setActiveTabs(activeTabIds);
    } catch (error) {
      console.error("[Sidebar] ❌ Error in loadTabs:", error);
      setTabs([]);
      setActiveTabs(new Set());
    }
  };

  const loadWebSocketStatus = async () => {
    try {
      const state = await WSHelper.getConnectionState();
      if (state) {
        setWsConnection({
          id: state.id,
          status: state.status,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        setWsStatus(state.status as any);
      } else {
        setWsConnection(null);
        setWsStatus("disconnected");
      }
    } catch (error) {
      console.error("[Sidebar] ❌ Error loading WebSocket status:", error);
      setWsConnection(null);
      setWsStatus("disconnected");
    }
  };

  const formatWebSocketUrl = (apiProvider: string): string => {
    // 🔥 FIX: Hiển thị message rõ ràng nếu chưa config
    if (!apiProvider || apiProvider.trim() === "") {
      return "Not configured - Click Settings to configure";
    }

    try {
      let url = apiProvider.trim();

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `http://${url}`;
      }

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      const protocol = isHttps ? "wss" : "ws";
      const host = urlObj.hostname;

      if (urlObj.port) {
        return `${protocol}://${host}:${urlObj.port}/ws`;
      } else if (isHttps) {
        return `${protocol}://${host}/ws`;
      } else {
        return `${protocol}://${host}:3030/ws`;
      }
    } catch (error) {
      return "Invalid API Provider - Check Settings";
    }
  };

  const handleApiProviderChange = async (newProvider: string) => {
    console.log(`[Sidebar] 💾 Saving new API Provider: ${newProvider}`);

    // 🔥 CRITICAL: Save to storage FIRST (single source of truth)
    await chrome.storage.local.set({
      apiProvider: newProvider,
    });

    // 🔥 FIX: Sync UI state AFTER storage write completes
    setApiProvider(newProvider);
    console.log(`[Sidebar] ✅ API Provider saved and UI synced`);

    // Reconnect WebSocket với protocol mới (ws/wss)
    if (wsConnection?.status === "connected") {
      console.log(`[Sidebar] 🔄 Reconnecting WebSocket with new provider...`);
      await WSHelper.disconnect();

      // Wait for disconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect will automatically use new protocol from storage
      await WSHelper.connect();

      // Reload WebSocket status
      await loadWebSocketStatus();
      console.log(`[Sidebar] ✅ WebSocket reconnected and status reloaded`);
    }
  };

  const handleToggleWebSocket = async () => {
    if (isTogglingWs) {
      return;
    }

    setIsTogglingWs(true);

    try {
      if (wsStatus === "connected") {
        const result = await WSHelper.disconnect();

        if (result.success) {
          setWsStatus("disconnected");
          setWsConnection(null);
        } else {
          console.error("[Sidebar] ❌ Disconnect failed:", result.error);
        }
      } else {
        const result = await WSHelper.connect();

        // ✅ FIX: Validate result structure với fallback verification
        if (!result || typeof result.success !== "boolean") {
          console.warn(
            "[Sidebar] ⚠️ Invalid response, verifying via storage..."
          );

          // Fallback: Verify bằng cách đọc trực tiếp từ storage
          await new Promise((resolve) => setTimeout(resolve, 200));
          const state = await WSHelper.getConnectionState();

          if (state && state.status === "connected") {
            console.log("[Sidebar] ✅ Connection verified via storage");
            setWsStatus("connected");
            setWsConnection({
              id: state.id,
              status: state.status,
            });
          } else {
            console.error(
              "[Sidebar] ❌ Connect failed: Invalid response from background"
            );
            setWsStatus("error");
          }
        } else if (result.success) {
          setWsStatus("connected");
          await loadWebSocketStatus();
        } else {
          console.error("[Sidebar] ❌ Connect failed:", result.error);
          setWsStatus("error");
        }
      }
    } catch (error) {
      console.error("[Sidebar] ❌ Toggle WebSocket failed:", error);
      setWsStatus("error");
      setWsConnection(null);
    } finally {
      setIsTogglingWs(false);
    }
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-background relative flex flex-col">
      {/* WebSocket Status Header */}
      <div className="flex-shrink-0 p-3 border-b border-border-default bg-background">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  wsStatus === "connected"
                    ? "bg-green-500"
                    : wsStatus === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : wsStatus === "error"
                    ? "bg-red-500"
                    : "bg-gray-400"
                }`}
              />
              <span className="text-xs text-text-secondary">
                {formatWebSocketUrl(apiProvider)}
              </span>
            </div>
          </div>
          <CustomButton
            variant={
              wsConnection?.status === "connected" ? "warning" : "success"
            }
            size="sm"
            icon={wsConnection?.status === "connected" ? PowerOff : Power}
            onClick={() => {
              handleToggleWebSocket();
            }}
            loading={isTogglingWs}
            disabled={isTogglingWs || !apiProvider || apiProvider.trim() === ""}
            aria-label={
              wsConnection?.status === "connected"
                ? "Disconnect WebSocket"
                : "Connect WebSocket"
            }
            children={undefined}
          />
        </div>
      </div>

      {/* Tab List */}
      <div className="flex-1 overflow-y-auto p-2">
        {tabs.map((tab) => (
          <TabCard key={tab.tabId} tab={tab} />
        ))}

        {tabs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4">
              <span className="text-3xl">🌐</span>
            </div>
            <p className="text-text-secondary text-sm">No DeepSeek tabs open</p>
            <p className="text-text-secondary/70 text-xs mt-1">
              Open https://chat.deepseek.com/ to get started!
            </p>
          </div>
        )}
      </div>

      {/* Floating Action Buttons - Bottom Right */}
      <div className="fixed bottom-2 right-2 z-40 flex flex-col gap-2">
        <CustomButton
          variant="ghost"
          size="sm"
          icon={Settings}
          onClick={() => setShowMenuDrawer(true)}
          aria-label="Open menu"
          className="!p-3 !text-lg"
          children={undefined}
        />
      </div>

      {/* Drawers */}
      <MenuDrawer
        isOpen={showMenuDrawer}
        onClose={() => setShowMenuDrawer(false)}
        onOpenSettings={() => setShowSettingDrawer(true)}
      />
      <SettingDrawer
        isOpen={showSettingDrawer}
        onClose={() => setShowSettingDrawer(false)}
        currentApiProvider={apiProvider}
        onApiProviderChange={handleApiProviderChange}
      />
    </div>
  );
};

export default Sidebar;
