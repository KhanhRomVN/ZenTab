// src/background/ws-manager-new.ts
import { WSConnection } from "./ws-connection";

export class WSManagerNew {
  private connection: WSConnection | null = null;

  constructor() {
    this.cleanupOldConnections();
    this.setupStorageListener();
    this.setupStateQueryHandler();
  }

  private setupStateQueryHandler(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "getWSConnectionInfo") {
        if (this.connection) {
          const state = this.connection.getState();
          sendResponse({
            success: true,
            state: state,
          });
        } else {
          sendResponse({
            success: false,
            error: "No WebSocket connection available",
          });
        }
        return true;
      }
    });
  }

  private cleanupOldConnections(): void {
    chrome.storage.local.remove([
      "wsMessages",
      "wsOutgoingMessage",
      "wsIncomingRequest",
    ]);
  }

  private isValidApiProvider(apiProvider: string): boolean {
    // 🔥 FIX: Chấp nhận empty string (user chưa config) - không cần validate
    if (!apiProvider || apiProvider.trim() === "") {
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

    console.log(`[WSManager] 🔍 Parsing API Provider: "${apiProvider}"`);

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `http://${url}`;
      console.log(`[WSManager] 🔧 Added http:// prefix: ${url}`);
    }

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (error) {
      console.error(`[WSManager] ❌ Failed to parse URL: ${url}`);
      console.error(`[WSManager] 🔍 Error:`, error);
      throw new Error(`Invalid API Provider URL: ${apiProvider}`);
    }

    const isHttps = urlObj.protocol === "https:";
    const protocol = isHttps ? "wss" : "ws";

    let host = urlObj.hostname;
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
   * Broadcast message to single connected WebSocket client (port 1500)
   */
  public broadcastToAll(message: any): void {
    if (this.connection && this.connection.state.status === "connected") {
      try {
        this.connection.send(message);
      } catch (error) {
        console.error("[WSManager] ❌ Failed to broadcast message:", error);
      }
    }
  }

  /**
   * Kiểm tra WebSocket connection (port 1500) có đang connected không
   */
  public async hasActiveConnections(): Promise<boolean> {
    return (
      this.connection !== null && this.connection.state.status === "connected"
    );
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.apiProvider) {
        const newApiProvider = changes.apiProvider.newValue;
        const oldApiProvider = changes.apiProvider.oldValue;

        // 🔥 FIX: Disconnect khi API Provider thay đổi (bất kể giá trị mới là gì)
        if (newApiProvider !== oldApiProvider) {
          console.log(
            `[WSManager] 🔄 API Provider changed: "${
              oldApiProvider || "(empty)"
            }" → "${newApiProvider || "(empty)"}"`
          );

          if (this.connection) {
            console.log(`[WSManager] 🔌 Disconnecting old connection...`);
            this.connection.disconnect();
            this.connection = null;
          }
        }
      }
    });
  }

  public async connect(): Promise<{ success: boolean; error?: string }> {
    if (this.connection && this.connection.state.status === "connected") {
      console.log(`[WSManager] ✅ Already connected - returning success`);
      return { success: true };
    }

    if (this.connection && this.connection.state.status === "connecting") {
      console.warn(`[WSManager] ⚠️ Connection already in progress`);
      return { success: false, error: "Already connecting" };
    }

    try {
      // 🔥 CRITICAL: Đọc API Provider từ storage (single source of truth)
      const storageResult = await new Promise<any>((resolve) => {
        chrome.storage.local.get(["apiProvider"], (data: any) => {
          resolve(data || {});
        });
      });

      const apiProvider = storageResult?.apiProvider;
      console.log(
        `[WSManager] 📊 Read API Provider from storage: "${
          apiProvider || "(empty)"
        }"`
      );

      // 🔥 FIX: Nếu chưa có API Provider, KHÔNG connect và throw error
      if (!apiProvider || !this.isValidApiProvider(apiProvider)) {
        const errorMsg =
          "API Provider not configured. Please set it in Settings.";
        console.error(`[WSManager] ❌ ${errorMsg}`);

        return {
          success: false,
          error: errorMsg,
        };
      }

      const { port, wsUrl } = this.parseApiProvider(apiProvider);

      console.log(`[WSManager] 🔌 Parsed connection details:`);
      console.log(`[WSManager]   • API Provider: ${apiProvider}`);
      console.log(`[WSManager]   • WebSocket URL: ${wsUrl}`);
      console.log(`[WSManager]   • Port: ${port}`);

      const connectionId = `ws-${Date.now()}-${port}`;

      this.connection = new WSConnection({
        id: connectionId,
        port: port,
        url: wsUrl,
      });

      await this.connection.connect();

      console.log(`[WSManager] ✅ Connection established successfully`);
      return { success: true };
    } catch (error) {
      console.error(`[WSManager] ❌ Connection failed:`, error);
      this.connection = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public disconnect(): { success: boolean } {
    if (!this.connection) {
      return { success: true };
    }

    try {
      this.connection.disconnect();
      this.connection = null;
      return { success: true };
    } catch (error) {
      console.error(`[WSManager] ❌ Disconnect failed:`, error);
      return { success: false };
    }
  }

  public sendResponse(data: any): boolean {
    if (this.connection && this.connection.state.status === "connected") {
      this.connection.send(data);
      return true;
    }
    return false;
  }
}
