import React from "react";
import {
  MoreVertical,
  Trash2,
  MessageCircle,
  Activity,
  Clock,
} from "lucide-react";
import CustomDropdown from "../common/CustomDropdown";

interface TabCardProps {
  tab: {
    tabId: number;
    title: string;
    status: "free" | "busy";
    canAccept: boolean;
    lastUsed: number;
    requestCount: number;
  };
}

const TabCard: React.FC<TabCardProps> = ({ tab }) => {
  const [showDropdown, setShowDropdown] = React.useState(false);

  const handleOpenTab = async () => {
    try {
      await chrome.tabs.update(tab.tabId, { active: true });
      const tabInfo = await chrome.tabs.get(tab.tabId);
      if (tabInfo.windowId) {
        await chrome.windows.update(tabInfo.windowId, { focused: true });
      }
    } catch (error) {
      console.error("Error opening tab:", error);
    }
  };

  const dropdownOptions = [
    {
      value: "open",
      label: "Focus Tab",
      icon: <MessageCircle className="w-3.5 h-3.5" />,
    },
    {
      value: "remove",
      label: "Close Tab",
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
    },
  ];

  const handleDropdownSelect = (value: string) => {
    setShowDropdown(false);

    switch (value) {
      case "open":
        handleOpenTab();
        break;
    }
  };

  const getStatusColor = (status: string): string => {
    return status === "busy"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-green-600 dark:text-green-400";
  };

  const getStatusIcon = (status: string): string => {
    return status === "busy" ? "⏳" : "✅";
  };

  const formatLastUsed = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
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

          <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
            <div className="flex items-center gap-1">
              <span className="font-mono">ID: {tab.tabId}</span>
            </div>
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              <span>{tab.requestCount} reqs</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatLastUsed(tab.lastUsed)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(!showDropdown);
              }}
              className="p-1 hover:bg-button-secondBgHover rounded"
            >
              <MoreVertical className="w-4 h-4 text-text-secondary" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50">
                <CustomDropdown
                  options={dropdownOptions}
                  onSelect={handleDropdownSelect}
                  align="right"
                  width="w-48"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabCard;
