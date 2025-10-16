import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import CustomInput from "../common/CustomInput";
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  Wifi,
  WifiOff,
  AlertCircle,
} from "lucide-react";

interface WebSocketConnection {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
  reconnectAttempts: number;
}

interface WebSocketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const WebSocketDrawer: React.FC<WebSocketDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [connections, setConnections] = useState<WebSocketConnection[]>([]);
  const [newPort, setNewPort] = useState("");
  const [error, setError] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConnections();

      // Listen for status changes
      const messageListener = (message: any) => {
        if (message.action === "websocketStatusChanged") {
          updateConnectionStatus(message.connection);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, [isOpen]);

  const loadConnections = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getWebSocketConnections",
      });
      setConnections(response || []);
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to load connections:", error);
    }
  };

  const updateConnectionStatus = (updatedConnection: WebSocketConnection) => {
    setConnections((prev) =>
      prev.map((conn) =>
        conn.id === updatedConnection.id ? updatedConnection : conn
      )
    );
  };

  const handleAddConnection = async () => {
    setError("");

    // Validate port
    const port = parseInt(newPort);
    if (isNaN(port) || port < 1 || port > 65535) {
      setError("Invalid port number (1-65535)");
      return;
    }

    // Check if port already exists
    if (connections.some((conn) => conn.port === port)) {
      setError("Connection with this port already exists");
      return;
    }

    setIsAdding(true);

    try {
      const response = await chrome.runtime.sendMessage({
        action: "addWebSocketConnection",
        port,
      });

      if (response.success) {
        setNewPort("");
        await loadConnections();
      } else {
        setError(response.error || "Failed to add connection");
      }
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to add connection:", error);
      setError("Failed to add connection");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveConnection = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "removeWebSocketConnection",
        connectionId: id,
      });
      await loadConnections();
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to remove connection:", error);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "connectWebSocket",
        connectionId: id,
      });
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to connect:", error);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "disconnectWebSocket",
        connectionId: id,
      });
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to disconnect:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "text-green-600 dark:text-green-400";
      case "connecting":
        return "text-yellow-600 dark:text-yellow-400";
      case "error":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <Wifi className="w-4 h-4" />;
      case "connecting":
        return <Wifi className="w-4 h-4 animate-pulse" />;
      case "error":
        return <WifiOff className="w-4 h-4" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  };

  const getStatusText = (connection: WebSocketConnection) => {
    switch (connection.status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return `Error (${connection.reconnectAttempts} retries)`;
      default:
        return "Disconnected";
    }
  };

  const formatLastConnected = (timestamp?: number) => {
    if (!timestamp) return "Never";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const drawerContent = (
    <MotionCustomDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="WebSocket Connections"
      subtitle="Manage WebSocket connections for real-time communication"
      direction="right"
      size="full"
      animationType="slide"
      enableBlur={false}
      closeOnOverlayClick={true}
      showCloseButton={true}
    >
      <div className="h-full overflow-y-auto bg-drawer-background">
        {/* Add Connection Form */}
        <div className="p-4 border-b border-border-default bg-card-background">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            Add New Connection
          </h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <CustomInput
                type="number"
                placeholder="Port number (e.g., 8080)"
                value={newPort}
                onChange={setNewPort}
                error={error}
                size="sm"
                min={1}
                max={65535}
              />
            </div>
            <CustomButton
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={handleAddConnection}
              loading={isAdding}
              disabled={!newPort || isAdding}
            >
              Add
            </CustomButton>
          </div>
        </div>

        {/* Connections List */}
        <div className="p-4 space-y-3">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-primary transition-colors"
            >
              {/* Status Icon */}
              <div
                className={`w-10 h-10 flex items-center justify-center rounded-md ${getStatusColor(
                  connection.status
                )} bg-gray-100 dark:bg-gray-800`}
              >
                {getStatusIcon(connection.status)}
              </div>

              {/* Connection Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-text-primary truncate">
                    Port {connection.port}
                  </h3>
                  <span
                    className={`text-xs font-medium ${getStatusColor(
                      connection.status
                    )}`}
                  >
                    {getStatusText(connection)}
                  </span>
                </div>
                <p className="text-xs text-text-secondary truncate">
                  {connection.url}
                </p>
                <p className="text-xs text-text-secondary/70 mt-0.5">
                  Last connected:{" "}
                  {formatLastConnected(connection.lastConnected)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {connection.status === "connected" ? (
                  <CustomButton
                    variant="warning"
                    size="sm"
                    icon={PowerOff}
                    onClick={() => handleDisconnect(connection.id)}
                  >
                    Disconnect
                  </CustomButton>
                ) : (
                  <CustomButton
                    variant="success"
                    size="sm"
                    icon={Power}
                    onClick={() => handleConnect(connection.id)}
                    disabled={connection.status === "connecting"}
                  >
                    Connect
                  </CustomButton>
                )}

                <CustomButton
                  variant="error"
                  size="sm"
                  icon={Trash2}
                  onClick={() => handleRemoveConnection(connection.id)}
                  children={undefined}
                />
              </div>
            </div>
          ))}

          {connections.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl">🔌</span>
              </div>
              <p className="text-sm text-text-secondary">
                No WebSocket connections
              </p>
              <p className="text-xs text-text-secondary/70 mt-1">
                Add a connection to get started
              </p>
            </div>
          )}
        </div>

        {/* Info Section */}
        {connections.length > 0 && (
          <div className="p-4 border-t border-border-default">
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  WebSocket connections will automatically reconnect if
                  disconnected. Make sure your local server is running on the
                  specified port.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MotionCustomDrawer>
  );

  return isOpen ? createPortal(drawerContent, document.body) : null;
};

export default WebSocketDrawer;
