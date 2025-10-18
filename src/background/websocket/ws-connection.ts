// src/background/ws-connection.ts
export interface WSConnectionConfig {
  id: string;
  port: number;
  url: string;
}

export interface WSConnectionState {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
  reconnectAttempts: number;
}

export class WSConnection {
  private ws?: WebSocket;
  private reconnectTimer?: number;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  public state: WSConnectionState;

  constructor(config: WSConnectionConfig) {
    this.state = {
      id: config.id,
      port: config.port,
      url: config.url,
      status: "disconnected",
      reconnectAttempts: 0,
    };
  }

  public async connect(): Promise<void> {
    if (
      this.state.status === "connected" ||
      this.state.status === "connecting"
    ) {
      console.debug(
        "[WSConnection] Already connected/connecting:",
        this.state.id
      );
      return;
    }

    this.state.status = "connecting";
    this.notifyStateChange();

    try {
      this.ws = new WebSocket(this.state.url);

      this.ws.onopen = () => {
        console.log("[WSConnection] Connected:", this.state.url);
        this.state.status = "connected";
        this.state.lastConnected = Date.now();
        this.state.reconnectAttempts = 0;
        this.notifyStateChange();
      };

      this.ws.onerror = (error) => {
        console.error("[WSConnection] Error:", this.state.url, error);
        this.state.status = "error";
        this.notifyStateChange();
      };

      this.ws.onclose = () => {
        console.log("[WSConnection] Disconnected:", this.state.url);
        this.state.status = "disconnected";
        this.ws = undefined;
        this.notifyStateChange();

        // Auto reconnect
        if (this.state.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      console.error("[WSConnection] Connect failed:", error);
      this.state.status = "error";
      this.notifyStateChange();
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.state.status = "disconnected";
    this.notifyStateChange();
  }

  public send(data: any): void {
    if (this.ws && this.state.status === "connected") {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn(
        "[WSConnection] Cannot send - not connected:",
        this.state.id
      );
    }
  }

  private scheduleReconnect(): void {
    this.state.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      console.log("[WSConnection] Reconnecting:", this.state.url);
      this.connect();
    }, this.reconnectDelay) as any;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      console.debug("[WSConnection] Message received:", this.state.id, message);

      // Store message in chrome.storage for UI to read
      chrome.storage.local.get(["wsMessages"], (result) => {
        const messages = result.wsMessages || {};
        if (!messages[this.state.id]) {
          messages[this.state.id] = [];
        }
        messages[this.state.id].push({
          timestamp: Date.now(),
          data: message,
        });

        // Keep only last 100 messages per connection
        if (messages[this.state.id].length > 100) {
          messages[this.state.id] = messages[this.state.id].slice(-100);
        }

        chrome.storage.local.set({ wsMessages: messages });
      });
    } catch (error) {
      console.error("[WSConnection] Failed to parse message:", error);
    }
  }

  private notifyStateChange(): void {
    // Save state to chrome.storage
    chrome.storage.local.get(["wsStates"], (result) => {
      const states = result.wsStates || {};
      states[this.state.id] = { ...this.state };
      chrome.storage.local.set({ wsStates: states });
    });
  }

  public getState(): WSConnectionState {
    return { ...this.state };
  }
}
