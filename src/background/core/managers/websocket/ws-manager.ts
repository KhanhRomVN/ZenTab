// src/background/core/managers/websocket/ws-manager.ts

import { WSConnection } from "./ws-connection";
import { StorageManager } from "../../storage/storage-manager";
import { WSConnectionState } from "../../types/websocket.types";

/**
 * WebSocket Manager - Quản lý WebSocket connections
 */
export class WSManager {
  private connections: Map<string, WSConnection> = new Map();
  private storageManager: StorageManager;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.setupStorageListener();
    this.setupStateQueryHandler();
    this.cleanupOldConnections();
  }

  /**
   * Connect tới WebSocket server
   */
  public async connect(
    overrideUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log(
      `[WSManager] 🎯 connect() called with overrideUrl: ${
        overrideUrl || "(none)"
      }`
    );

    try {
      // Use override URL if provided, otherwise check storage
      const storedProvider = await this.storageManager.get<string>(
        "apiProvider"
      );
      const apiProvider = overrideUrl || storedProvider;

      if (!apiProvider || !this.isValidApiProvider(apiProvider)) {
        return {
          success: false,
          error: "API Provider not configured. Please set it in Settings.",
        };
      }

      const { port, wsUrl } = this.parseApiProvider(apiProvider);
      const portKey = `port-${port}`;

      // Check if connection for this port already exists
      const existingConnection = this.connections.get(portKey);
      if (existingConnection) {
        const currentState = existingConnection.getState();
        console.log(
          `[WSManager] 🔍 Existing connection found for port ${port}: status=${currentState.status}`
        );

        if (currentState.status === "connected") {
          console.log(
            `[WSManager] ✅ Connection already exists and is connected to port ${port}`
          );
          return { success: true };
        } else {
          // Remove disconnected connection
          console.log(
            `[WSManager] 🗑️ Removing stale connection for port ${port}`
          );
          this.connections.delete(portKey);
        }
      } else {
        console.log(
          `[WSManager] ℹ️ No existing connection found for port ${port}`
        );
      }

      const connectionId = `ws-${Date.now()}-${port}`;

      console.log(`[WSManager] 🔌 Creating NEW connection:`, {
        connectionId,
        port,
        wsUrl,
        apiProvider,
        totalConnections: this.connections.size,
      });

      const connection = new WSConnection({
        id: connectionId,
        port: port,
        url: wsUrl,
      });

      console.log(
        `[WSManager] ✅ WSConnection instance created for port ${port}`
      );

      console.log(
        `[WSManager] 🚀 Calling connection.connect() for port ${port}...`
      );
      await connection.connect();

      // Add to connections Map
      this.connections.set(portKey, connection);

      console.log(
        `[WSManager] ✅ Connection established successfully to port ${port}. Total connections: ${this.connections.size}`
      );
      return { success: true };
    } catch (error) {
      console.error("[WSManager] Connection failed:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Disconnect WebSocket
   * @param port - Optional port number. If provided, disconnect only that port. Otherwise disconnect all.
   */
  public disconnect(port?: number): { success: boolean } {
    if (port !== undefined) {
      // Disconnect specific port
      const portKey = `port-${port}`;
      const connection = this.connections.get(portKey);

      console.log(
        `[WSManager] 🔌 disconnect() called for port ${port}, connection exists: ${!!connection}`
      );

      if (!connection) {
        console.log(`[WSManager] ℹ️ No connection found for port ${port}`);
        return { success: true };
      }

      try {
        const connId = connection.getState().id;
        console.log(
          `[WSManager] 📤 Disconnecting connection: ${connId} (port ${port})`
        );
        connection.disconnect();
        this.connections.delete(portKey);
        console.log(
          `[WSManager] ✅ Connection ${connId} disconnected and removed. Remaining connections: ${this.connections.size}`
        );
        return { success: true };
      } catch (error) {
        console.error(
          `[WSManager] ❌ Disconnect failed for port ${port}:`,
          error
        );
        return { success: false };
      }
    } else {
      // Disconnect all connections
      console.log(
        `[WSManager] 🔌 disconnect() called for ALL connections (${this.connections.size} total)`
      );

      if (this.connections.size === 0) {
        console.log("[WSManager] ℹ️ No connections to disconnect");
        return { success: true };
      }

      try {
        const connectionIds: string[] = [];
        for (const [portKey, connection] of this.connections.entries()) {
          const connId = connection.getState().id;
          connectionIds.push(connId);
          connection.disconnect();
        }
        this.connections.clear();
        console.log(
          `[WSManager] ✅ All connections disconnected: ${connectionIds.join(
            ", "
          )}`
        );
        return { success: true };
      } catch (error) {
        console.error("[WSManager] ❌ Disconnect all failed:", error);
        return { success: false };
      }
    }
  }

  /**
   * Gửi message qua WebSocket
   * @param data - Message data to send
   * @param port - Optional port number. If provided, send to that port only. Otherwise send to all.
   */
  public send(data: any, port?: number): boolean {
    if (port !== undefined) {
      // Send to specific port
      const portKey = `port-${port}`;
      const connection = this.connections.get(portKey);
      if (connection && connection.getState().status === "connected") {
        connection.send(data);
        return true;
      }
      return false;
    } else {
      // Send to all connections
      let sentCount = 0;
      for (const connection of this.connections.values()) {
        if (connection.getState().status === "connected") {
          connection.send(data);
          sentCount++;
        }
      }
      return sentCount > 0;
    }
  }

  /**
   * Broadcast message tới tất cả connected clients
   */
  public broadcastToAll(message: any): void {
    let broadcastCount = 0;
    for (const [portKey, connection] of this.connections.entries()) {
      if (connection.getState().status === "connected") {
        try {
          connection.send(message);
          broadcastCount++;
        } catch (error) {
          console.error(
            `[WSManager] ❌ Failed to broadcast to ${portKey}:`,
            error
          );
        }
      }
    }
    console.log(
      `[WSManager] 📡 Broadcast sent to ${broadcastCount}/${this.connections.size} connections`
    );
  }

  /**
   * Kiểm tra có active connections không
   */
  public async hasActiveConnections(): Promise<boolean> {
    for (const connection of this.connections.values()) {
      if (connection.getState().status === "connected") {
        return true;
      }
    }
    return false;
  }

  /**
   * Lấy connection info
   * @returns Array of all connection states
   */
  public getConnectionInfo(): WSConnectionState[] {
    const states: WSConnectionState[] = [];
    for (const connection of this.connections.values()) {
      states.push(connection.getState());
    }
    return states;
  }

  /**
   * Get specific connection by port
   */
  public getConnection(port: number): WSConnection | null {
    return this.connections.get(`port-${port}`) || null;
  }

  /**
   * Get all connections
   */
  public getAllConnections(): WSConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Parse API Provider URL
   */
  private parseApiProvider(apiProvider: string): {
    protocol: string;
    host: string;
    port: number;
    wsUrl: string;
  } {
    let url = apiProvider.trim();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `http://${url}`;
    }

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (error) {
      console.error("[WSManager] ❌ Failed to parse URL:", url);
      throw new Error(`Invalid API Provider URL: ${apiProvider}`);
    }

    const isHttps = urlObj.protocol === "https:";
    const protocol = isHttps ? "wss" : "ws";

    const host = urlObj.hostname;
    let port = 80;

    if (urlObj.port) {
      port = parseInt(urlObj.port, 10);
    } else if (isHttps) {
      port = 443;
    } else {
      port = 80;
    }

    const wsUrl =
      isHttps && !urlObj.port
        ? `${protocol}://${host}/ws`
        : `${protocol}://${host}:${port}/ws`;

    return { protocol, host, port, wsUrl };
  }

  /**
   * Validate API Provider
   */
  private isValidApiProvider(apiProvider: string): boolean {
    if (!apiProvider || apiProvider.trim() === "") {
      return false;
    }

    return true;
  }

  /**
   * Cleanup old connections
   */
  private cleanupOldConnections(): void {
    this.storageManager
      .remove(["wsMessages", "wsOutgoingMessage", "wsIncomingRequest"])
      .catch((error) => {
        console.error("[WSManager] ❌ Cleanup failed:", error);
      });
  }

  /**
   * Setup storage listener cho API Provider changes
   */
  private setupStorageListener(): void {
    this.storageManager.onChange((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.apiProvider) {
        const newApiProvider = changes.apiProvider.newValue;
        const oldApiProvider = changes.apiProvider.oldValue;

        console.log(`[WSManager] 🔄 apiProvider changed:`, {
          old: oldApiProvider,
          new: newApiProvider,
        });

        if (newApiProvider && newApiProvider !== oldApiProvider) {
          try {
            const { port } = this.parseApiProvider(newApiProvider);
            const portKey = `port-${port}`;

            // Check if we already have a connection for this provider
            if (!this.connections.has(portKey)) {
              console.log(
                `[WSManager] 🆕 New API Provider detected (${newApiProvider}), initiating connection...`
              );
              this.connect(newApiProvider);
            }
          } catch (error) {
            console.error(
              "[WSManager] ❌ Failed to parse new API Provider:",
              error
            );
          }
        }
      }
    });
  }

  /**
   * Setup state query handler cho runtime messages
   */
  private setupStateQueryHandler(): void {
    const browserAPI = this.getBrowserAPI();

    browserAPI.runtime.onMessage.addListener(
      (message: any, _sender: any, sendResponse: any) => {
        if (message.action === "getWSConnectionInfo") {
          const states: WSConnectionState[] = [];
          for (const connection of this.connections.values()) {
            states.push(connection.getState());
          }

          if (states.length > 0) {
            sendResponse({ success: true, states });
          } else {
            sendResponse({
              success: false,
              states: [],
              error: "No WebSocket connections available",
            });
          }
          return true;
        }
        return false;
      }
    );
  }

  private getBrowserAPI(): any {
    if (typeof (globalThis as any).browser !== "undefined") {
      return (globalThis as any).browser;
    }
    if (typeof chrome !== "undefined") {
      return chrome;
    }
    throw new Error("No browser API available");
  }
}
