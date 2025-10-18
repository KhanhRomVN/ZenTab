import React from "react";
import CustomButton from "../common/CustomButton";
import { Trash2, Power, PowerOff, Wifi, WifiOff, Loader2 } from "lucide-react";

interface WSConnectionState {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
  reconnectAttempts: number;
}

interface WebSocketCardProps {
  connection: WSConnectionState;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
}

const WebSocketCard: React.FC<WebSocketCardProps> = ({
  connection,
  onConnect,
  onDisconnect,
  onRemove,
}) => {
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
        return <Loader2 className="w-4 h-4 animate-spin" />; // Sử dụng spinner cho connecting
      case "error":
        return <WifiOff className="w-4 h-4" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  };

  const getStatusText = () => {
    switch (connection.status) {
      case "connected":
        return "Connected";
      case "connecting":
        return connection.reconnectAttempts > 0
          ? `Connecting... (${connection.reconnectAttempts})`
          : "Connecting...";
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

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-primary transition-colors">
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
            {getStatusText()}
          </span>
        </div>
        <p className="text-xs text-text-secondary truncate">{connection.url}</p>
        <p className="text-xs text-text-secondary/70 mt-0.5">
          Last connected: {formatLastConnected(connection.lastConnected)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {connection.status === "connected" ? (
          <CustomButton
            variant="warning"
            size="sm"
            icon={PowerOff}
            onClick={() => onDisconnect(connection.id)}
            children={undefined}
          />
        ) : connection.status === "connecting" ? (
          <CustomButton
            variant="loading"
            size="sm"
            icon={Loader2}
            disabled={true}
            children={undefined}
          />
        ) : (
          <CustomButton
            variant="success"
            size="sm"
            icon={Power}
            onClick={() => onConnect(connection.id)}
            children={undefined}
          />
        )}

        <CustomButton
          variant="error"
          size="sm"
          icon={Trash2}
          onClick={() => onRemove(connection.id)}
          children={undefined}
        />
      </div>
    </div>
  );
};

export default WebSocketCard;
