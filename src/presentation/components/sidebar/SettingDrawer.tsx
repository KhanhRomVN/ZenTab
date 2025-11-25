import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomCombobox from "../common/CustomCombobox";

interface SettingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiProvider: string;
  onApiProviderChange: (provider: string) => void;
}

const SettingDrawer: React.FC<SettingDrawerProps> = ({
  isOpen,
  onClose,
  currentApiProvider,
  onApiProviderChange,
}) => {
  const [apiProvider, setApiProvider] = useState<string>(currentApiProvider);
  const [language, setLanguage] = useState<string>("en");

  useEffect(() => {
    // 🔥 FIX: Sync local state với prop từ Sidebar (đã được sync với storage)
    if (currentApiProvider && currentApiProvider !== apiProvider) {
      console.log(
        `[SettingDrawer] 🔄 Syncing API Provider: ${apiProvider} → ${currentApiProvider}`
      );
      setApiProvider(currentApiProvider);
    }
  }, [currentApiProvider]);

  // 🔥 FIX: Không có option mặc định - user tự nhập hoàn toàn
  const apiProviderOptions: Array<{ value: string; label: string }> = [];

  const languageOptions = [
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
  ];

  const handleApiProviderChange = (value: string | string[]) => {
    const providerValue = Array.isArray(value) ? value[0] : value;

    // 🔥 FIX: Update local state FIRST, then notify parent to save to storage
    console.log(
      `[SettingDrawer] 📝 User changed API Provider to: ${providerValue}`
    );
    setApiProvider(providerValue);

    // 🔥 CRITICAL: Parent (Sidebar) will handle storage write and WebSocket reconnect
    onApiProviderChange(providerValue);
  };

  return (
    <MotionCustomDrawer
      isOpen={isOpen}
      onClose={onClose}
      direction="bottom"
      size="full"
      animationType="slide"
      enableBlur={true}
      closeOnOverlayClick={true}
      showCloseButton={false}
      hideHeader={true}
    >
      <div className="h-full flex flex-col bg-drawer-background">
        <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-border-default">
          <h3 className="text-base font-semibold text-text-primary">
            Settings Configuration
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-sidebar-itemHover rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <CustomCombobox
              label="API Provider"
              value={apiProvider}
              options={apiProviderOptions}
              onChange={handleApiProviderChange}
              placeholder="Enter API provider (e.g., 192.168.1.100:8080 or https://api.example.com)..."
              creatable={true}
              size="sm"
            />
            <p className="text-xs text-text-secondary mt-1 ml-1">
              💡 Tip: Use <span className="font-mono">https://</span> prefix for
              secure connections (wss://). Default port is 80 for http://, 443
              for https://. You must specify port explicitly (e.g.,{" "}
              <span className="font-mono">192.168.1.100:8080</span>). Example:{" "}
              <span className="font-mono">192.168.1.100:8080</span> or{" "}
              <span className="font-mono">https://api.example.com:443</span>
            </p>
          </div>

          <CustomCombobox
            label="Language"
            value={language}
            options={languageOptions}
            onChange={(value) =>
              setLanguage(Array.isArray(value) ? value[0] : value)
            }
            placeholder="Select language..."
            size="sm"
          />
        </div>
      </div>
    </MotionCustomDrawer>
  );
};

export default SettingDrawer;
