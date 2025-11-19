import React, { useState, useEffect } from "react";
import TabCard from "./TabCard";
import CustomButton from "../common/CustomButton";
import { Settings, Power, PowerOff } from "lucide-react";
import { WSHelper } from "@/shared/lib/ws-helper";

declare const TabStateManager: any;

const Sidebar: React.FC = () => {
  const [tabs, setTabs] = useState<any[]>([]);
  const [showSettingDrawer, setShowSettingDrawer] = useState(false);
  const [, setActiveTabs] = useState<Set<string>>(new Set());
  const [wsConnection, setWsConnection] = useState<{
    id: string;
    status: "connecting" | "connected" | "disconnected" | "error";
    port: number;
  } | null>(null);
  const [isTogglingWs, setIsTogglingWs] = useState(false);

  useEffect(() => {
    const initializeSidebar = async () => {
      console.log("[Sidebar] 🚀 Initializing sidebar...");

      await chrome.storage.local.remove([
        "wsMessages",
        "wsOutgoingMessage",
        "wsIncomingRequest",
      ]);

      await loadTabs();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await loadWebSocketStatus();
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

    const tabListener = () => {
      loadTabs();
    };

    chrome.tabs.onCreated.addListener(tabListener);
    chrome.tabs.onRemoved.addListener(tabListener);

    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;

      if (changes.wsConnections) {
        console.log("[Sidebar] 🔄 wsConnections changed, updating status...");
        loadWebSocketStatus();
      }

      if (changes.wsStates) {
        const states = changes.wsStates.newValue || {};
        const FIXED_CONNECTION_ID = "ws-default-1500";
        const state = states[FIXED_CONNECTION_ID];

        console.log(
          `[Sidebar] 🌐 wsStates changed - status: ${state?.status}, port: ${state?.port}`
        );

        // Chỉ kiểm tra connection với ID cố định
        if (state) {
          const typedState = state as {
            status: string;
            port: number;
          };
          const newStatus = typedState.status as any;
          console.log(`[Sidebar] 📡 WebSocket state updated: ${newStatus}`);

          setWsConnection({
            id: FIXED_CONNECTION_ID,
            status: newStatus,
            port: typedState.port,
          });

          // ✅ QUAN TRỌNG: Reload tabs khi WebSocket connected
          if (newStatus === "connected") {
            console.log("[Sidebar] ✅ WebSocket CONNECTED! Reloading tabs...");
            loadTabs();
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onCreated.removeListener(tabListener);
      chrome.tabs.onRemoved.removeListener(tabListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const loadTabs = async () => {
    try {
      console.log("[Sidebar] 🔍 loadTabs() - Fetching tab states...");

      // ✅ KIỂM TRA WebSocket trước khi load tabs
      if (!wsConnection || wsConnection.status !== "connected") {
        console.warn(
          "[Sidebar] ⚠️  WebSocket not connected, skipping tab load"
        );
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      const tabStateManager = (window as any).TabStateManager?.getInstance();

      if (!tabStateManager) {
        console.error("[Sidebar] TabStateManager not available!");
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      const tabStates = await tabStateManager.getAllTabStates();
      console.log(
        `[Sidebar] ✅ Found ${tabStates.length} tabs with states:`,
        tabStates
      );

      setTabs(tabStates);

      // Update activeTabs set for compatibility
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
    const FIXED_CONNECTION_ID = "ws-default-1500";

    try {
      const result = await chrome.storage.local.get(["wsStates"]);
      const states = result?.wsStates || {};
      console.log("[Sidebar] 🔍 loadWebSocketStatus - Current states:", states);

      // Chỉ tìm connection với ID cố định
      const state = states[FIXED_CONNECTION_ID];

      if (state) {
        const typedState = state as {
          status: string;
          port: number;
        };
        console.log(
          `[Sidebar] 📊 Found WebSocket state: status=${typedState.status}, port=${typedState.port}`
        );

        setWsConnection({
          id: FIXED_CONNECTION_ID,
          status: typedState.status as any,
          port: typedState.port,
        });
      } else {
        console.warn(
          "[Sidebar] ⚠️ No WebSocket state found, setting to disconnected"
        );
        setWsConnection({
          id: FIXED_CONNECTION_ID,
          status: "disconnected",
          port: 1500,
        });
      }
    } catch (error) {
      console.error("[Sidebar] ❌ Error loading WebSocket status:", error);
      setWsConnection({
        id: "ws-default-1500",
        status: "disconnected",
        port: 1500,
      });
    }

    // 🆕 CRITICAL: Sau khi load xong, đợi 100ms rồi kiểm tra lại
    // Đảm bảo state được sync đầy đủ giữa background và sidebar
    setTimeout(async () => {
      const recheckResult = await chrome.storage.local.get(["wsStates"]);
      const recheckStates = recheckResult?.wsStates || {};
      const recheckState = recheckStates[FIXED_CONNECTION_ID];

      if (recheckState && recheckState.status) {
        console.log(
          `[Sidebar] 🔄 Recheck WebSocket status: ${recheckState.status}`
        );
        setWsConnection({
          id: FIXED_CONNECTION_ID,
          status: recheckState.status as any,
          port: recheckState.port || 1500,
        });
      }
    }, 100);
  };

  const handleToggleWebSocket = async () => {
    if (!wsConnection?.id) {
      return;
    }

    if (isTogglingWs) {
      return;
    }

    setIsTogglingWs(true);

    try {
      if (wsConnection.status === "connected") {
        await WSHelper.disconnect(wsConnection.id);
      } else {
        await WSHelper.connect(wsConnection.id);
      }
    } catch (error) {
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
            <span className="text-xs font-medium text-text-primary">
              {wsConnection?.status === "connected"
                ? "Backend Connected"
                : wsConnection?.status === "connecting"
                ? "Connecting..."
                : wsConnection?.status === "error"
                ? "Connection Error"
                : "Disconnected"}
            </span>
            <span className="text-xs text-text-secondary">• Port 1500</span>
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
          onClick={() => setShowSettingDrawer(!showSettingDrawer)}
          aria-label="Open settings menu"
          className="!p-3 !text-lg"
          children={undefined}
        />
      </div>
    </div>
  );
};

export default Sidebar;
