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
  private forwardedRequests: Set<string> = new Set(); // 🆕 In-memory duplicate tracking

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

    // 🔧 CRITICAL FIX: Setup listener cho wsOutgoingMessage từ Extension
    this.setupBackendOutgoingListener();
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

  private async handleMessage(data: string): Promise<void> {
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

        // 🆕 THÊM: Cleanup forwarded requests tracking
        chrome.storage.local.get(null, (allItems) => {
          const keysToRemove: string[] = [];
          for (const key in allItems) {
            if (
              key.startsWith("testResponse_") ||
              key.includes("request") ||
              key.startsWith("forwarded_") ||
              key.startsWith("processed_")
            ) {
              keysToRemove.push(key);
            }
          }
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove, () => {});
            console.log(
              `[WSConnection] 🧹 Cleaned up ${keysToRemove.length} tracking keys`
            );
          }
        });

        // 🆕 THÊM: Clear in-memory tracking
        this.forwardedRequests.clear();
        console.log(`[WSConnection] 🧹 Cleared in-memory forwarded requests`);

        return;
      }

      // Handle getAvailableTabs request
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

      // Trong method handleMessage - phần promptResponse
      if (message.type === "promptResponse") {
        const requestId = message.requestId;
        const timestamp = message.timestamp || Date.now();
        const messageAge = Date.now() - timestamp;
        const messageKey = `${timestamp}_${requestId}`;

        console.log(`\n[WSConnection] 📥 ===== PROMPT RESPONSE RECEIVED =====`);
        console.log(`[WSConnection] Request ID: ${requestId}`);
        console.log(`[WSConnection] Tab ID: ${message.tabId}`);
        console.log(`[WSConnection] Success: ${message.success}`);
        console.log(`[WSConnection] Response type: ${typeof message.response}`);
        console.log(
          `[WSConnection] Response length: ${message.response?.length || 0}`
        );
        console.log(`[WSConnection] Timestamp: ${timestamp}`);
        console.log(`[WSConnection] Message age: ${messageAge}ms`);
        console.log(`[WSConnection] Message key: ${messageKey}`);
        console.log(`[WSConnection] Connection ID: ${this.state.id}`);
        console.log(
          `[WSConnection] In-memory forwarded size: ${this.forwardedRequests.size}`
        );
        console.log(`[WSConnection] Current time: ${Date.now()}`);

        // 🆕 THÊM: Log response content preview
        if (message.response) {
          if (typeof message.response === "string") {
            console.log(
              `[WSConnection] 📝 Response preview (first 500 chars):`
            );
            console.log(message.response.substring(0, 500));

            // 🆕 THÊM: Check if response is valid JSON
            try {
              const parsed = JSON.parse(message.response);
              console.log(`[WSConnection] ✅ Response is valid JSON`);
              console.log(
                `[WSConnection] 📊 Parsed keys:`,
                Object.keys(parsed)
              );
            } catch (jsonError) {
              console.warn(
                `[WSConnection] ⚠️ Response is NOT valid JSON:`,
                jsonError instanceof Error
                  ? jsonError.message
                  : String(jsonError)
              );
            }
          } else if (typeof message.response === "object") {
            console.log(
              `[WSConnection] 📊 Response is object with keys:`,
              Object.keys(message.response)
            );
          }
        }

        // 🆕 CRITICAL FIX V4: Enhanced duplicate detection với storage backup
        console.log(
          `\n[WSConnection] 🔬 ===== DUPLICATE DETECTION START =====`
        );
        console.log(`[WSConnection] Request ID: ${requestId}`);
        console.log(`[WSConnection] Message key: ${messageKey}`);
        console.log(
          `[WSConnection] Timestamp: ${timestamp} (${new Date(
            timestamp
          ).toISOString()})`
        );
        console.log(`[WSConnection] Message age: ${messageAge}ms`);
        console.log(
          `[WSConnection] Current time: ${Date.now()} (${new Date().toISOString()})`
        );
        console.log(
          `[WSConnection] In-memory forwarded set size: ${this.forwardedRequests.size}`
        );
        console.log(
          `[WSConnection] In-memory forwarded set contents:`,
          Array.from(this.forwardedRequests)
        );
        console.log(
          `[WSConnection] Checking in-memory: has(${requestId}) = ${this.forwardedRequests.has(
            requestId
          )}`
        );

        if (this.forwardedRequests.has(requestId)) {
          console.warn(
            `\n[WSConnection] 🚫 ===== IN-MEMORY DUPLICATE DETECTED =====`
          );
          console.warn(`[WSConnection] Request ID: ${requestId}`);
          console.warn(`[WSConnection] Connection ID: ${this.state.id}`);
          console.warn(
            `[WSConnection] In-memory set size: ${this.forwardedRequests.size}`
          );
          console.warn(`[WSConnection] Message key: ${messageKey}`);
          console.warn(`[WSConnection] Message age: ${messageAge}ms`);
          console.warn(
            `[WSConnection] This is a DUPLICATE - BLOCKING forward to Backend`
          );
          console.warn(
            `[WSConnection] ===== DUPLICATE DETECTION END (BLOCKED) =====\n`
          );
          console.log(
            `[WSConnection] ===== PROMPT RESPONSE END (DUPLICATE) =====\n`
          );
          return;
        }

        console.log(
          `[WSConnection] ✅ Passed in-memory check - NOT a duplicate yet`
        );

        // 🆕 THÊM: Kiểm tra trong storage để phòng trường hợp service worker reload
        console.log(`[WSConnection] 🔍 Checking storage for duplicates...`);
        try {
          const storageKey = `forwarded_${requestId}`;
          console.log(`[WSConnection]   - Storage key: ${storageKey}`);

          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get([storageKey], (data) => {
              console.log(`[WSConnection]   - Storage get result:`, data);
              resolve(data || {});
            });
          });

          if (result[storageKey]) {
            const storageTimestamp = result[storageKey];
            const storageAge = Date.now() - storageTimestamp;

            console.warn(
              `\n[WSConnection] 🚫 ===== STORAGE DUPLICATE DETECTED =====`
            );
            console.warn(`[WSConnection] Request ID: ${requestId}`);
            console.warn(`[WSConnection] Storage key: ${storageKey}`);
            console.warn(
              `[WSConnection] Storage timestamp: ${storageTimestamp} (${new Date(
                storageTimestamp
              ).toISOString()})`
            );
            console.warn(`[WSConnection] Storage age: ${storageAge}ms`);
            console.warn(
              `[WSConnection] This is a DUPLICATE - BLOCKING forward to Backend`
            );
            console.warn(
              `[WSConnection] ===== DUPLICATE DETECTION END (STORAGE BLOCKED) =====\n`
            );
            return;
          }

          console.log(
            `[WSConnection] ✅ Passed storage check - NOT in storage yet`
          );
        } catch (storageError) {
          console.error(
            `[WSConnection] ❌ EXCEPTION in storage check:`,
            storageError
          );
          console.error(
            `[WSConnection]   - Error type:`,
            storageError instanceof Error
              ? storageError.constructor.name
              : typeof storageError
          );
          console.error(
            `[WSConnection]   - Error message:`,
            storageError instanceof Error
              ? storageError.message
              : String(storageError)
          );
          console.warn(
            `[WSConnection] ⚠️ Continuing despite storage error (fail-open)`
          );
        }

        console.log(
          `[WSConnection] ===== DUPLICATE DETECTION END (PASSED ALL CHECKS) =====\n`
        );

        // Mark in-memory IMMEDIATELY (before any async operations)
        console.log(
          `\n[WSConnection] 📝 ===== MARKING AS PROCESSED START =====`
        );
        console.log(`[WSConnection] Request ID: ${requestId}`);
        console.log(`[WSConnection] Message key: ${messageKey}`);
        console.log(
          `[WSConnection] Before add - in-memory size: ${this.forwardedRequests.size}`
        );
        console.log(
          `[WSConnection] Before add - in-memory contents:`,
          Array.from(this.forwardedRequests)
        );

        this.forwardedRequests.add(requestId);

        console.log(
          `[WSConnection] After add - in-memory size: ${this.forwardedRequests.size}`
        );
        console.log(
          `[WSConnection] After add - in-memory contents:`,
          Array.from(this.forwardedRequests)
        );
        console.log(
          `[WSConnection] ✅ Marked in-memory as forwarded: ${requestId}`
        );

        // 🆕 THÊM: Mark trong storage ngay lập tức
        console.log(`[WSConnection] 🔧 Attempting to mark in storage...`);
        try {
          const storageKey = `forwarded_${requestId}`;
          const currentTimestamp = Date.now();

          console.log(`[WSConnection]   - Storage key: ${storageKey}`);
          console.log(
            `[WSConnection]   - Timestamp: ${currentTimestamp} (${new Date(
              currentTimestamp
            ).toISOString()})`
          );

          await new Promise<void>((resolve) => {
            chrome.storage.local.set({ [storageKey]: currentTimestamp }, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  `[WSConnection] ❌ Storage set error:`,
                  chrome.runtime.lastError
                );
              }
              resolve();
            });
          });

          console.log(
            `[WSConnection] ✅ Marked in storage as forwarded: ${requestId}`
          );
          console.log(`[WSConnection]   - Storage key: ${storageKey}`);
          console.log(`[WSConnection]   - Timestamp: ${currentTimestamp}`);
        } catch (storageError) {
          console.error(
            `[WSConnection] ❌ EXCEPTION marking in storage:`,
            storageError
          );
          console.error(
            `[WSConnection]   - Error type:`,
            storageError instanceof Error
              ? storageError.constructor.name
              : typeof storageError
          );
          console.error(
            `[WSConnection]   - Error message:`,
            storageError instanceof Error
              ? storageError.message
              : String(storageError)
          );
        }

        console.log(`[WSConnection] ===== MARKING AS PROCESSED END =====\n`);

        // Cleanup in-memory sau 60s
        setTimeout(() => {
          this.forwardedRequests.delete(message.requestId);
          console.log(
            `[WSConnection] 🧹 Cleaned up in-memory marker: ${message.requestId}`
          );
        }, 60000);

        // Forward response to Backend IMMEDIATELY
        console.log(
          `\n[WSConnection] 📤 ===== FORWARDING TO BACKEND START =====`
        );
        const currentTimestamp = Date.now();
        const forwardPayload = {
          wsOutgoingMessage: {
            connectionId: this.state.id,
            data: message,
            timestamp: currentTimestamp,
          },
        };

        console.log(`[WSConnection] Request ID: ${message.requestId}`);
        console.log(`[WSConnection] Message key: ${messageKey}`);
        console.log(`[WSConnection] Connection ID: ${this.state.id}`);
        console.log(
          `[WSConnection] Forward timestamp: ${currentTimestamp} (${new Date(
            currentTimestamp
          ).toISOString()})`
        );
        console.log(
          `[WSConnection] Original timestamp: ${timestamp} (${new Date(
            timestamp
          ).toISOString()})`
        );
        console.log(
          `[WSConnection] Time diff: ${currentTimestamp - timestamp}ms`
        );
        console.log(
          `[WSConnection] Payload size: ${
            JSON.stringify(forwardPayload).length
          } bytes`
        );
        console.log(`[WSConnection] 🔧 Calling chrome.storage.local.set...`);

        chrome.storage.local.set(forwardPayload, () => {
          if (chrome.runtime.lastError) {
            console.error(`\n[WSConnection] ❌ ===== FORWARD FAILED =====`);
            console.error(`[WSConnection] Request ID: ${message.requestId}`);
            console.error(`[WSConnection] Error:`, chrome.runtime.lastError);
            console.error(`[WSConnection] ===== FORWARD FAILED END =====\n`);

            // Cleanup in-memory on error
            console.log(
              `[WSConnection] 🧹 Cleaning up in-memory marker due to error`
            );
            this.forwardedRequests.delete(message.requestId);
            console.log(
              `[WSConnection] After cleanup - in-memory size: ${this.forwardedRequests.size}`
            );
            return;
          }

          console.log(`\n[WSConnection] ✅ ===== FORWARD SUCCESS =====`);
          console.log(`[WSConnection] Request ID: ${message.requestId}`);
          console.log(`[WSConnection] Message key: ${messageKey}`);
          console.log(`[WSConnection] Connection ID: ${this.state.id}`);
          console.log(`[WSConnection] Forward timestamp: ${currentTimestamp}`);
          console.log(
            `[WSConnection] In-memory size after forward: ${this.forwardedRequests.size}`
          );
          console.log(`[WSConnection] ===== FORWARD SUCCESS END =====\n`);

          // Persist to storage for backup (non-blocking)
          const storageKey = `forwarded_${message.requestId}`;
          chrome.storage.local.set(
            {
              [storageKey]: currentTimestamp,
            },
            () => {
              // Cleanup storage sau 60s
              setTimeout(() => {
                chrome.storage.local.remove([storageKey]);
              }, 60000);
            }
          );
        });

        // 🔧 CRITICAL FIX: KHÔNG lưu promptResponse vào wsMessages
        // để tránh Backend xử lý trùng lặp từ storage listener
        console.log(
          `[WSConnection] ⚠️ Skipping wsMessages storage for promptResponse to prevent duplicates`
        );
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
        // 🔧 REDUCED: 60 seconds (1 minute) - aggressive cleanup
        if (messageAge > 60000) {
          console.warn(
            `[WSConnection] ⚠️ Ignoring old message (${(
              messageAge / 1000
            ).toFixed(1)}s old):`,
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

        // 🔧 CRITICAL FIX: Sanitize message data - response đã là JSON string từ Extension
        let sanitizedMessage = message;
        if (message.type === "promptResponse" && message.response) {
          // Validate response is valid JSON string
          try {
            JSON.parse(message.response);
            // Response đã là valid JSON string, giữ nguyên
            sanitizedMessage = {
              ...message,
              response: message.response, // Giữ nguyên JSON string
            };
            console.log(
              `[WSConnection] ✅ Response is valid JSON string, keeping as-is`
            );
          } catch (parseError) {
            // Response không phải JSON string hợp lệ, stringify lại
            console.warn(
              `[WSConnection] ⚠️ Response is not valid JSON, stringifying:`,
              parseError
            );
            sanitizedMessage = {
              ...message,
              response: JSON.stringify(message.response),
            };
          }
        }

        messages[this.state.id].push({
          timestamp: Date.now(),
          data: sanitizedMessage,
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

  // 🆕 CRITICAL FIX: Listen for messages từ Backend cần gửi lên WebSocket
  private setupBackendOutgoingListener(): void {
    const processedMessages = new Set<string>(); // Track processed messages

    console.log(
      `[WSConnection] 🎧 Setting up Backend outgoing listener for connection: ${this.state.id}`
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      // Backend gửi message cần forward lên WebSocket server
      if (changes.wsOutgoingMessage) {
        const outgoingMsg = changes.wsOutgoingMessage.newValue;

        if (!outgoingMsg) {
          console.log(
            `[WSConnection] ⚠️ Received null/undefined wsOutgoingMessage`
          );
          return;
        }

        // CHỈ xử lý message dành cho connection này
        if (outgoingMsg.connectionId !== this.state.id) {
          console.log(
            `[WSConnection] ⏭️ Skipping message for different connection:`,
            {
              messageConnectionId: outgoingMsg.connectionId,
              thisConnectionId: this.state.id,
              messageType: outgoingMsg.data?.type,
            }
          );
          return;
        }

        console.log(
          `[WSConnection] 📥 Received wsOutgoingMessage for this connection:`,
          {
            type: outgoingMsg.data?.type,
            requestId: outgoingMsg.data?.requestId,
            connectionId: outgoingMsg.connectionId,
            timestamp: outgoingMsg.timestamp,
          }
        );

        // 🆕 CRITICAL: Duplicate detection với timestamp + requestId
        const messageKey = `${outgoingMsg.timestamp}_${
          outgoingMsg.data?.requestId || "unknown"
        }`;

        if (processedMessages.has(messageKey)) {
          console.warn(
            `[WSConnection] 🚫 DUPLICATE BLOCKED - Message already forwarded to WebSocket:`,
            {
              requestId: outgoingMsg.data?.requestId,
              timestamp: outgoingMsg.timestamp,
              type: outgoingMsg.data?.type,
              messageKey,
              connectionId: this.state.id,
            }
          );
          return;
        }

        console.log(
          `[WSConnection] ✅ Message is NEW, proceeding with WebSocket send:`,
          {
            requestId: outgoingMsg.data?.requestId,
            messageKey,
            connectionId: this.state.id,
          }
        );

        // Mark as processed
        processedMessages.add(messageKey);
        console.log(`[WSConnection] 📝 Marked message as processed:`, {
          messageKey,
          totalProcessed: processedMessages.size,
          connectionId: this.state.id,
        });

        console.log(
          `[WSConnection] 📤 Forwarding message to WebSocket server:`,
          {
            type: outgoingMsg.data?.type,
            requestId: outgoingMsg.data?.requestId,
            connectionId: outgoingMsg.connectionId,
            timestamp: outgoingMsg.timestamp,
          }
        );

        // Gửi message lên WebSocket server
        this.send(outgoingMsg.data);

        console.log(
          `[WSConnection] ✅ Message forwarded successfully to Backend via WebSocket:`,
          {
            requestId: outgoingMsg.data?.requestId,
            connectionId: this.state.id,
          }
        );

        // 🆕 Cleanup old processed messages (older than 5 minutes)
        setTimeout(() => {
          processedMessages.delete(messageKey);
          console.log(
            `[WSConnection] 🧹 Cleaned up processed message marker:`,
            {
              messageKey,
              remainingProcessed: processedMessages.size,
              connectionId: this.state.id,
            }
          );
        }, 300000);
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
