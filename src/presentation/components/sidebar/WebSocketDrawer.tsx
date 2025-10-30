import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import CustomInput from "../common/CustomInput";
import WebSocketCard from "./WebSocketCard";
import { WSHelper, WSConnectionState } from "@/shared/lib/ws-helper";
import { Plus, AlertCircle } from "lucide-react";

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

      // Load initial wsStates - wrapped in Promise for Firefox compatibility
      const loadInitialStates = async () => {
        try {
          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get(["wsStates"], (data) => {
              resolve(data || {});
            });
          });

          const states = result?.wsStates || {};

          setConnections((prev) =>
            prev.map((conn) => {
              const newState = states[conn.id];
              if (newState) {
                return { ...conn, ...newState };
              }
              return conn;
            })
          );
        } catch (error) {
          console.warn(
            "[WebSocketDrawer] Failed to load initial wsStates:",
            error
          );
        }
      };

      loadInitialStates();

      // Listen for status changes via storage
      const storageListener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
      ) => {
        if (areaName !== "local") return;

        if (changes.wsStates) {
          const states = changes.wsStates.newValue || {};
          // Update connections với states mới nhất
          setConnections((prev) =>
            prev.map((conn) => {
              const newState = states[conn.id];
              if (newState) {
                return { ...conn, ...newState };
              }
              return conn;
            })
          );
        }
      };

      chrome.storage.onChanged.addListener(storageListener);

      return () => {
        chrome.storage.onChanged.removeListener(storageListener);
      };
    }
  }, [isOpen]);

  const loadConnections = async () => {
    try {
      const conns = await WSHelper.getAllConnections();

      // Sync với wsStates từ storage - with proper error handling
      try {
        const result = await new Promise<any>((resolve) => {
          chrome.storage.local.get(["wsStates"], (data) => {
            resolve(data || {});
          });
        });

        const states = result?.wsStates || {};

        const mergedConns = conns.map((conn: WSConnectionState) => {
          const state = states[conn.id];
          if (state) {
            return { ...conn, ...state };
          }
          return conn;
        });

        setConnections(mergedConns);
      } catch (storageError) {
        console.warn(
          "[WebSocketDrawer] Failed to sync with wsStates, using connections as-is:",
          storageError
        );
        setConnections(conns);
      }
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to load connections:", error);
      setConnections([]);
    }
  };

  const handleAddConnection = async () => {
    const fnStartTime = Date.now();
    setError("");

    const port = parseInt(newPort);

    if (isNaN(port) || port < 1 || port > 65535) {
      setError("Invalid port number (1-65535)");
      return;
    }

    const existingPort = connections.some((conn) => conn.port === port);

    if (existingPort) {
      setError("Connection with this port already exists");
      return;
    }

    setIsAdding(true);

    try {
      const response = await WSHelper.addConnection(port);
      if (response && response.success) {
        setNewPort("");
        await loadConnections();
      } else {
        const errorMsg =
          (response && response.error) || "Failed to add connection";
        setError(errorMsg);
      }
    } catch (error) {
      console.error(
        "[WebSocketDrawer] ❌ Exception caught in try block:",
        error
      );
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
      const response = await WSHelper.connect(id);
      if (!response.success) {
        console.error("[WebSocketDrawer] Connect failed:", response.error);
        setError(response.error || "Failed to connect");
      }

      // Không cần reload - storage listener sẽ tự động update
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to connect:", error);
      setError(error instanceof Error ? error.message : "Connection failed");
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      const response = await WSHelper.disconnect(id);
      if (!response.success) {
        console.error("[WebSocketDrawer] Disconnect failed:", response.error);
        setError(response.error || "Failed to disconnect");
      }

      // Không cần reload - storage listener sẽ tự động update
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to disconnect:", error);
      setError(error instanceof Error ? error.message : "Disconnection failed");
    }
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
            <WebSocketCard
              key={connection.id}
              connection={connection}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onRemove={handleRemoveConnection}
            />
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
