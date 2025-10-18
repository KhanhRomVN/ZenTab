import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import CustomInput from "../common/CustomInput";
import { WSHelper, WSConnectionState } from "@/shared/lib/ws-helper";
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
  const [connections, setConnections] = useState<WSConnectionState[]>([]);
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
      const conns = await WSHelper.getAllConnections();
      setConnections(conns);
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to load connections:", error);
      setConnections([]);
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
    const fnStartTime = Date.now();
    console.debug("[WebSocketDrawer] ===== START handleAddConnection =====");
    console.debug("[WebSocketDrawer] Function start time:", fnStartTime);
    console.debug("[WebSocketDrawer] Current time:", new Date().toISOString());
    console.debug("[WebSocketDrawer] newPort value:", newPort);
    console.debug("[WebSocketDrawer] newPort type:", typeof newPort);
    console.debug("[WebSocketDrawer] newPort length:", newPort.length);
    console.debug(
      "[WebSocketDrawer] Current connections count:",
      connections.length
    );
    console.debug("[WebSocketDrawer] Current error state:", error);
    console.debug("[WebSocketDrawer] Current isAdding state:", isAdding);

    setError("");
    console.debug("[WebSocketDrawer] Error state cleared");

    const port = parseInt(newPort);
    console.debug("[WebSocketDrawer] Parsed port:", port);
    console.debug("[WebSocketDrawer] Port type:", typeof port);
    console.debug("[WebSocketDrawer] Port is valid number?", !isNaN(port));
    console.debug("[WebSocketDrawer] Port validation:", {
      isNaN: isNaN(port),
      lessThan1: port < 1,
      greaterThan65535: port > 65535,
      inValidRange: port >= 1 && port <= 65535,
    });

    if (isNaN(port) || port < 1 || port > 65535) {
      console.debug("[WebSocketDrawer] ❌ Port validation failed");
      setError("Invalid port number (1-65535)");
      return;
    }

    const existingPort = connections.some((conn) => conn.port === port);
    console.debug("[WebSocketDrawer] Existing port check:", {
      port,
      existingPort,
      currentConnectionsCount: connections.length,
      allPorts: connections.map((c) => c.port),
    });

    if (existingPort) {
      console.debug("[WebSocketDrawer] ❌ Port already exists");
      setError("Connection with this port already exists");
      return;
    }

    console.debug("[WebSocketDrawer] ✅ Validation passed");
    console.debug("[WebSocketDrawer] Setting isAdding to true");
    setIsAdding(true);
    console.debug("[WebSocketDrawer] isAdding state updated");

    try {
      console.debug(
        "[WebSocketDrawer] Calling WSHelper.addConnection with port:",
        port
      );

      const response = await WSHelper.addConnection(port);

      console.debug("[WebSocketDrawer] WSHelper response:", response);
      console.debug("[WebSocketDrawer] Response type:", typeof response);
      console.debug(
        "[WebSocketDrawer] Response keys:",
        response ? Object.keys(response) : "null"
      );

      if (response && response.success) {
        console.debug(
          "[WebSocketDrawer] ✅ Success! Connection ID:",
          response.connectionId
        );
        setNewPort("");
        await loadConnections();
      } else {
        const errorMsg =
          (response && response.error) || "Failed to add connection";
        console.debug("[WebSocketDrawer] ❌ Error:", errorMsg);
        setError(errorMsg);
      }
    } catch (error) {
      console.error(
        "[WebSocketDrawer] ❌ Exception caught in try block:",
        error
      );
      console.debug("[WebSocketDrawer] Exception details:");
      console.debug("[WebSocketDrawer]   Type:", typeof error);
      console.debug(
        "[WebSocketDrawer]   Constructor:",
        error?.constructor?.name
      );
      console.debug(
        "[WebSocketDrawer]   Message:",
        error instanceof Error ? error.message : String(error)
      );
      console.debug(
        "[WebSocketDrawer]   Stack:",
        error instanceof Error ? error.stack : "N/A"
      );
      console.debug(
        "[WebSocketDrawer]   Name:",
        error instanceof Error ? error.name : "N/A"
      );
      console.debug("[WebSocketDrawer]   toString:", error?.toString?.());

      console.debug(
        "[WebSocketDrawer] Setting error state to 'Failed to add connection'"
      );
      setError("Failed to add connection");
      console.debug("[WebSocketDrawer] Error state set");
    } finally {
      console.debug("[WebSocketDrawer] Entering finally block");
      console.debug("[WebSocketDrawer] Setting isAdding to false");
      setIsAdding(false);
      console.debug("[WebSocketDrawer] isAdding state updated");

      const fnEndTime = Date.now();
      console.debug("[WebSocketDrawer] Function end time:", fnEndTime);
      console.debug(
        "[WebSocketDrawer] Total function duration:",
        fnEndTime - fnStartTime,
        "ms"
      );
      console.debug("[WebSocketDrawer] ===== END handleAddConnection =====");
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
    console.debug("[WebSocketDrawer] Attempting to connect:", id);
    try {
      const response = await chrome.runtime.sendMessage({
        action: "connectWebSocket",
        connectionId: id,
      });
      console.debug("[WebSocketDrawer] Connect response:", response);
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to connect:", error);
      console.debug("[WebSocketDrawer] Connect error details:", {
        connectionId: id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  };

  const handleDisconnect = async (id: string) => {
    console.debug("[WebSocketDrawer] Attempting to disconnect:", id);
    try {
      const response = await chrome.runtime.sendMessage({
        action: "disconnectWebSocket",
        connectionId: id,
      });
      console.debug("[WebSocketDrawer] Disconnect response:", response);
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to disconnect:", error);
      console.debug("[WebSocketDrawer] Disconnect error details:", {
        connectionId: id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
        <div className="p-4 border-b border-border-default">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            Add New Connection
          </h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <CustomInput
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
