// src/background/ws-manager-new.ts
import { WSConnection, WSConnectionState } from "./ws-connection";

export class WSManagerNew {
  private connections: Map<string, WSConnection> = new Map();

  constructor() {
    this.loadConnections();
    this.setupStorageListener();
  }

  private async loadConnections(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(["wsConnections"]);

      // Kiểm tra kỹ result và wsConnections
      if (!result || typeof result !== "object") {
        console.warn(
          "[WSManagerNew] Invalid storage result, initializing empty"
        );
        await chrome.storage.local.set({ wsConnections: [] });
        return;
      }

      const savedConnections = Array.isArray(result.wsConnections)
        ? result.wsConnections
        : [];

      for (const conn of savedConnections) {
        // Validate connection data
        if (!conn || !conn.id || !conn.port || !conn.url) {
          console.warn("[WSManagerNew] Skipping invalid connection:", conn);
          continue;
        }

        const wsConn = new WSConnection({
          id: conn.id,
          port: conn.port,
          url: conn.url,
        });
        this.connections.set(conn.id, wsConn);
      }

      console.log("[WSManagerNew] Loaded connections:", this.connections.size);
    } catch (error) {
      console.error("[WSManagerNew] Failed to load connections:", error);
      // Initialize empty array on error
      try {
        await chrome.storage.local.set({ wsConnections: [] });
      } catch (initError) {
        console.error(
          "[WSManagerNew] Failed to initialize storage:",
          initError
        );
      }
    }
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
    console.debug("[WSManagerNew] Handling command:", command);

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

      // Clear command
      await chrome.storage.local.remove(["wsCommand"]);
    } catch (error) {
      console.error("[WSManagerNew] Command failed:", error);
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
    }
  }

  private async addConnection(port: number): Promise<any> {
    if (!port || port < 1 || port > 65535) {
      return { success: false, error: "Invalid port number" };
    }

    // Check if port already exists
    for (const conn of this.connections.values()) {
      if (conn.state.port === port) {
        return { success: false, error: "Port already exists" };
      }
    }

    const id = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = `ws://localhost:${port}`;

    const wsConn = new WSConnection({ id, port, url });
    this.connections.set(id, wsConn);

    await this.saveConnections();

    // Auto connect
    wsConn.connect().catch((error) => {
      console.error("[WSManagerNew] Auto-connect failed:", error);
    });

    return { success: true, connectionId: id };
  }

  private async removeConnection(id: string): Promise<any> {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    conn.disconnect();
    this.connections.delete(id);

    await this.saveConnections();

    return { success: true };
  }

  private async connect(id: string): Promise<any> {
    const conn = this.connections.get(id);
    if (!conn) {
      return { success: false, error: "Connection not found" };
    }

    await conn.connect();
    return { success: true };
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
    for (const conn of this.connections.values()) {
      states.push(conn.getState());
    }
    return { success: true, connections: states };
  }

  private async saveConnections(): Promise<void> {
    const connectionsArray = Array.from(this.connections.values()).map(
      (conn) => ({
        id: conn.state.id,
        port: conn.state.port,
        url: conn.state.url,
      })
    );

    await chrome.storage.local.set({ wsConnections: connectionsArray });
  }
}
