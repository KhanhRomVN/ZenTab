import React, { useState } from "react";
import { Activity, X } from "lucide-react";

interface TabCardProps {
  tab: {
    tabId: number;
    title: string;
    status: "free" | "busy" | "sleep";
    canAccept: boolean;
    requestCount: number;
    folderPath?: string | null;
  };
}

const TabCard: React.FC<TabCardProps> = ({ tab }) => {
  const [isHoveringFolder, setIsHoveringFolder] = useState(false);

  const handleRemoveFolderLink = async () => {
    if (!tab.folderPath) {
      console.warn(`[TabCard] ⚠️ No folderPath to unlink for tab ${tab.tabId}`);
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: "unlinkTabFromFolder",
        tabId: tab.tabId,
        folderPath: tab.folderPath,
      });

      if (response && response.success) {
      } else {
        console.error(`[TabCard] ❌ Failed to unlink folder:`, response);
        alert(`Failed to unlink folder: ${response?.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error(`[TabCard] ❌ Exception while unlinking folder:`, error);
      alert(
        `Error unlinking folder: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const getStatusColor = (status: string): string => {
    if (status === "busy") return "text-yellow-600 dark:text-yellow-400";
    if (status === "sleep") return "text-purple-600 dark:text-purple-400";
    return "text-green-600 dark:text-green-400";
  };

  const getStatusIcon = (status: string): string => {
    if (status === "busy") return "⏳";
    if (status === "sleep") return "💤";
    return "✅";
  };

  const getStatusBadge = (status: string): string => {
    if (status === "busy") return "Processing";
    if (status === "sleep") return "Sleeping";
    return "Free";
  };

  const getStatusBadgeColor = (status: string): string => {
    if (status === "busy") return "text-orange-600 dark:text-orange-400";
    if (status === "sleep") return "text-purple-600 dark:text-purple-400";
    return "text-green-600 dark:text-green-400";
  };

  return (
    <div className="select-none">
      <div className="group flex items-center gap-3 px-3 py-3 transition-all duration-150 rounded-lg hover:bg-sidebar-itemHover">
        {/* Status Icon */}
        <div
          className={`w-8 h-8 flex items-center justify-center rounded-md ${getStatusColor(
            tab.status
          )} ${
            tab.status === "busy"
              ? "bg-yellow-50 dark:bg-yellow-900/20"
              : tab.status === "sleep"
              ? "bg-purple-50 dark:bg-purple-900/20"
              : "bg-green-50 dark:bg-green-900/20"
          }`}
        >
          <span className="text-sm">{getStatusIcon(tab.status)}</span>
        </div>

        {/* Tab Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate text-text-primary line-clamp-1">
              {tab.title}
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-1 text-xs text-text-secondary">
            <div className="flex items-center gap-3 line-clamp-1">
              <div className="flex items-center gap-1">
                <span className="font-mono">ID: {tab.tabId}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                <span>{tab.requestCount} reqs</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`text-xs font-medium ${getStatusBadgeColor(
                    tab.status
                  )}`}
                >
                  {getStatusBadge(tab.status)}
                </span>
              </div>
            </div>
            {tab.folderPath && (
              <div
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 group/folder"
                onMouseEnter={() => setIsHoveringFolder(true)}
                onMouseLeave={() => setIsHoveringFolder(false)}
              >
                <span>📁</span>
                <span className="truncate max-w-[180px]" title={tab.folderPath}>
                  {tab.folderPath.split("/").pop() || tab.folderPath}
                </span>
                {isHoveringFolder && (
                  <button
                    onClick={handleRemoveFolderLink}
                    className="opacity-0 group-hover/folder:opacity-100 transition-opacity p-0.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                    title="Xóa liên kết folder"
                  >
                    <X className="w-3 h-3 text-red-600 dark:text-red-400" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabCard;
