import React from "react";
import { MoreVertical, Trash2, MessageCircle, Ban, Plus } from "lucide-react";
import CustomDropdown from "../common/CustomDropdown";

interface ContainerCardProps {
  container: any;
  onRemove: (containerId: string) => void;
  onBlacklist: (containerId: string) => void;
}

interface ContainerCardProps {
  container: any;
  onRemove: (containerId: string) => void;
  onBlacklist: (containerId: string) => void;
  hasActiveTab: boolean;
  onCreateTab: (containerId: string) => void;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
  container,
  onRemove,
  onBlacklist,
  hasActiveTab,
  onCreateTab,
}) => {
  const [showDropdown, setShowDropdown] = React.useState(false);

  const handleBlacklist = async () => {
    try {
      await chrome.runtime.sendMessage({
        action: "addToBlacklist",
        containerId: container.cookieStoreId,
      });
      onBlacklist(container.cookieStoreId);
    } catch (error) {
      console.error("[ContainerCard] Failed to blacklist container:", error);
    }
  };

  const handleOpenChat = async () => {
    try {
      await chrome.runtime.sendMessage({
        action: "openZenTab",
        containerId: container.cookieStoreId,
      });
    } catch (error) {
      console.error("[ContainerCard] Failed to open chat:", error);
    }
  };

  const dropdownOptions = [
    {
      value: "open",
      label: "Open DeepSeek Chat",
      icon: <MessageCircle className="w-3.5 h-3.5" />,
      disabled: !hasActiveTab,
    },
    {
      value: "create",
      label: "Create DeepSeek Tab",
      icon: <Plus className="w-3.5 h-3.5" />,
      disabled: hasActiveTab,
    },
    {
      value: "blacklist",
      label: "Blacklist Container",
      icon: <Ban className="w-3.5 h-3.5" />,
      danger: true,
    },
    {
      value: "remove",
      label: "Remove from ZenTab",
      icon: <Trash2 className="w-3.5 h-3.5" />,
      danger: true,
    },
  ];

  const handleDropdownSelect = (value: string) => {
    setShowDropdown(false);

    switch (value) {
      case "open":
        handleOpenChat();
        break;
      case "create":
        onCreateTab(container.cookieStoreId);
        break;
      case "blacklist":
        handleBlacklist();
        break;
      case "remove":
        onRemove(container.cookieStoreId);
        break;
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

  return (
    <div className="select-none">
      <div className="group flex items-center gap-3 px-3 py-3 transition-all duration-150 rounded-lg hover:bg-sidebar-itemHover">
        {/* Container Icon */}
        <div
          className={`w-8 h-8 flex items-center justify-center rounded-md ${getContainerColor(
            container.color
          )} bg-gray-100 dark:bg-gray-800`}
        >
          <span className="text-sm">{container.iconUrl ? "🎯" : "📦"}</span>
        </div>

        {/* Container Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-base font-medium truncate ${getContainerColor(
                container.color
              )}`}
            >
              {container.name}
            </span>
          </div>
          <p className="text-xs text-text-secondary truncate">DeepSeek Chat</p>
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

export default ContainerCard;
