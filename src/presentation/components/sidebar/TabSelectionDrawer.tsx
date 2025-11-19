import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import { ChevronRight, ChevronDown, CheckCircle, Circle } from "lucide-react";
import { getBrowserAPI } from "@/shared/lib/browser-api";

interface TabSelectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ContainerWithTabs {
  container: any;
  tabs: chrome.tabs.Tab[];
  selectedTabId?: number;
}

const TabSelectionDrawer: React.FC<TabSelectionDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [containersWithTabs, setContainersWithTabs] = useState<
    ContainerWithTabs[]
  >([]);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (isOpen) {
      loadContainersWithTabs();
    }
  }, [isOpen]);

  const loadContainersWithTabs = async () => {
    try {
      const browserAPI = getBrowserAPI();

      // Kiểm tra browser có support contextualIdentities không
      if (
        !browserAPI.contextualIdentities ||
        typeof browserAPI.contextualIdentities.query !== "function"
      ) {
        setContainersWithTabs([]);
        return;
      }

      // Lấy tất cả containers với validation
      const containersResult = await browserAPI.contextualIdentities.query({});
      const containers = Array.isArray(containersResult)
        ? containersResult
        : [];

      if (containers.length === 0) {
        setContainersWithTabs([]);
        return;
      }

      // Lấy tất cả tab DeepSeek
      const allTabsResult = await browserAPI.tabs.query({
        url: "https://chat.deepseek.com/*",
      });
      const allTabs = (
        Array.isArray(allTabsResult) ? allTabsResult : []
      ) as Array<chrome.tabs.Tab & { cookieStoreId?: string }>;

      // Lấy danh sách tab đã chọn
      const selectedTabsResponse = await browserAPI.runtime.sendMessage({
        action: "getAllSelectedTabs",
      });
      const selectedTabs = selectedTabsResponse || {};

      // Gom nhóm theo container
      const grouped: ContainerWithTabs[] = containers.map((container) => ({
        container,
        tabs: allTabs.filter(
          (tab) => tab.cookieStoreId === container.cookieStoreId
        ),
        selectedTabId: selectedTabs[container.cookieStoreId],
      }));

      setContainersWithTabs(grouped);
    } catch (error) {
      setContainersWithTabs([]);
    }
  };

  const toggleContainer = (containerId: string) => {
    setExpandedContainers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(containerId)) {
        newSet.delete(containerId);
      } else {
        newSet.add(containerId);
      }
      return newSet;
    });
  };

  const handleSelectTab = async (containerId: string, tabId: number) => {
    try {
      await chrome.runtime.sendMessage({
        action: "selectTab",
        containerId,
        tabId,
      });
      await loadContainersWithTabs();

      // Notify Sidebar để reload containers
      try {
        const promise = chrome.runtime.sendMessage({
          action: "containersUpdated",
        });

        // Only handle promise if it exists (Firefox compatibility)
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {}); // Ignore error if no receiver
        }
      } catch (error) {}
    } catch (error) {}
  };

  const handleUnselectTab = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "unselectTab",
        containerId,
      });
      await loadContainersWithTabs();

      // Notify Sidebar để reload containers
      try {
        const promise = chrome.runtime.sendMessage({
          action: "containersUpdated",
        });

        // Only handle promise if it exists (Firefox compatibility)
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {}); // Ignore error if no receiver
        }
      } catch (error) {}
    } catch (error) {}
  };

  const getContainerColor = (color: string): string => {
    const colorMap: { [key: string]: string } = {
      blue: "text-blue-600 dark:text-blue-400",
      turquoise: "text-cyan-600 dark:text-cyan-400",
      green: "text-green-600 dark:text-green-400",
      yellow: "text-yellow-600 dark:text-yellow-400",
      orange: "text-orange-600 dark:text-orange-400",
      red: "text-red-600 dark:text-red-400",
      pink: "text-pink-600 dark:text-pink-400",
      purple: "text-purple-600 dark:text-purple-400",
      toolbar: "text-gray-600 dark:text-gray-400",
    };
    return colorMap[color] || "text-primary";
  };

  const drawerContent = (
    <MotionCustomDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Select DeepSeek Tabs"
      subtitle="Choose one tab per container for ZenTab management"
      direction="right"
      size="full"
      animationType="slide"
      enableBlur={false}
      closeOnOverlayClick={true}
      showCloseButton={true}
    >
      <div className="h-full overflow-y-auto bg-drawer-background">
        <div className="p-4 space-y-2">
          {containersWithTabs.map(({ container, tabs, selectedTabId }) => {
            const isExpanded = expandedContainers.has(container.cookieStoreId);
            const hasSelectedTab = selectedTabId !== undefined;

            return (
              <div
                key={container.cookieStoreId}
                className="border border-border-default rounded-lg overflow-hidden"
              >
                {/* Container Header */}
                <button
                  onClick={() => toggleContainer(container.cookieStoreId)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-sidebar-itemHover transition-colors"
                >
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-text-secondary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-secondary" />
                    )}
                  </div>

                  <div
                    className={`w-8 h-8 flex items-center justify-center rounded-md ${getContainerColor(
                      container.color
                    )} bg-gray-100 dark:bg-gray-800`}
                  >
                    <span className="text-sm">
                      {container.iconUrl ? "🎯" : "📦"}
                    </span>
                  </div>

                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${getContainerColor(
                          container.color
                        )}`}
                      >
                        {container.name}
                      </span>
                      <span className="text-xs text-text-secondary">
                        ({tabs.length} tabs)
                      </span>
                    </div>
                    {hasSelectedTab && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Tab selected ✓
                      </p>
                    )}
                  </div>
                </button>

                {/* Tab List */}
                {isExpanded && tabs.length > 0 && (
                  <div className="border-t border-border-default bg-background/50">
                    {tabs.map((tab) => {
                      const isSelected = tab.id === selectedTabId;

                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            if (isSelected) {
                              handleUnselectTab(container.cookieStoreId);
                            } else {
                              handleSelectTab(container.cookieStoreId, tab.id!);
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 pl-12 hover:bg-sidebar-itemHover transition-colors ${
                            isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Circle className="w-4 h-4 text-gray-400" />
                            )}
                          </div>

                          <div className="flex-1 text-left min-w-0">
                            <p
                              className={`text-sm truncate ${
                                isSelected
                                  ? "text-blue-700 dark:text-blue-300 font-medium"
                                  : "text-text-primary"
                              }`}
                            >
                              {tab.title || "Untitled"}
                            </p>
                            <p className="text-xs text-text-secondary truncate">
                              Tab ID: {tab.id}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isExpanded && tabs.length === 0 && (
                  <div className="p-4 text-center text-text-secondary text-sm border-t border-border-default">
                    No DeepSeek tabs in this container
                  </div>
                )}
              </div>
            );
          })}

          {containersWithTabs.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl">📋</span>
              </div>
              <p className="text-sm text-text-secondary">No containers found</p>
            </div>
          )}
        </div>
      </div>
    </MotionCustomDrawer>
  );

  return isOpen ? createPortal(drawerContent, document.body) : null;
};

export default TabSelectionDrawer;
