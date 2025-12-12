import React from "react";
import { Wifi, WifiOff, X } from "lucide-react";

interface PortCardProps {
  port: number;
  isConnected: boolean;
  onDisconnect: (port: number) => void;
}

const PortCard: React.FC<PortCardProps> = ({
  port,
  isConnected,
  onDisconnect,
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-sidebar-itemHover rounded-lg border border-border-default">
      <div className="flex items-center gap-3">
        {isConnected ? (
          <Wifi className="w-5 h-5 text-green-500" />
        ) : (
          <WifiOff className="w-5 h-5 text-red-500" />
        )}
        <div>
          <p className="text-sm font-medium text-text-primary">Port {port}</p>
          <p className="text-xs text-text-secondary">
            {isConnected ? "Connected" : "Disconnected"}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDisconnect(port)}
        className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-sidebar-itemActive rounded-lg transition-colors"
        aria-label="Remove port"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default PortCard;
