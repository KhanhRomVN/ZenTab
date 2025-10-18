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
  private reconnectDelay = 2000; // 2s mỗi lần retry
  private retryStartTime?: number; // Thời điểm bắt đầu retry
  private readonly MAX_RETRY_DURATION = 10000; // 10s tối đa
  private manualDisconnect = false; // Flag để track ngắt kết nối thủ công

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

  public disconnect(): void {
    // Đánh dấu đây là manual disconnect
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.state.status = "disconnected";
    this.retryStartTime = undefined;
    this.notifyStateChange();
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

    // Reset manual disconnect flag khi user chủ động connect lại
    this.manualDisconnect = false;

    // Khởi tạo thời điểm bắt đầu retry nếu chưa có
    if (!this.retryStartTime) {
      this.retryStartTime = Date.now();
    }

    console.debug(
      "[WSConnection] Setting status to connecting:",
      this.state.id
    );
    this.state.status = "connecting";
    this.notifyStateChange(); // Notify ngay lập tức

    return new Promise<void>((resolve) => {
      try {
        this.ws = new WebSocket(this.state.url);

        this.ws.onopen = () => {
          console.log("[WSConnection] Connected:", this.state.url);
          this.state.status = "connected";
          this.state.lastConnected = Date.now();
          this.state.reconnectAttempts = 0;
          this.retryStartTime = undefined;
          this.notifyStateChange();
          resolve(); // Resolve khi kết nối thành công
        };

        this.ws.onerror = (error) => {
          console.error("[WSConnection] Error:", this.state.url, error);
          this.state.status = "error";
          this.notifyStateChange();
          // KHÔNG reject, vì onerror sẽ trigger onclose
        };

        this.ws.onclose = () => {
          console.log("[WSConnection] Disconnected:", this.state.url);
          this.state.status = "disconnected";
          this.ws = undefined;
          this.notifyStateChange();

          // CHỈ auto reconnect nếu KHÔNG phải manual disconnect
          if (!this.manualDisconnect) {
            // Auto reconnect chỉ trong vòng 10s
            const elapsedTime = this.retryStartTime
              ? Date.now() - this.retryStartTime
              : 0;

            if (
              elapsedTime < this.MAX_RETRY_DURATION &&
              this.state.reconnectAttempts < this.maxReconnectAttempts
            ) {
              this.scheduleReconnect();
            } else {
              // Quá 10s hoặc hết số lần retry, dừng hoàn toàn
              this.state.status = "error";
              this.retryStartTime = undefined;
              this.notifyStateChange();
              console.warn("[WSConnection] Stopped retrying:", this.state.url);
            }
          } else {
            console.debug(
              "[WSConnection] Manual disconnect, no auto-reconnect"
            );
          }

          resolve(); // Resolve ngay cả khi disconnect
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error("[WSConnection] Connect failed:", error);
        this.state.status = "error";
        this.notifyStateChange();
        resolve(); // Resolve ngay cả khi có exception
      }
    });
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
    console.debug(
      "[WSConnection] Scheduling reconnect attempt:",
      this.state.reconnectAttempts,
      this.state.id
    );

    this.reconnectTimer = setTimeout(() => {
      console.log(
        "[WSConnection] Reconnecting (attempt",
        this.state.reconnectAttempts,
        "):",
        this.state.url
      );
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
    // Save state to chrome.storage - sẽ trigger onChanged listener
    chrome.storage.local.get(["wsStates"], (result) => {
      const states = result.wsStates || {};
      states[this.state.id] = { ...this.state };
      chrome.storage.local.set({ wsStates: states }, () => {
        console.debug(
          "[WSConnection] State change notified:",
          this.state.id,
          this.state.status
        );
      });
    });
  }

  public getState(): WSConnectionState {
    return { ...this.state };
  }
}
