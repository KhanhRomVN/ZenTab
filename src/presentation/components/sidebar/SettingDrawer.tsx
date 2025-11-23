import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomCombobox from "../common/CustomCombobox";

interface SettingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPort: number;
  currentApiProvider: string;
  onPortChange: (port: number) => void;
  onApiProviderChange: (provider: string) => void;
}

const SettingDrawer: React.FC<SettingDrawerProps> = ({
  isOpen,
  onClose,
  currentPort,
  currentApiProvider,
  onPortChange,
  onApiProviderChange,
}) => {
  const [apiProvider, setApiProvider] = useState<string>(currentApiProvider);
  const [wsPort, setWsPort] = useState<string>(String(currentPort));
  const [language, setLanguage] = useState<string>("en");
  const [portError, setPortError] = useState<string>("");

  useEffect(() => {
    console.log(`[SettingDrawer] 📥 Received currentPort prop: ${currentPort}`);
    setWsPort(String(currentPort));
  }, [currentPort]);

  useEffect(() => {
    console.log(
      `[SettingDrawer] 📥 Received currentApiProvider prop: ${currentApiProvider}`
    );
    setApiProvider(currentApiProvider);
  }, [currentApiProvider]);

  const apiProviderOptions = [{ value: "localhost", label: "localhost" }];

  const wsPortOptions = [{ value: "1500", label: "1500" }];

  const languageOptions = [
    { value: "en", label: "English" },
    { value: "vi", label: "Tiếng Việt" },
  ];

  const handleWsPortChange = (value: string | string[]) => {
    const portValue = Array.isArray(value) ? value[0] : value;
    console.log(`[SettingDrawer] 🔢 Port input changed: ${portValue}`);

    if (/^\d{4}$/.test(portValue)) {
      const portNumber = parseInt(portValue, 10);
      console.log(`[SettingDrawer] ✅ Valid port: ${portNumber}`);
      setWsPort(portValue);
      setPortError("");
      onPortChange(portNumber);
    } else {
      console.log(`[SettingDrawer] ❌ Invalid port format: ${portValue}`);
      setWsPort(portValue);
      setPortError("Port must be exactly 4 digits");
    }
  };

  const handleApiProviderChange = (value: string | string[]) => {
    const providerValue = Array.isArray(value) ? value[0] : value;
    console.log(`[SettingDrawer] 🔧 API Provider changed to: ${providerValue}`);
    setApiProvider(providerValue);
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
          <CustomCombobox
            label="API Provider"
            value={apiProvider}
            options={apiProviderOptions}
            onChange={handleApiProviderChange}
            placeholder="Enter or select API provider..."
            creatable={true}
            size="sm"
          />

          <div>
            <CustomCombobox
              label="WebSocket Port"
              value={wsPort}
              options={wsPortOptions}
              onChange={handleWsPortChange}
              placeholder="Enter 4-digit port number..."
              creatable={true}
              size="sm"
            />
            {portError && (
              <p className="text-xs text-red-500 mt-1 ml-1">{portError}</p>
            )}
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
