// src/background/ws-manager-new.ts
import { WSConnection, WSConnectionState } from "./ws-connection";

export class WSManagerNew {
  private connections: Map<string, WSConnection> = new Map();
  private requestToConnection: Map<string, WSConnection> = new Map();

  constructor() {
    this.cleanupOldConnections();
    this.createDefaultConnection();
    this.setupStorageListener();
    this.setupStateQueryHandler();
  }

  private setupStateQueryHandler(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "getWSStates") {
        const states: Record<string, any> = {};
        for (const [id, conn] of this.connections.entries()) {
          states[id] = conn.getState();
        }
        sendResponse({ states });
        return true;
      }

      // 🆕 NEW: Handler để Sidebar query connection info
      if (message.action === "getWSConnectionInfo") {
        // Get default connection ID and state
        const connectionIds = Array.from(this.connections.keys());
        const defaultConnectionId =
          connectionIds.length > 0 ? connectionIds[0] : null;

        if (defaultConnectionId) {
          const conn = this.connections.get(defaultConnectionId);
          const state = conn ? conn.getState() : null;

          sendResponse({
            success: true,
            connectionId: defaultConnectionId,
            state: state,
          });
        } else {
          console.warn("[WSManager] ⚠️ No connections available");
          sendResponse({
            success: false,
            error: "No WebSocket connections available",
          });
        }

        return true;
      }
    });
  }

  private cleanupOldConnections(): void {
    chrome.storage.local.remove([
      "wsStates",
      "wsConnections",
      "wsMessages",
      "wsOutgoingMessage",
      "wsIncomingRequest",
      "wsCommand",
      "wsCommandResult",
      "wsDefaultConnectionId",
    ]);
  }

  private async createDefaultConnection(): Promise<void> {
    const storageResult = await new Promise<any>((resolve) => {
      chrome.storage.local.get(["apiProvider"], (data: any) => {
        resolve(data || {});
      });
    });

    let apiProvider = storageResult?.apiProvider;

    if (!apiProvider || !this.isValidApiProvider(apiProvider)) {
      apiProvider = "localhost:3030";
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ apiProvider: apiProvider }, () => {
          resolve();
        });
      });
    }

    const { port, wsUrl } = this.parseApiProvider(apiProvider);
    const connectionId = `ws-${Date.now()}-${port}`;
    const defaultConn = new WSConnection({
      id: connectionId,
      port: port,
      url: wsUrl,
    });
    this.connections.set(connectionId, defaultConn);

    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(
        {
          wsDefaultConnectionId: connectionId,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[WSManager] ❌ Failed to set wsDefaultConnectionId:",
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        }
      );
    });

    // Đợi storage.set() hoàn thành cho wsStates
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(
        {
          wsStates: {
            [connectionId]: {
              status: "disconnected",
              reconnectAttempts: 0,
            },
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[WSManager] ❌ Failed to set wsStates:",
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        }
      );
    });
  }

  private isValidApiProvider(apiProvider: string): boolean {
    if (!apiProvider || apiProvider.trim() === "") {
      return false;
    }

    const trimmed = apiProvider.trim();

    if (trimmed === "localhost" || trimmed === "0.0.0.0") {
      return false;
    }

    return true;
  }

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

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const protocol = isHttps ? "wss" : "ws";

    let host = urlObj.hostname;
    let port = 3030;

    if (urlObj.port) {
      port = parseInt(urlObj.port, 10);
    } else if (isHttps) {
      port = 443;
    }

    const wsUrl =
      isHttps && !urlObj.port
        ? `${protocol}://${host}/ws`
        : `${protocol}://${host}:${port}/ws`;

    return { protocol, host, port, wsUrl };
  }

  /**
   * Broadcast message to single connected WebSocket client (port 1500)
   */
  public broadcastToAll(message: any): void {
    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));

    let sentCount = 0;
    const connectionsToProcess = connectionsArray;
    for (let i = 0; i < connectionsToProcess.length; i++) {
      const conn = connectionsToProcess[i];
      if (conn.state.status === "connected") {
        try {
          conn.send(message);
          sentCount++;
        } catch (error) {
          // Ignore send errors
        }
      }
    }
  }

  /**
   * Kiểm tra WebSocket connection (port 1500) có đang connected không
   */
  public async hasActiveConnections(): Promise<boolean> {
    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));
    for (let i = 0; i < connectionsArray.length; i++) {
      const conn = connectionsArray[i];
      if (conn.state.status === "connected") {
        return true;
      }
    }

    return false;
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      // Listen for command from UI
      if (changes.wsCommand) {
        const command = changes.wsCommand.newValue;
        if (command) {
          this.handleCommand(command);
        }
      }

      // ✅ Listen for apiProvider changes to create/recreate connection
      if (changes.apiProvider) {
        const newApiProvider = changes.apiProvider.newValue;
        if (newApiProvider && this.isValidApiProvider(newApiProvider)) {
          const oldConnectionIds = Array.from(this.connections.keys());
          for (const id of oldConnectionIds) {
            const conn = this.connections.get(id);
            if (conn) {
              conn.disconnect();
            }
            this.connections.delete(id);
          }

          this.createDefaultConnection();
        }
      }
    });
  }

  private async handleCommand(command: any): Promise<void> {
    try {
      let result: any;

      switch (command.action) {
        case "add":
          result = await this.addConnection(command.port);
          break;
        case "remove":
          result = await this.removeConnection(command.connectionId);
          break;
        case "connect":
          result = await this.connect(command.connectionId);
          break;
        case "disconnect":
          result = this.disconnect(command.connectionId);
          break;
        case "send":
          result = this.sendMessage(command.connectionId, command.data);
          break;
        case "getAll":
          result = this.getAllConnections();
          break;
        default:
          result = { success: false, error: "Unknown command" };
      }

      // Write result back to storage
      await chrome.storage.local.set({
        wsCommandResult: {
          commandId: command.commandId,
          result: result,
          timestamp: Date.now(),
        },
      });

      // Clear command SAU KHI đã ghi result
      await chrome.storage.local.remove(["wsCommand"]);
    } catch (error) {
      await chrome.storage.local.set({
        wsCommandResult: {
          commandId: command.commandId,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          timestamp: Date.now(),
        },
      });

      // Clear command ngay cả khi lỗi
      await chrome.storage.local.remove(["wsCommand"]);
    }
  }

  private async addConnection(port: number): Promise<any> {
    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));
    for (const conn of connectionsArray) {
      if (conn.state.port === port) {
        return { success: false, error: "Connection already exists" };
      }
    }

    const storageResult = await new Promise<any>((resolve) => {
      chrome.storage.local.get(["apiProvider"], (data: any) => {
        resolve(data || {});
      });
    });

    const apiProvider = storageResult?.apiProvider;

    if (!apiProvider || !this.isValidApiProvider(apiProvider)) {
      return { success: false, error: "Invalid API Provider" };
    }

    const { port: parsedPort, wsUrl } = this.parseApiProvider(apiProvider);

    if (parsedPort !== port) {
      return { success: false, error: "Port mismatch with API Provider" };
    }

    const id = `ws-${Date.now()}-${port}`;
    const wsConn = new WSConnection({ id, port, url: wsUrl });
    this.connections.set(id, wsConn);

    return { success: true, connectionId: id };
  }

  private async removeConnection(_id: string): Promise<any> {
    return { success: false, error: "Cannot remove default connection" };
  }

  private async connect(id: string): Promise<any> {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    try {
      await conn.connect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private disconnect(id: string): any {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    conn.disconnect();
    return { success: true };
  }

  private sendMessage(id: string, data: any): any {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    conn.send(data);
    return { success: true };
  }

  private getAllConnections(): any {
    const states: WSConnectionState[] = [];
    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));
    for (let i = 0; i < connectionsArray.length; i++) {
      const conn = connectionsArray[i];
      states.push(conn.getState());
    }
    return { success: true, connections: states };
  }

  /**
   * Lưu mapping requestId → connection để gửi response sau
   */
  public registerRequest(requestId: string, connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.requestToConnection.set(requestId, connection);
    }
  }

  /**
   * Gửi response trực tiếp qua connection đã đăng ký
   */
  public sendResponse(requestId: string, data: any): boolean {
    const connection = this.requestToConnection.get(requestId);
    if (connection && connection.state.status === "connected") {
      connection.send(data);
      this.requestToConnection.delete(requestId);
      return true;
    }
    return false;
  }
}
