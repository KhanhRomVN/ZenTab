import React, { useState } from "react";
import { X, Plus } from "lucide-react";
import MotionCustomDrawer from "../common/CustomDrawer";
import PortCard from "./PortCard";

interface WebSocketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ports: Array<{ port: number; isConnected: boolean }>;
  onAddPort: (port: number) => void;
  onRemovePort: (port: number) => void;
}

const WebSocketDrawer: React.FC<WebSocketDrawerProps> = ({
  isOpen,
  onClose,
  ports,
  onAddPort,
  onRemovePort,
}) => {
  const [portInput, setPortInput] = useState("");

  const handleAddPort = () => {
    // Parse port from input (supports "6868" or "localhost:6868")
    let port: number;

    if (portInput.includes(":")) {
      // Format: "localhost:6868" or "127.0.0.1:6868"
      const parts = portInput.split(":");
      port = parseInt(parts[parts.length - 1], 10);
    } else {
      // Format: "6868"
      port = parseInt(portInput, 10);
    }

    if (isNaN(port) || port < 3000 || port > 9999) {
      console.error(`[WebSocketDrawer] Invalid port: ${portInput}`);
      return;
    }

    onAddPort(port);
    setPortInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddPort();
    }
  };

  return (
    <MotionCustomDrawer
      isOpen={isOpen}
      onClose={onClose}
      direction="bottom"
      animationType="slide"
      enableBlur={true}
      size="full"
      closeOnOverlayClick={true}
      showCloseButton={false}
      hideHeader={true}
    >
      <div className="h-full w-full flex flex-col bg-drawer-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-border-default">
          <h3 className="text-base font-semibold text-text-primary">
            WebSocket Manager
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-sidebar-itemHover rounded-lg transition-colors"
            aria-label="Close WebSocket manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add Port Input */}
        <div className="px-6 py-4 border-b border-border-default">
          <div className="flex gap-2">
            <input
              type="text"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter port (6868 or localhost:6868)"
              className="flex-1 px-3 py-2 bg-sidebar-itemHover border border-border-default rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddPort}
              disabled={!portInput}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Add</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Enter the port number from your VS Code Zen extension notification
          </p>
        </div>

        {/* Port List */}
        <div className="flex-1 overflow-y-auto p-4">
          {ports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-sm text-text-secondary mb-2">
                No ports connected
              </p>
              <p className="text-xs text-text-secondary">
                Add a port from your VS Code Zen extension
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {ports.map((portInfo) => (
                <PortCard
                  key={portInfo.port}
                  port={portInfo.port}
                  isConnected={portInfo.isConnected}
                  onDisconnect={onRemovePort}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </MotionCustomDrawer>
  );
};

export default WebSocketDrawer;
