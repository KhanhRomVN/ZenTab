import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import { Plus, Ban, RotateCcw } from "lucide-react";

interface ContainersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onContainerAdded: (containerId: string) => void;
  onContainerBlacklisted: (containerId: string) => void;
}

const ContainersDrawer: React.FC<ContainersDrawerProps> = ({
  isOpen,
  onClose,
  onContainerAdded,
  onContainerBlacklisted,
}) => {
  const [unusedContainers, setUnusedContainers] = useState<any[]>([]);
  const [blacklistedContainers, setBlacklistedContainers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"available" | "blacklisted">(
    "available"
  );

  useEffect(() => {
    if (isOpen) {
      loadUnusedContainers();
      loadBlacklistedContainers();
    }
  }, [isOpen]);

  const loadUnusedContainers = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getUnusedContainers",
      });
      setUnusedContainers(response || []);
    } catch (error) {
      console.error(
        "[ContainersDrawer] Failed to load unused containers:",
        error
      );
    }
  };

  const loadBlacklistedContainers = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getBlacklistedContainers",
      });
      const blacklistedIds = response || [];

      // Get container details for blacklisted IDs
      const allContainers = await chrome.contextualIdentities.query({});
      const blacklisted = allContainers.filter((container: any) =>
        blacklistedIds.includes(container.cookieStoreId)
      );

      setBlacklistedContainers(blacklisted);
    } catch (error) {
      console.error(
        "[ContainersDrawer] Failed to load blacklisted containers:",
        error
      );
    }
  };

  const handleUnblacklist = async (containerId: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "removeFromBlacklist",
        containerId,
      });
      await loadBlacklistedContainers();
      await loadUnusedContainers();
    } catch (error) {
      console.error(
        "[ContainersDrawer] Failed to unblacklist container:",
        error
      );
    }
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
      title="Container Management"
      subtitle="Manage available and blacklisted containers"
      direction="right"
      size="full"
      animationType="slide"
      enableBlur={false}
      closeOnOverlayClick={true}
      showCloseButton={true}
    >
      <div className="h-full overflow-y-auto bg-drawer-background">
        {/* Tab Navigation */}
        <div className="border-b border-border-default">
          <div className="flex px-4">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "available"
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setActiveTab("available")}
            >
              Available Containers
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "blacklisted"
                  ? "border-red-500 text-red-600 dark:text-red-400"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setActiveTab("blacklisted")}
            >
              Blacklisted ({blacklistedContainers.length})
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {activeTab === "available" && (
            <>
              {unusedContainers.map((container) => (
                <div
                  key={container.cookieStoreId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-primary transition-colors"
                >
                  <div
                    className={`w-10 h-10 flex items-center justify-center rounded-md ${getContainerColor(
                      container.color
                    )} bg-gray-100 dark:bg-gray-800`}
                  >
                    <span className="text-sm">
                      {container.iconUrl ? "🎯" : "📦"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-sm font-medium truncate ${getContainerColor(
                        container.color
                      )}`}
                    >
                      {container.name}
                    </h3>
                    <p className="text-xs text-text-secondary truncate">
                      Not managed by ZenTab
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <CustomButton
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={() => onContainerAdded(container.cookieStoreId)}
                    >
                      Add
                    </CustomButton>
                    <CustomButton
                      variant="error"
                      size="sm"
                      icon={Ban}
                      onClick={() =>
                        onContainerBlacklisted(container.cookieStoreId)
                      }
                    >
                      Block
                    </CustomButton>
                  </div>
                </div>
              ))}

              {unusedContainers.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 mx-auto">
                    <span className="text-2xl">✅</span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    All containers are managed by ZenTab
                  </p>
                  <p className="text-xs text-text-secondary/70 mt-1">
                    Create new containers in Firefox to add more
                  </p>
                </div>
              )}
            </>
          )}

          {activeTab === "blacklisted" && (
            <>
              {blacklistedContainers.map((container) => (
                <div
                  key={container.cookieStoreId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                >
                  <div
                    className={`w-10 h-10 flex items-center justify-center rounded-md ${getContainerColor(
                      container.color
                    )} bg-gray-100 dark:bg-gray-800 opacity-50`}
                  >
                    <span className="text-sm">
                      {container.iconUrl ? "🎯" : "📦"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-sm font-medium truncate ${getContainerColor(
                        container.color
                      )} opacity-50`}
                    >
                      {container.name}
                    </h3>
                    <p className="text-xs text-red-600 dark:text-red-400 truncate">
                      Blacklisted - No auto tab creation
                    </p>
                  </div>

                  <CustomButton
                    variant="secondary"
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => handleUnblacklist(container.cookieStoreId)}
                  >
                    Unblock
                  </CustomButton>
                </div>
              ))}

              {blacklistedContainers.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 mx-auto">
                    <span className="text-2xl">🚫</span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    No blacklisted containers
                  </p>
                  <p className="text-xs text-text-secondary/70 mt-1">
                    Containers you blacklist will appear here
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MotionCustomDrawer>
  );

  return isOpen ? createPortal(drawerContent, document.body) : null;
};

export default ContainersDrawer;
