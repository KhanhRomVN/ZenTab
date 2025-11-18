// src/background/websocket/ws-connection.ts
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

    // 🆕 Setup listener cho outgoing messages
    this.setupOutgoingListener();
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
      return;
    }

    // Reset manual disconnect flag khi user chủ động connect lại
    this.manualDisconnect = false;

    // Khởi tạo thời điểm bắt đầu retry nếu chưa có
    if (!this.retryStartTime) {
      this.retryStartTime = Date.now();
    }
    this.state.status = "connecting";
    this.notifyStateChange(); // Notify ngay lập tức

    return new Promise<void>((resolve) => {
      try {
        this.ws = new WebSocket(this.state.url);

        this.ws.onopen = () => {
          this.state.status = "connected";
          this.state.lastConnected = Date.now();
          this.state.reconnectAttempts = 0;
          this.retryStartTime = undefined;
          this.notifyStateChange();

          chrome.storage.local.set(
            {
              wsConnectionEstablished: Date.now(),
              triggerFocusedTabsBroadcast: Date.now(),
            },
            () => {}
          );

          resolve();
        };

        this.ws.onerror = (error) => {
          console.error(
            `[WSConnection] ❌ WebSocket ERROR for ${this.state.id}:`,
            error
          );
          this.state.status = "error";
          this.notifyStateChange();
        };

        this.ws.onclose = () => {
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
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay) as any;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // 🔧 FIX: ALWAYS ensure message has timestamp for tracking
      if (!message.timestamp) {
        message.timestamp = Date.now();
        console.warn(
          `[WSConnection] ⚠️ Message missing timestamp, added: ${message.timestamp}`
        );
      }

      if (message.type === "cleanupMessages") {
        chrome.storage.local.remove(
          ["wsMessages", "wsOutgoingMessage"],
          () => {}
        );

        chrome.storage.local.get(null, (allItems) => {
          const keysToRemove: string[] = [];
          for (const key in allItems) {
            if (key.startsWith("testResponse_") || key.includes("request")) {
              keysToRemove.push(key);
            }
          }
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {});
          }
        });

        return;
      }

      // THÊM case mới trong xử lý message
      if (message.type === "getAvailableTabs") {
        // CRITICAL FIX: Use storage to communicate with ServiceWorker
        const storagePayload = {
          wsIncomingRequest: {
            type: "getAvailableTabs",
            requestId: message.requestId,
            connectionId: this.state.id,
            timestamp: Date.now(),
          },
        };

        chrome.storage.local.set(storagePayload, () => {
          if (chrome.runtime.lastError) {
            console.error(
              `[WSConnection] ❌ Storage write error:`,
              chrome.runtime.lastError
            );
            return;
          }
        });

        return;
      }

      const messageTimestamp = message.timestamp || 0;
      if (messageTimestamp === 0) {
        console.warn(
          `[WSConnection] ⚠️ Message has no timestamp, accepting anyway:`,
          message.type
        );
      } else {
        const messageAge = Date.now() - messageTimestamp;
        // Timeout 180 seconds (3 minutes) để match với Backend REQUEST_TIMEOUT
        if (messageAge > 180000) {
          console.warn(
            `[WSConnection] ⚠️ Ignoring old message (${messageAge}ms old):`,
            message.type
          );
          return;
        }
      }

      // Store message in chrome.storage for UI to read
      chrome.storage.local.get(["wsMessages"], (result) => {
        const messages = result.wsMessages || {};
        if (!messages[this.state.id]) {
          messages[this.state.id] = [];
        }

        // 🆕 THÊM: Check for duplicate messages
        const isDuplicate = messages[this.state.id].some(
          (existing: any) => existing.data.requestId === message.requestId
        );

        if (isDuplicate) {
          console.warn(
            `[WSConnection] ⚠️ Ignoring duplicate message with requestId: ${message.requestId}`
          );
          return;
        }

        messages[this.state.id].push({
          timestamp: Date.now(),
          data: message,
        });

        // 🔧 INCREASED: Keep last 50 messages per connection (was 10)
        if (messages[this.state.id].length > 50) {
          messages[this.state.id] = messages[this.state.id].slice(-50);
        }

        chrome.storage.local.set({ wsMessages: messages });
      });
    } catch (error) {
      console.error("[WSConnection] Failed to parse message:", error);
    }
  }

  // 🆕 Setup listener for outgoing messages
  private setupOutgoingListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsOutgoingMessage) {
        const msg = changes.wsOutgoingMessage.newValue;

        if (msg && msg.connectionId === this.state.id) {
          this.send(msg.data);
        } else {
        }
      }
    });
  }

  private notifyStateChange(): void {
    // Save state to chrome.storage - sẽ trigger onChanged listener
    chrome.storage.local.get(["wsStates"], (result) => {
      const states = result.wsStates || {};
      states[this.state.id] = { ...this.state };
      chrome.storage.local.set({ wsStates: states }, () => {});
    });
  }

  public getState(): WSConnectionState {
    return { ...this.state };
  }
}
