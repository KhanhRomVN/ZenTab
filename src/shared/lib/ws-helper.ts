// src/shared/lib/ws-helper.ts

export interface WSConnectionState {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
  reconnectAttempts: number;
}

export class WSHelper {
  /**
   * Gửi command tới background và đợi response
   */
  private static async sendCommand(command: any): Promise<any> {
    const commandId = `cmd-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    console.debug("[WSHelper] Sending command:", { ...command, commandId });

    // Setup listener TRƯỚC KHI ghi command
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.storage.onChanged.removeListener(listener);
        console.error("[WSHelper] Command timeout:", commandId);
        reject(new Error("Command timeout"));
      }, 10000); // 10s timeout

      const listener = (changes: any, areaName: string) => {
        if (areaName !== "local") return;

        if (changes.wsCommandResult) {
          const result = changes.wsCommandResult.newValue;
          if (result && result.commandId === commandId) {
            clearTimeout(timeout);
            chrome.storage.onChanged.removeListener(listener);
            console.debug("[WSHelper] Command result received:", result);
            resolve(result.result);
          }
        }
      };

      // Đăng ký listener TRƯỚC
      chrome.storage.onChanged.addListener(listener);

      // Ghi command SAU khi listener đã sẵn sàng
      await chrome.storage.local.set({
        wsCommand: {
          ...command,
          commandId,
          timestamp: Date.now(),
        },
      });
    });
  }

  /**
   * Thêm connection mới
   */
  static async addConnection(
    port: number
  ): Promise<{ success: boolean; connectionId?: string; error?: string }> {
    return this.sendCommand({ action: "add", port });
  }

  /**
   * Xóa connection
   */
  static async removeConnection(
    connectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendCommand({ action: "remove", connectionId });
  }

  /**
   * Kết nối
   */
  static async connect(
    connectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendCommand({ action: "connect", connectionId });
  }

  /**
   * Ngắt kết nối
   */
  static async disconnect(
    connectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendCommand({ action: "disconnect", connectionId });
  }

  /**
   * Gửi message
   */
  static async sendMessage(
    connectionId: string,
    data: any
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendCommand({ action: "send", connectionId, data });
  }

  /**
   * Lấy tất cả connections
   */
  static async getAllConnections(): Promise<WSConnectionState[]> {
    const result = await this.sendCommand({ action: "getAll" });
    return result.connections || [];
  }

  /**
   * Subscribe to connection state changes
   */
  static subscribeToStates(
    callback: (states: Record<string, WSConnectionState>) => void
  ): () => void {
    const listener = (changes: any, areaName: string) => {
      if (areaName !== "local") return;

      if (changes.wsStates) {
        const states = changes.wsStates.newValue || {};
        callback(states);
      }
    };

    chrome.storage.onChanged.addListener(listener);

    // Load initial states
    chrome.storage.local.get(["wsStates"], (result) => {
      callback(result.wsStates || {});
    });

    // Return unsubscribe function
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }
}
