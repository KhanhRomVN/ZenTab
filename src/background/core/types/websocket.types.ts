// src/background/core/types/websocket.types.ts

/**
 * WebSocket Connection Config
 */
export interface WSConnectionConfig {
  id: string;
  port: number;
  url: string;
}

/**
 * WebSocket Connection State
 */
export interface WSConnectionState {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
}

/**
 * WebSocket Message
 */
export interface WSMessage {
  type: string;
  data?: any;
  requestId?: string;
  timestamp?: number;
}

/**
 * WebSocket Storage Messages
 */
export interface WSStorageMessage {
  timestamp: number;
  data: WSMessage;
}

/**
 * WebSocket Outgoing Message
 */
export interface WSOutgoingMessage {
  connectionId: string;
  data: WSMessage;
  timestamp: number;
}

/**
 * WebSocket Incoming Request
 */
export interface WSIncomingRequest {
  type: string;
  requestId?: string;
  folderPath?: string;
  connectionId: string;
  timestamp: number;
}
