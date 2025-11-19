// src/background/ws-manager-new.ts
import { WSConnection, WSConnectionState } from "./ws-connection";

export class WSManagerNew {
  private connections: Map<string, WSConnection> = new Map();

  constructor() {
    this.cleanupOldConnections();
    this.createDefaultConnection();
    this.setupStorageListener();
    this.setupStateQueryHandler();
  }

  /**
   * ✅ Setup handler để UI có thể query states trực tiếp
   */
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
    ]);
  }

  private createDefaultConnection(): void {
    const FIXED_CONNECTION_ID = "ws-default-1500";

    const defaultConn = new WSConnection({
      id: FIXED_CONNECTION_ID,
      port: 1500,
      url: "ws://localhost:1500",
    });
    this.connections.set(FIXED_CONNECTION_ID, defaultConn);

    // Lưu connection ID vào storage để UI có thể truy cập
    chrome.storage.local.set({
      wsDefaultConnectionId: FIXED_CONNECTION_ID,
    });

    // 🆕 CRITICAL: Khởi tạo wsStates ngay lập tức với trạng thái disconnected
    chrome.storage.local.set({
      wsStates: {
        [FIXED_CONNECTION_ID]: {
          status: "disconnected",
          port: 1500,
          reconnectAttempts: 0,
        },
      },
    });
  }

  /**
   * Broadcast message to single connected WebSocket client (port 1500)
   */
  public broadcastToAll(message: any): void {
    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));

    let sentCount = 0;
    for (const conn of connectionsArray) {
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
    for (const conn of connectionsArray) {
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
    // CRITICAL: Chặn mọi connection không phải port 1500
    if (port !== 1500) {
      console.error(
        `[WSManager] Rejected connection attempt to invalid port: ${port}`
      );
      return { success: false, error: "Only port 1500 is supported" };
    }

    const connectionsArray: WSConnection[] = [];
    this.connections.forEach((conn) => connectionsArray.push(conn));
    for (const conn of connectionsArray) {
      if (conn.state.port === port) {
        return { success: false, error: "Connection already exists" };
      }
    }

    const id = `ws-${Date.now()}-default`;
    const url = `ws://localhost:${port}`;

    const wsConn = new WSConnection({ id, port, url });
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
    for (const conn of connectionsArray) {
      states.push(conn.getState());
    }
    return { success: true, connections: states };
  }
}
