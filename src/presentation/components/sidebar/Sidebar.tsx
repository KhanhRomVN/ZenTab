import React, { useState, useEffect } from "react";
import ContainerCard from "./ContainerCard";
import ContainersDrawer from "./ContainersDrawer";
import WebSocketDrawer from "./WebSocketDrawer";
import SettingDrawer from "./SettingDrawer";
import CustomButton from "../common/CustomButton";
import { Settings } from "lucide-react";
import { getBrowserAPI } from "@/shared/lib/browser-api";

const Sidebar: React.FC = () => {
  const [containers, setContainers] = useState<any[]>([]);
  const [showContainersDrawer, setShowContainersDrawer] = useState(false);
  const [showSettingDrawer, setShowSettingDrawer] = useState(false);
  const [showWebSocketDrawer, setShowWebSocketDrawer] = useState(false);
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
      const containerIds = new Set(
        tabs.map((tab: any) => tab.cookieStoreId).filter(Boolean)
      );
      setActiveTabs(containerIds);
    } catch (error) {
      console.error("[Sidebar] Failed to load active tabs:", error);
    }
  };

  const loadContainers = async () => {
    try {
      const browserAPI = getBrowserAPI();

      if (
        browserAPI.contextualIdentities &&
        typeof browserAPI.contextualIdentities.query === "function"
      ) {
        const containers = await browserAPI.contextualIdentities.query({});
        setContainers(containers || []);
      } else {
        console.warn("Contextual identities not supported in this browser");
        setContainers([]);
      }
    } catch (error) {
      console.error("Failed to load containers:", error);
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

  const handleContainerAdded = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "addContainerToZenTab",
        containerId,
      });
      await loadContainers();
    } catch (error) {
      console.error("[Sidebar] Failed to add container:", error);
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

      {/* Floating Action Button - Bottom Right */}
      <div className="fixed bottom-2 right-2 z-40">
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
        onContainers={() => setShowContainersDrawer(true)}
        onWebSocket={() => setShowWebSocketDrawer(true)}
      />

      {/* Containers Management Drawer */}
      <ContainersDrawer
        isOpen={showContainersDrawer}
        onClose={() => setShowContainersDrawer(false)}
        onContainerAdded={handleContainerAdded}
        onContainerBlacklisted={handleContainerBlacklisted}
      />

      {/* WebSocket Drawer */}
      <WebSocketDrawer
        isOpen={showWebSocketDrawer}
        onClose={() => setShowWebSocketDrawer(false)}
      />
    </div>
  );
};

export default Sidebar;
