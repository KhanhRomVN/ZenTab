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
  const [wsConnection, setWsConnection] = useState<{
    id: string;
    status: "connecting" | "connected" | "disconnected" | "error";
  } | null>(null);
  const [isTogglingWs, setIsTogglingWs] = useState(false);
  const [apiProvider, setApiProvider] = useState<string>("localhost:3030");

  useEffect(() => {
    const initializeSidebar = async () => {
      await chrome.storage.local.remove([
        "wsMessages",
        "wsOutgoingMessage",
        "wsIncomingRequest",
      ]);

      // 🔧 FIX: Query WSManager trực tiếp thay vì đọc storage
      let retryCount = 0;
      const maxRetries = 10;
      let connectionInfo: any = null;

      while (retryCount < maxRetries && !connectionInfo) {
        try {
          const response = await new Promise<any>((resolve) => {
            chrome.runtime.sendMessage(
              { action: "getWSConnectionInfo" },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "[Sidebar] ❌ Query error:",
                    chrome.runtime.lastError
                  );
                  resolve(null);
                  return;
                }
                resolve(response);
              }
            );
          });

          if (response && response.success && response.connectionId) {
            connectionInfo = response;
            break;
          } else {
            console.warn(
              `[Sidebar] ⚠️ WSManager not ready yet (attempt ${
                retryCount + 1
              }/${maxRetries})`
            );
          }
        } catch (error) {
          console.error("[Sidebar] ❌ Query exception:", error);
        }

        if (!connectionInfo) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          retryCount++;
        }
      }

      if (connectionInfo) {
        setWsConnection({
          id: connectionInfo.connectionId,
          status: connectionInfo.state?.status || "disconnected",
        });

        // 🔧 FIX: Load apiProvider từ storage
        const storageResult = await chrome.storage.local.get(["apiProvider"]);
        const provider = storageResult?.apiProvider || "localhost:3030";
        setApiProvider(provider);
      } else {
        console.error(
          `[Sidebar] ❌ WSManager init timeout after ${maxRetries} retries`
        );
      }

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

      if (changes.wsConnections) {
        loadWebSocketStatus();
      }

      if (changes.wsStates) {
        const states = changes.wsStates.newValue || {};

        const storageResult = await chrome.storage.local.get([
          "wsDefaultConnectionId",
        ]);
        const defaultConnectionId = storageResult?.wsDefaultConnectionId;
        const currentConnectionId = wsConnection?.id || defaultConnectionId;
        const state = states[currentConnectionId];

        if (state) {
          const typedState = state as {
            status: string;
          };
          const newStatus = typedState.status as any;

          setWsConnection({
            id: currentConnectionId,
            status: newStatus,
          });

          if (newStatus === "connected") {
            loadTabs({ status: typedState.status });
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    // 🆕 POLLING: Check connection status mỗi 2 giây để update UI
    const connectionPollingInterval = setInterval(async () => {
      try {
        const storageResult = await chrome.storage.local.get([
          "wsStates",
          "wsDefaultConnectionId",
        ]);
        const states = storageResult?.wsStates || {};
        const defaultConnectionId = storageResult?.wsDefaultConnectionId;

        if (defaultConnectionId && states[defaultConnectionId]) {
          const state = states[defaultConnectionId];
          const currentStatus = wsConnection?.status;
          const newStatus = state.status;

          // Chỉ update nếu status thực sự thay đổi
          if (currentStatus !== newStatus) {
            console.log(
              `[Sidebar] 🔄 Status changed: ${currentStatus} → ${newStatus}`
            );
            setWsConnection({
              id: defaultConnectionId,
              status: newStatus,
            });

            // Nếu vừa connected, reload tabs
            if (newStatus === "connected" && currentStatus !== "connected") {
              console.log(
                "[Sidebar] ✅ Connection established, reloading tabs..."
              );
              await loadTabs();
            }
          }
        }
      } catch (error) {
        console.error("[Sidebar] ❌ Polling error:", error);
      }
    }, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onCreated.removeListener(tabCreatedListener);
      chrome.tabs.onRemoved.removeListener(tabRemovedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.storage.onChanged.removeListener(storageListener);
      clearInterval(connectionPollingInterval); // 🆕 Cleanup polling
    };
  }, [wsConnection?.status]); // 🔥 FIX: Thêm dependency để re-run khi status thay đổi

  const loadTabs = async (providedWsState?: { status: string }) => {
    try {
      let wsState = providedWsState;

      if (!wsState) {
        const storageResult = await chrome.storage.local.get([
          "wsStates",
          "wsDefaultConnectionId",
        ]);
        const states = storageResult?.wsStates || {};
        const defaultConnectionId = storageResult?.wsDefaultConnectionId;
        if (defaultConnectionId) {
          wsState = states[defaultConnectionId];
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
          } else if (attemptResponse) {
            console.warn(
              `[Sidebar] ⚠️  Attempt ${attempts} returned non-success:`,
              attemptResponse
            );
          } else {
            console.warn(
              `[Sidebar] ⚠️  Attempt ${attempts} returned null/undefined`
            );
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
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { action: "getWSConnectionInfo" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[Sidebar] ❌ Query error:",
                chrome.runtime.lastError
              );
              resolve(null);
              return;
            }
            resolve(response);
          }
        );
      });

      if (response && response.success && response.connectionId) {
        setWsConnection({
          id: response.connectionId,
          status: response.state?.status || "disconnected",
        });

        // Load apiProvider từ storage
        const storageResult = await chrome.storage.local.get(["apiProvider"]);
        const provider = storageResult?.apiProvider || "localhost:3030";
        setApiProvider(provider);
      } else {
        console.warn("[Sidebar] ⚠️ No connection info available");
        setWsConnection(null);
      }
    } catch (error) {
      console.error("[Sidebar] ❌ Error loading WebSocket status:", error);
      setWsConnection(null);
    }
  };

  const formatWebSocketUrl = (apiProvider: string): string => {
    if (!apiProvider) return "No API Provider";

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
      return "Invalid API Provider";
    }
  };

  const handleApiProviderChange = async (newProvider: string) => {
    // Save new provider
    await chrome.storage.local.set({
      apiProvider: newProvider,
    });
    setApiProvider(newProvider);

    // Reconnect WebSocket với protocol mới (ws/wss)
    if (wsConnection?.status === "connected") {
      await WSHelper.disconnect(wsConnection.id);

      // Wait for disconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect will automatically use new protocol from storage
      await WSHelper.connect(wsConnection.id);
    }
  };

  const handleToggleWebSocket = async () => {
    if (!wsConnection?.id) {
      console.warn("[Sidebar] ⚠️ No connection ID available");
      return;
    }

    if (isTogglingWs) {
      console.warn("[Sidebar] ⚠️ Toggle already in progress");
      return;
    }

    setIsTogglingWs(true);

    try {
      if (wsConnection.status === "connected") {
        console.log("[Sidebar] 🔌 Disconnecting WebSocket...");
        await WSHelper.disconnect(wsConnection.id);
        console.log("[Sidebar] ✅ Disconnected successfully");
      } else {
        console.log(
          "[Sidebar] 🔄 Connecting WebSocket (will create NEW connection)..."
        );
        await WSHelper.connect(wsConnection.id);
        console.log("[Sidebar] ✅ Connected successfully");

        // 🆕 FIX: Đợi 1s rồi force check lại status từ storage
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const storageResult = await chrome.storage.local.get([
          "wsStates",
          "wsDefaultConnectionId",
        ]);
        const states = storageResult?.wsStates || {};
        const defaultConnectionId = storageResult?.wsDefaultConnectionId;

        if (defaultConnectionId && states[defaultConnectionId]) {
          const state = states[defaultConnectionId];
          console.log(`[Sidebar] 🔍 Forced status check: ${state.status}`);

          setWsConnection({
            id: defaultConnectionId,
            status: state.status,
          });

          // Nếu connected, reload tabs
          if (state.status === "connected") {
            console.log("[Sidebar] ✅ Reloading tabs after connect...");
            await loadTabs();
          }
        }
      }
    } catch (error) {
      console.error("[Sidebar] ❌ Toggle WebSocket failed:", error);
    } finally {
      setIsTogglingWs(false);
    }
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-background relative flex flex-col">
      {/* WebSocket Status Header */}
      <div className="flex-shrink-0 p-3 border-b border-border-default bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                wsConnection?.status === "connected"
                  ? "bg-green-500"
                  : wsConnection?.status === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : wsConnection?.status === "error"
                  ? "bg-red-500"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-xs text-text-secondary">
              {wsConnection ? formatWebSocketUrl(apiProvider) : "Not connected"}
            </span>
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
            disabled={
              isTogglingWs ||
              !wsConnection?.id ||
              wsConnection?.status === "connecting"
            }
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
