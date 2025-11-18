import React, { useState, useEffect } from "react";
import ContainerCard from "./ContainerCard";
import WebSocketDrawer from "./WebSocketDrawer";
import SettingDrawer from "./SettingDrawer";
import TestDrawer from "./TestDrawer";
import CustomButton from "../common/CustomButton";
import { Settings } from "lucide-react";
import { getBrowserAPI } from "@/shared/lib/browser-api";

const Sidebar: React.FC = () => {
  const [containers, setContainers] = useState<any[]>([]);
  const [showSettingDrawer, setShowSettingDrawer] = useState(false);
  const [showWebSocketDrawer, setShowWebSocketDrawer] = useState(false);
  const [showTestDrawer, setShowTestDrawer] = useState(false);
  const [activeTabs, setActiveTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initializeSidebar = async () => {
      await loadContainers();
      await loadActiveTabs();

      // Connect to service worker
      const port = chrome.runtime.connect({ name: "zenTab-sidebar" });

      return () => {
        port.disconnect();
      };
    };

    initializeSidebar();

    const messageListener = (message: any) => {
      if (message.action === "containersUpdated") {
        loadContainers();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const tabListener = () => {
      loadActiveTabs();
    };
    chrome.tabs.onCreated.addListener(tabListener);
    chrome.tabs.onRemoved.addListener(tabListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onCreated.removeListener(tabListener);
      chrome.tabs.onRemoved.removeListener(tabListener);
    };
  }, []);

  const handleCreateTab = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "createZenTab",
        containerId,
      });
      await loadActiveTabs();
    } catch (error) {
      console.error("[Sidebar] Failed to create tab:", error);
    }
  };

  const loadActiveTabs = async () => {
    try {
      const tabs = await chrome.tabs.query({
        url: "https://chat.deepseek.com/*",
      });
      const safeTabs = Array.isArray(tabs) ? tabs : [];
      const containerIds = new Set(
        safeTabs.map((tab: any) => tab.cookieStoreId).filter(Boolean)
      );
      setActiveTabs(containerIds);
    } catch (error) {
      console.error("[Sidebar] Failed to load active tabs:", error);
      setActiveTabs(new Set());
    }
  };

  const loadContainers = async () => {
    try {
      const browserAPI = getBrowserAPI();

      // Lấy ALL DeepSeek tabs (không filter theo container)
      const allTabs = await browserAPI.tabs.query({
        url: "https://chat.deepseek.com/*",
      });
      const safeTabs = Array.isArray(allTabs) ? allTabs : [];

      // Convert tabs to container-like objects for UI compatibility
      const tabContainers = safeTabs.map((tab: any) => ({
        cookieStoreId: `tab-${tab.id}`,
        name: tab.title || "Untitled",
        color: "blue", // Default color
        iconUrl: tab.favIconUrl || null,
        tabId: tab.id,
      }));

      setContainers(tabContainers);
    } catch (error) {
      console.error("[Sidebar] Failed to load tabs:", error);
      setContainers([]);
    }
  };

  const handleContainerRemoved = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "removeContainerFromZenTab",
        containerId,
      });
      await loadContainers();
    } catch (error) {
      console.error("[Sidebar] Failed to remove container:", error);
    }
  };

  const handleContainerBlacklisted = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "addToBlacklist",
        containerId,
      });
      await loadContainers();
    } catch (error) {
      console.error("[Sidebar] Failed to blacklist container:", error);
    }
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-background relative">
      {/* Main content */}
      <div className="flex flex-col h-full">
        {/* Container List */}
        <div className="flex-1 overflow-y-auto p-2">
          {containers.map((container) => (
            <ContainerCard
              key={container.cookieStoreId}
              container={container}
              onRemove={handleContainerRemoved}
              onBlacklist={handleContainerBlacklisted}
              hasActiveTab={activeTabs.has(container.cookieStoreId)}
              onCreateTab={handleCreateTab}
            />
          ))}

          {containers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4">
                <span className="text-3xl">📚</span>
              </div>
              <p className="text-text-secondary text-sm">No containers yet</p>
              <p className="text-text-secondary/70 text-xs mt-1">
                Add containers from settings to get started!
              </p>
            </div>
          )}
        </div>
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

      {/* Setting Drawer */}
      <SettingDrawer
        isOpen={showSettingDrawer}
        onClose={() => setShowSettingDrawer(false)}
        onWebSocket={() => setShowWebSocketDrawer(true)}
        onTest={() => setShowTestDrawer(true)}
      />

      {/* WebSocket Drawer */}
      <WebSocketDrawer
        isOpen={showWebSocketDrawer}
        onClose={() => setShowWebSocketDrawer(false)}
      />

      {/* Test Drawer */}
      <TestDrawer
        isOpen={showTestDrawer}
        onClose={() => setShowTestDrawer(false)}
      />
    </div>
  );
};

export default Sidebar;
