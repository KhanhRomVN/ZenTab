// src/background/core/managers/websocket/ws-manager.ts

import { WSConnection } from "./ws-connection";
import { StorageManager } from "../../storage/storage-manager";
import { WSConnectionState } from "../../types/websocket.types";

/**
 * WebSocket Manager - Quản lý WebSocket connections
 */
export class WSManager {
  private connection: WSConnection | null = null;
  private storageManager: StorageManager;
  private isConnecting = false;

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
    if (this.isConnecting) {
      return { success: false, error: "Already connecting" };
    }

    if (this.connection && this.connection.getState().status === "connected") {
      return { success: true };
    }

    this.isConnecting = true;

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
      const connectionId = `ws-${Date.now()}-${port}`;

      console.log(
        `[WSManager] 🔌 Creating connection to port ${port}, URL: ${wsUrl}`
      );

      this.connection = new WSConnection({
        id: connectionId,
        port: port,
        url: wsUrl,
      });

      await this.connection.connect();

      return { success: true };
    } catch (error) {
      console.error("[WSManager] Connection failed:", error);
      this.connection = null;

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect WebSocket
   */
  public disconnect(): { success: boolean } {
    if (!this.connection) {
      return { success: true };
    }

    try {
      this.connection.disconnect();
      this.connection = null;
      return { success: true };
    } catch (error) {
      console.error("[WSManager] ❌ Disconnect failed:", error);
      return { success: false };
    }
  }

  /**
   * Gửi message qua WebSocket
   */
  public send(data: any): boolean {
    if (this.connection && this.connection.getState().status === "connected") {
      this.connection.send(data);
      return true;
    }
    return false;
  }

  /**
   * Broadcast message tới tất cả connected clients
   */
  public broadcastToAll(message: any): void {
    if (this.connection && this.connection.getState().status === "connected") {
      try {
        this.connection.send(message);
      } catch (error) {
        console.error("[WSManager] ❌ Failed to broadcast message:", error);
      }
    }
  }

  /**
   * Kiểm tra có active connections không
   */
  public async hasActiveConnections(): Promise<boolean> {
    return (
      this.connection !== null &&
      this.connection.getState().status === "connected"
    );
  }

  /**
   * Lấy connection info
   */
  public getConnectionInfo(): WSConnectionState | null {
    return this.connection ? this.connection.getState() : null;
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

        if (newApiProvider !== oldApiProvider) {
          if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
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
          if (this.connection) {
            const state = this.connection.getState();
            sendResponse({ success: true, state });
          } else {
            sendResponse({
              success: false,
              error: "No WebSocket connection available",
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
