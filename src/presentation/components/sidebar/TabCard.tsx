import React, { useState } from "react";
import { Activity, X } from "lucide-react";

interface TabCardProps {
  tab: {
    tabId: number;
    containerName: string;
    title: string;
    status: "free" | "busy" | "sleep";
    canAccept: boolean;
    requestCount: number;
    folderPath?: string | null;
    provider?: "deepseek" | "chatgpt" | "gemini" | "grok";
    cookieStoreId?: string;
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

  const getProviderInfo = (
    provider?: "deepseek" | "chatgpt" | "gemini" | "grok"
  ): { name: string; color: string; bgColor: string } => {
    switch (provider) {
      case "deepseek":
        return {
          name: "DeepSeek",
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
        };
      case "chatgpt":
        return {
          name: "ChatGPT",
          color: "text-emerald-600 dark:text-emerald-400",
          bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
        };
      case "gemini":
        return {
          name: "Gemini",
          color: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50 dark:bg-purple-900/20",
        };
      case "grok":
        return {
          name: "Grok",
          color: "text-orange-600 dark:text-orange-400",
          bgColor: "bg-orange-50 dark:bg-orange-900/20",
        };
      default:
        return {
          name: "Unknown",
          color: "text-gray-600 dark:text-gray-400",
          bgColor: "bg-gray-50 dark:bg-gray-900/20",
        };
    }
  };

  const getStatusColor = (status: string): string => {
    if (status === "busy") return "text-yellow-600 dark:text-yellow-400";
    if (status === "sleep") return "text-purple-600 dark:text-purple-400";
    return "text-green-600 dark:text-green-400";
  };

  const getStatusBadge = (status: string): string => {
    if (status === "busy") return "Processing";
    if (status === "sleep") return "Sleeping";
    return "Free";
  };

  const providerInfo = getProviderInfo(tab.provider);

  return (
    <div className="select-none">
      <div className="group flex flex-col gap-1.5 px-2.5 py-2 transition-all duration-150 rounded-lg hover:bg-sidebar-itemHover border border-transparent hover:border-border-default">
        {/* Title Row with Provider Badge */}
        <div className="flex items-center gap-1.5">
          {/* Provider Badge */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${providerInfo.bgColor}`}
          >
            <span className={`text-[10px] font-semibold ${providerInfo.color}`}>
              {providerInfo.name}
            </span>
          </div>

          {/* Title */}
          <span className="text-xs font-medium text-text-primary line-clamp-1 flex-1">
            {tab.title}
          </span>
        </div>

        {/* Metadata Row: Tab ID + Request Count + Status */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-secondary">
          {/* Tab ID */}
          <div className="flex items-center gap-0.5">
            <span className="font-mono">ID:{tab.tabId}</span>
          </div>

          {/* Request Count */}
          <div className="flex items-center gap-0.5">
            <Activity className="w-2.5 h-2.5" />
            <span>{tab.requestCount}</span>
          </div>

          {/* Status Text */}
          <div className="flex items-center gap-0.5">
            <span className={getStatusColor(tab.status)}>
              {getStatusBadge(tab.status)}
            </span>
          </div>

          {/* Container Name (if exists and not default) */}
          {tab.containerName &&
            !tab.containerName.startsWith("Tab ") &&
            tab.cookieStoreId &&
            tab.cookieStoreId !== "firefox-default" && (
              <div className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                <span className="text-[10px]">🗂️</span>
                <span
                  className="truncate max-w-[100px]"
                  title={tab.containerName}
                >
                  {tab.containerName}
                </span>
              </div>
            )}
        </div>

        {/* Folder Path */}
        {tab.folderPath && (
          <div
            className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 group/folder px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded"
            onMouseEnter={() => setIsHoveringFolder(true)}
            onMouseLeave={() => setIsHoveringFolder(false)}
          >
            <span className="text-[10px]">📁</span>
            <span className="truncate flex-1" title={tab.folderPath}>
              {tab.folderPath.split("/").pop() || tab.folderPath}
            </span>
            {isHoveringFolder && (
              <button
                onClick={handleRemoveFolderLink}
                className="opacity-0 group-hover/folder:opacity-100 transition-opacity p-0.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                title="Xóa liên kết folder"
              >
                <X className="w-2.5 h-2.5 text-red-600 dark:text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TabCard;
