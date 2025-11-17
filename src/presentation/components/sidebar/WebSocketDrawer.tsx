import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import WebSocketCard from "./WebSocketCard";
import { WSHelper, WSConnectionState } from "@/shared/lib/ws-helper";
import { RefreshCw } from "lucide-react";

interface WebSocketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const WebSocketDrawer: React.FC<WebSocketDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [connections, setConnections] = useState<WSConnectionState[]>([]);
  const [error, setError] = useState("");
  const [isReloading, setIsReloading] = useState(false);

  const initializeDefaultPorts = async () => {
    try {
      const DEFAULT_PORTS = [
        1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510,
      ];

      // Load existing connections
      const existingConns = await WSHelper.getAllConnections();
      const existingPorts = existingConns.map(
        (conn: WSConnectionState) => conn.port
      );

      // Add missing ports
      for (const port of DEFAULT_PORTS) {
        if (!existingPorts.includes(port)) {
          await WSHelper.addConnection(port);
        }
      }

      // Reload all connections
      await loadConnections();
    } catch (error) {
      console.error(
        "[WebSocketDrawer] Failed to initialize default ports:",
        error
      );
      setError("Failed to initialize default ports");
    }
  };

  useEffect(() => {
    if (isOpen) {
      initializeDefaultPorts();

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
          setConnections((prev) => {
            const updated = prev.map((conn) => {
              const newState = states[conn.id];
              if (newState) {
                return { ...conn, ...newState };
              }
              return conn;
            });

            return updated;
          });
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

      // Sort by port number
      const sortedConns = conns.sort(
        (a: WSConnectionState, b: WSConnectionState) => a.port - b.port
      );

      // Sync với wsStates từ storage - with proper error handling
      try {
        const result = await new Promise<any>((resolve) => {
          chrome.storage.local.get(["wsStates"], (data) => {
            resolve(data || {});
          });
        });

        const states = result?.wsStates || {};

        const mergedConns = sortedConns.map((conn: WSConnectionState) => {
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
        setConnections(sortedConns);
      }
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to load connections:", error);
      setConnections([]);
    }
  };

  const handleReloadAll = async () => {
    setError("");
    setIsReloading(true);

    try {
      // Disconnect all first
      for (const conn of connections) {
        if (conn.status === "connected" || conn.status === "connecting") {
          await WSHelper.disconnect(conn.id);
        }
      }

      // Wait a bit for disconnections to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Connect all
      for (const conn of connections) {
        await WSHelper.connect(conn.id);
        // Small delay between connections
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error("[WebSocketDrawer] Failed to reload all:", error);
      setError("Failed to reload all connections");
    } finally {
      setIsReloading(false);
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
        console.error("[WebSocketDrawer] ❌ Connect failed:", response.error);
        setError(response.error || "Failed to connect");
      } else {
      }

      // Không cần reload - storage listener sẽ tự động update
    } catch (error) {
      console.error("[WebSocketDrawer] ❌ Exception in handleConnect:", error);
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
        {/* Reload All Button */}
        <div className="p-4 border-b border-border-default">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            WebSocket Connections (Ports 1501-1510)
          </h3>
          <CustomButton
            variant="primary"
            size="sm"
            icon={RefreshCw}
            onClick={handleReloadAll}
            loading={isReloading}
            disabled={isReloading || connections.length === 0}
            className="w-full"
          >
            {isReloading ? "Reloading..." : "Reload All Connections"}
          </CustomButton>
          {error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
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
      </div>
    </MotionCustomDrawer>
  );

  return isOpen ? createPortal(drawerContent, document.body) : null;
};

export default WebSocketDrawer;
