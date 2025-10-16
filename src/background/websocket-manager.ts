export interface WebSocketConnection {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
  reconnectAttempts: number;
  ws?: WebSocket;
}

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private reconnectTimeouts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor() {
    this.loadConnections();
  }

  private async loadConnections(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(["wsConnections"]);
      const savedConnections = result.wsConnections || [];

      savedConnections.forEach((conn: WebSocketConnection) => {
        this.connections.set(conn.id, {
          ...conn,
          status: "disconnected",
          ws: undefined,
        });
      });
    } catch (error) {
      console.error("[WebSocketManager] Failed to load connections:", error);
    }
  }

  private async saveConnections(): Promise<void> {
    const connectionsArray = Array.from(this.connections.values()).map(
      (conn) => ({
        id: conn.id,
        port: conn.port,
        url: conn.url,
        status: conn.status,
        lastConnected: conn.lastConnected,
        reconnectAttempts: conn.reconnectAttempts,
      })
    );

    await chrome.storage.local.set({ wsConnections: connectionsArray });
  }

  public async addConnection(port: number): Promise<string> {
    const id = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = `ws://localhost:${port}`;

    const connection: WebSocketConnection = {
      id,
      port,
      url,
      status: "disconnected",
      reconnectAttempts: 0,
    };

    this.connections.set(id, connection);
    await this.saveConnections();

    // Tự động kết nối
    await this.connect(id);

    return id;
  }

  public async removeConnection(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (connection) {
      this.disconnect(id);
      this.connections.delete(id);
      await this.saveConnections();
    }
  }

  public async connect(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Connection ${id} not found`);
    }

    // Nếu đã kết nối, không làm gì
    if (
      connection.status === "connected" ||
      connection.status === "connecting"
    ) {
      return;
    }

    connection.status = "connecting";
    this.notifyStatusChange(id);

    try {
      const ws = new WebSocket(connection.url);

      ws.onopen = () => {
        console.log(`[WebSocketManager] Connected to ${connection.url}`);
        connection.status = "connected";
        connection.lastConnected = Date.now();
        connection.reconnectAttempts = 0;
        connection.ws = ws;
        this.notifyStatusChange(id);
        this.saveConnections();
      };

      ws.onerror = (error) => {
        console.error(`[WebSocketManager] Error on ${connection.url}:`, error);
        connection.status = "error";
        this.notifyStatusChange(id);
      };

      ws.onclose = () => {
        console.log(`[WebSocketManager] Disconnected from ${connection.url}`);
        connection.status = "disconnected";
        connection.ws = undefined;
        this.notifyStatusChange(id);

        // Auto reconnect
        if (connection.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect(id);
        }
      };

      ws.onmessage = (event) => {
        this.handleMessage(id, event.data);
      };
    } catch (error) {
      console.error(
        `[WebSocketManager] Failed to connect to ${connection.url}:`,
        error
      );
      connection.status = "error";
      this.notifyStatusChange(id);
    }
  }

  public disconnect(id: string): void {
    const connection = this.connections.get(id);
    if (connection && connection.ws) {
      // Clear reconnect timeout
      const timeout = this.reconnectTimeouts.get(id);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(id);
      }

      connection.ws.close();
      connection.ws = undefined;
      connection.status = "disconnected";
      this.notifyStatusChange(id);
    }
  }

  private scheduleReconnect(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;

    connection.reconnectAttempts++;

    const timeout = setTimeout(() => {
      console.log(
        `[WebSocketManager] Reconnecting to ${connection.url} (attempt ${connection.reconnectAttempts})`
      );
      this.connect(id);
    }, this.reconnectDelay);

    this.reconnectTimeouts.set(id, timeout as any);
  }

  private handleMessage(connectionId: string, data: string): void {
    try {
      const message = JSON.parse(data);

      // Broadcast message to all listeners
      chrome.runtime
        .sendMessage({
          action: "websocketMessage",
          connectionId,
          data: message,
        })
        .catch(() => {});
    } catch (error) {
      console.error("[WebSocketManager] Failed to parse message:", error);
    }
  }

  public sendMessage(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (connection && connection.ws && connection.status === "connected") {
      connection.ws.send(JSON.stringify(message));
    } else {
      console.warn(
        `[WebSocketManager] Cannot send message - connection ${connectionId} not ready`
      );
    }
  }

  public getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.id,
      port: conn.port,
      url: conn.url,
      status: conn.status,
      lastConnected: conn.lastConnected,
      reconnectAttempts: conn.reconnectAttempts,
    }));
  }

  public getConnection(id: string): WebSocketConnection | undefined {
    const conn = this.connections.get(id);
    if (!conn) return undefined;

    return {
      id: conn.id,
      port: conn.port,
      url: conn.url,
      status: conn.status,
      lastConnected: conn.lastConnected,
      reconnectAttempts: conn.reconnectAttempts,
    };
  }

  private notifyStatusChange(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      chrome.runtime
        .sendMessage({
          action: "websocketStatusChanged",
          connection: {
            id: connection.id,
            port: connection.port,
            url: connection.url,
            status: connection.status,
            lastConnected: connection.lastConnected,
            reconnectAttempts: connection.reconnectAttempts,
          },
        })
        .catch(() => {});
    }
  }
}
