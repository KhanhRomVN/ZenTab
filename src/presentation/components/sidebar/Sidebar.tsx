import React, { useState, useEffect } from "react";
import ContainerCard from "./ContainerCard";
import ContainersDrawer from "./ContainersDrawer";
import CustomButton from "../common/CustomButton";
import { Settings } from "lucide-react";

const Sidebar: React.FC = () => {
  const [containers, setContainers] = useState<any[]>([]);
  const [showContainersDrawer, setShowContainersDrawer] = useState(false);

  useEffect(() => {
    const initializeSidebar = async () => {
      await loadContainers();

      // Connect to service worker to trigger automatic tab creation
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
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const loadContainers = async () => {
    try {
      const result = await chrome.storage.local.get(["zenTabContainers"]);
      setContainers(result.zenTabContainers || []);
    } catch (error) {
      console.error("[Sidebar] Failed to load containers:", error);
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
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-border-default">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-text-primary">ZenTab</h1>
            <CustomButton
              variant="ghost"
              size="sm"
              icon={Settings}
              onClick={() => setShowContainersDrawer(true)}
              children={undefined}
            />
          </div>
        </div>

        {/* Container List */}
        <div className="flex-1 overflow-y-auto p-2">
          {containers.map((container) => (
            <ContainerCard
              key={container.cookieStoreId}
              container={container}
              onRemove={handleContainerRemoved}
              onBlacklist={handleContainerBlacklisted}
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

      {/* Containers Management Drawer */}
      <ContainersDrawer
        isOpen={showContainersDrawer}
        onClose={() => setShowContainersDrawer(false)}
        onContainerAdded={handleContainerAdded}
        onContainerBlacklisted={handleContainerBlacklisted}
      />
    </div>
  );
};

export default Sidebar;
