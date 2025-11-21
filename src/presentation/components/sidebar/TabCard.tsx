import React from "react";
import { Activity } from "lucide-react";

interface TabCardProps {
  tab: {
    tabId: number;
    title: string;
    status: "free" | "busy";
    canAccept: boolean;
    requestCount: number;
    folderPath?: string | null;
  };
}

const TabCard: React.FC<TabCardProps> = ({ tab }) => {
  const getStatusColor = (status: string): string => {
    return status === "busy"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-green-600 dark:text-green-400";
  };

  const getStatusIcon = (status: string): string => {
    return status === "busy" ? "⏳" : "✅";
  };

  const getStatusBadge = (status: string): string => {
    return status === "busy" ? "Processing" : "Idle";
  };

  const getStatusBadgeColor = (status: string): string => {
    return status === "busy"
      ? "text-blue-600 dark:text-blue-400"
      : "text-gray-600 dark:text-gray-400";
  };

  const getRunningState = (canAccept: boolean, status: string): string => {
    if (status === "busy") return "Running";
    return canAccept ? "Ready" : "Cooldown";
  };

  const getRunningStateColor = (canAccept: boolean, status: string): string => {
    if (status === "busy") return "text-blue-600 dark:text-blue-400";
    return canAccept
      ? "text-green-600 dark:text-green-400"
      : "text-gray-600 dark:text-gray-400";
  };

  return (
    <div className="select-none">
      <div className="group flex items-center gap-3 px-3 py-3 transition-all duration-150 rounded-lg hover:bg-sidebar-itemHover">
        {/* Status Icon */}
        <div
          className={`w-8 h-8 flex items-center justify-center rounded-md ${getStatusColor(
            tab.status
          )} bg-gray-100 dark:bg-gray-800`}
        >
          <span className="text-sm">{getStatusIcon(tab.status)}</span>
        </div>

        {/* Tab Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate text-text-primary">
              {tab.title}
            </span>
            <span
              className={`text-xs font-medium ${getRunningStateColor(
                tab.canAccept,
                tab.status
              )}`}
            >
              {getRunningState(tab.canAccept, tab.status)}
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-1 text-xs text-text-secondary">
            <div className="flex items-center gap-3">
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
              <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                <span>📁</span>
                <span className="truncate max-w-[200px]" title={tab.folderPath}>
                  {tab.folderPath.split("/").pop() || tab.folderPath}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabCard;
