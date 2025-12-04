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
}

export class WSConnection {
  private ws?: WebSocket;
  private forwardedRequests: Set<string> = new Set();
  private lastPingTime: number = 0;
  private readonly PING_TIMEOUT = 90000; // 90 seconds (45s backend ping + 45s buffer)

  public state: WSConnectionState;

  constructor(config: WSConnectionConfig) {
    console.log(`[WSConnection] 🆕 NEW CONNECTION CREATED:`, {
      id: config.id,
      url: config.url,
      port: config.port,
      timestamp: new Date().toISOString(),
    });

    this.state = {
      id: config.id,
      port: config.port,
      url: config.url,
      status: "disconnected",
    };

    this.notifyStateChange();

    // CRITICAL: Setup storage listener để forward wsOutgoingMessage qua WebSocket
    this.setupOutgoingMessageListener();
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.state.status = "disconnected";

    this.notifyStateChange();
  }

  public async connect(): Promise<void> {
    console.log(`[WSConnection] 🚀 ATTEMPTING CONNECT to: ${this.state.url}`);

    if (
      this.state.status === "connected" ||
      this.state.status === "connecting"
    ) {
      console.log(`[WSConnection] ⚠️ Already ${this.state.status}, skipping`);
      return;
    }

    this.state.status = "connecting";
    this.notifyStateChange();

    return new Promise<void>((resolve) => {
      try {
        this.ws = new WebSocket(this.state.url);
        this.ws.onopen = () => {
          this.state.status = "connected";
          this.state.lastConnected = Date.now();
          this.lastPingTime = Date.now(); // Initialize ping time

          console.log(
            `[WSConnection] ✅ WebSocket CONNECTED: ${this.state.id}`
          );
          console.log(`[WSConnection] 📊 Connection details:`, {
            id: this.state.id,
            url: this.state.url,
            port: this.state.port,
            timestamp: new Date().toISOString(),
          });

          this.notifyStateChange();

          // Start health monitoring
          this.startHealthMonitor();

          resolve();
        };

        this.ws.onerror = (error) => {
          console.error(
            `[WSConnection] ❌ WebSocket ERROR for ${this.state.url}:`,
            {
              errorType: error.type,
              readyState: this.ws?.readyState,
              connectionId: this.state.id,
              currentStatus: this.state.status,
            }
          );

          const wasAttemptingConnection =
            this.state.status === "connected" ||
            this.state.status === "connecting";

          if (wasAttemptingConnection) {
            // 🆕 Gửi disconnect signal ngay cả khi có error
            console.log(
              `[WSConnection] 🔴 SENDING DISCONNECT SIGNAL (onerror)`
            );
            this.sendDisconnectSignal();
          }

          this.state.status = "error";
          this.notifyStateChange();
        };

        this.ws.onclose = () => {
          // 🆕 FIX: Gửi disconnect signal cho MỌI trạng thái (kể cả "connecting")
          const wasAttemptingConnection =
            this.state.status === "connected" ||
            this.state.status === "connecting";

          if (wasAttemptingConnection) {
            console.log(
              `[WSConnection] 🔴 SENDING DISCONNECT SIGNAL (onclose, status: ${this.state.status})`
            );

            this.state.status = "disconnected";
            this.notifyStateChange();

            // 🆕 Gửi EMPTY focusedTabsUpdate để notify Zen về disconnect
            try {
              chrome.storage.local.set({
                wsOutgoingMessage: {
                  connectionId: this.state.id,
                  data: {
                    type: "focusedTabsUpdate",
                    data: [], // 🆕 EMPTY array = disconnect signal
                    timestamp: Date.now(),
                  },
                  timestamp: Date.now(),
                },
              });

              // Cleanup sau 500ms
              setTimeout(() => {
                chrome.storage.local.remove(["wsOutgoingMessage"], () => {
                  console.log(
                    `[WSConnection] 🧹 Cleaned up disconnect message`
                  );
                });
              }, 500);
            } catch (error) {
              console.error(
                `[WSConnection] ❌ Failed to send disconnect signal:`,
                error
              );
            }
          } else {
            // Nếu đã disconnected rồi, vẫn update state
            this.state.status = "disconnected";
            this.notifyStateChange();
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error(`[WSConnection] ❌ Exception during WebSocket creation`);
        console.error(`[WSConnection] 🔍 Exception details:`, {
          error: error,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          connectionId: this.state.id,
          url: this.state.url,
        });
        console.error(`[WSConnection] 💡 This usually means:`);
        console.error(`  - Invalid WebSocket URL format`);
        console.error(`  - Browser blocking WebSocket protocol`);
        console.error(`  - Extension permission issues`);

        this.state.status = "error";
        this.notifyStateChange();
        resolve();
      }
    });
  }

  public send(data: any): void {
    if (this.ws && this.state.status === "connected") {
      try {
        const messageStr = JSON.stringify(data);
        console.log(
          `[WSConnection] 📤 Sending message: type=${data.type}, size=${messageStr.length} bytes`
        );
        this.ws.send(messageStr);
      } catch (error) {
        console.error(`[WSConnection] ❌ Failed to send message:`, error);
        console.error(`[WSConnection] 🔍 Data type: ${typeof data}`);
        console.error(`[WSConnection] 🔍 Data:`, data);
      }
    } else {
      console.warn(`[WSConnection] ⚠️ Cannot send - WebSocket not ready`);
      console.warn(`[WSConnection] 🔍 WebSocket exists: ${!!this.ws}`);
      console.warn(`[WSConnection] 🔍 Connection status: ${this.state.status}`);
    }
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data);

      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      // CRITICAL: Handle ping messages - reply with pong
      if (message.type === "ping") {
        try {
          if (this.ws && this.state.status === "connected") {
            // 🆕 CRITICAL FIX: Update lastPingTime khi nhận ping
            this.lastPingTime = Date.now();

            const pongMessage = {
              type: "pong",
              timestamp: Date.now(),
            };
            this.ws.send(JSON.stringify(pongMessage));
          }
        } catch (pongError) {
          console.error(`[WSConnection] ❌ Failed to send pong:`, pongError);
        }
        return; // Don't process ping further
      }

      if (message.type === "cleanupMessages") {
        chrome.storage.local.remove(
          ["wsMessages", "wsOutgoingMessage"],
          () => {}
        );

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
          }
        });

        this.forwardedRequests.clear();

        return;
      }

      if (message.type === "cleanupFolderLink") {
        const folderPath = message.folderPath;

        if (!folderPath) {
          return;
        }

        const dedupeKey = `cleanup_${folderPath}_${Date.now()}`;

        try {
          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get([dedupeKey], (data) => {
              resolve(data || {});
            });
          });

          if (result[dedupeKey]) {
            return;
          }
        } catch (storageError) {
          console.error(
            "[WSConnection] ❌ Cleanup dedupe check failed:",
            storageError
          );
        }

        chrome.storage.local.set({ [dedupeKey]: Date.now() });

        setTimeout(() => {
          chrome.storage.local.remove([dedupeKey]);
        }, 5000);

        const storagePayload = {
          wsIncomingRequest: {
            type: "cleanupFolderLink",
            folderPath: folderPath,
            connectionId: this.state.id,
            timestamp: Date.now(),
          },
        };

        chrome.storage.local.set(storagePayload, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[WSConnection] ❌ Failed to set cleanupFolderLink:",
              chrome.runtime.lastError
            );
            return;
          }
        });

        return;
      }

      if (message.type === "getTabsByFolder") {
        const requestId = message.requestId;
        const folderPath = message.folderPath;

        if (!folderPath) {
          return;
        }

        const dedupeKey = `folder_req_${requestId}`;

        try {
          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get([dedupeKey], (data) => {
              resolve(data || {});
            });
          });

          if (result[dedupeKey]) {
            return;
          }
        } catch (storageError) {
          console.error(
            "[WSConnection] ❌ Folder request dedupe check failed:",
            storageError
          );
        }

        chrome.storage.local.set({ [dedupeKey]: Date.now() });

        setTimeout(() => {
          chrome.storage.local.remove([dedupeKey]);
        }, 5000);

        const storagePayload = {
          wsIncomingRequest: {
            type: "getTabsByFolder",
            requestId: message.requestId,
            folderPath: folderPath,
            connectionId: this.state.id,
            timestamp: Date.now(),
          },
        };

        chrome.storage.local.set(storagePayload, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "[WSConnection] ❌ Failed to set getAvailableTabs:",
              chrome.runtime.lastError
            );
            return;
          }
        });

        return;
      }

      if (message.type === "getAvailableTabs") {
        const requestId = message.requestId;
        const dedupeKey = `tabs_req_${requestId}`;

        try {
          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get([dedupeKey], (data) => {
              resolve(data || {});
            });
          });

          if (result[dedupeKey]) {
            return;
          }
        } catch (storageError) {}

        chrome.storage.local.set({ [dedupeKey]: Date.now() });

        setTimeout(() => {
          chrome.storage.local.remove([dedupeKey]);
        }, 5000);

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
              "[WSConnection] ❌ Failed to set getAvailableTabs:",
              chrome.runtime.lastError
            );
            return;
          }
        });

        return;
      }

      if (message.type === "promptResponse") {
        const requestId = message.requestId;

        if (this.forwardedRequests.has(requestId)) {
          return;
        }

        try {
          const storageKey = `forwarded_${requestId}`;
          const result = await new Promise<any>((resolve) => {
            chrome.storage.local.get([storageKey], (data) => {
              resolve(data || {});
            });
          });

          if (result[storageKey]) {
            return;
          }
        } catch (storageError) {}

        this.forwardedRequests.add(requestId);

        try {
          const storageKey = `forwarded_${requestId}`;
          const currentTimestamp = Date.now();

          await new Promise<void>((resolve) => {
            chrome.storage.local.set({ [storageKey]: currentTimestamp }, () => {
              resolve();
            });
          });
        } catch (storageError) {}

        setTimeout(() => {
          this.forwardedRequests.delete(message.requestId);
        }, 60000);

        // Gửi trực tiếp qua WebSocket thay vì lưu storage
        this.send(message);

        const storageKey = `forwarded_${message.requestId}`;
        chrome.storage.local.set(
          {
            [storageKey]: Date.now(),
          },
          () => {
            setTimeout(() => {
              chrome.storage.local.remove([storageKey]);
            }, 60000);
          }
        );

        return;
      }

      const messageTimestamp = message.timestamp || 0;
      if (messageTimestamp === 0) {
      } else {
        const messageAge = Date.now() - messageTimestamp;
        if (messageAge > 60000) {
          return;
        }
      }

      chrome.storage.local.get(["wsMessages"], (result) => {
        const messages = result.wsMessages || {};
        if (!messages[this.state.id]) {
          messages[this.state.id] = [];
        }

        const isDuplicate = messages[this.state.id].some(
          (existing: any) => existing.data.requestId === message.requestId
        );

        if (isDuplicate) {
          return;
        }

        let sanitizedMessage = message;
        if (message.type === "promptResponse" && message.response) {
          try {
            JSON.parse(message.response);
            sanitizedMessage = {
              ...message,
              response: message.response,
            };
          } catch (parseError) {
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

        if (messages[this.state.id].length > 50) {
          messages[this.state.id] = messages[this.state.id].slice(-50);
        }

        chrome.storage.local.set({ wsMessages: messages });
      });
    } catch (error) {}
  }

  private notifyStateChange(): void {
    console.log(`[WSConnection] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[WSConnection] 📢 notifyStateChange() CALLED`);
    console.log(`[WSConnection] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[WSConnection] 📊 Current State:`, {
      id: this.state.id,
      port: this.state.port,
      url: this.state.url,
      status: this.state.status,
      lastConnected: this.state.lastConnected,
    });

    const updateStorage = async () => {
      try {
        console.log(
          `[WSConnection] 🔍 Reading current wsStates from storage...`
        );
        const result = await new Promise<any>((resolve, reject) => {
          chrome.storage.local.get(["wsStates"], (data: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(data || {});
          });
        });

        const states = result.wsStates || {};
        console.log(`[WSConnection] 📊 Current wsStates in storage:`, states);

        // 🔥 CRITICAL FIX: Lưu FULL state object thay vì chỉ 2 fields
        const newState = {
          id: this.state.id,
          port: this.state.port,
          url: this.state.url,
          status: this.state.status,
          lastConnected: this.state.lastConnected,
        };

        console.log(`[WSConnection] 💾 Saving new state to storage:`, newState);
        states[this.state.id] = newState;

        await new Promise<void>((resolve, reject) => {
          chrome.storage.local.set({ wsStates: states }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "[WSConnection] ❌ Error saving wsStates:",
                chrome.runtime.lastError
              );
              reject(chrome.runtime.lastError);
              return;
            }

            console.log(
              `[WSConnection] ✅ State saved successfully to storage`
            );
            resolve();
          });
        });

        // 🆕 VERIFICATION: Đọc lại để confirm
        const verifyResult = await new Promise<any>((resolve, reject) => {
          chrome.storage.local.get(["wsStates"], (data: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(data || {});
          });
        });

        const verifyStates = verifyResult.wsStates || {};
        console.log(
          `[WSConnection] ✅ Verification - wsStates after save:`,
          verifyStates
        );

        if (verifyStates[this.state.id]) {
          console.log(
            `[WSConnection] ✅ State verified in storage:`,
            verifyStates[this.state.id]
          );
        } else {
          console.error(
            `[WSConnection] ❌ State NOT found in storage after save!`
          );
        }
      } catch (error) {
        console.error("[WSConnection] ❌ Error in notifyStateChange:", error);
      }
    };

    updateStorage();

    // Also try to send message (fallback communication)
    try {
      const promise = chrome.runtime.sendMessage({
        type: "wsStateChanged",
        connectionId: this.state.id,
        state: { ...this.state },
      });

      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {});
      }
    } catch (error) {
      // Ignore message errors
    }

    console.log(`[WSConnection] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  public getState(): WSConnectionState {
    return { ...this.state };
  }

  /**
   * Listen for wsOutgoingMessage from ServiceWorker và forward qua WebSocket
   */
  private setupOutgoingMessageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsOutgoingMessage) {
        const outgoingMessage = changes.wsOutgoingMessage.newValue;

        if (!outgoingMessage) return;

        // Check nếu message thuộc connection này
        if (outgoingMessage.connectionId !== this.state.id) {
          return;
        }

        // Forward qua WebSocket
        if (this.ws && this.state.status === "connected") {
          try {
            this.ws.send(JSON.stringify(outgoingMessage.data));
          } catch (error) {
            console.error(`[WSConnection] ❌ Failed to send message:`, error);
          }
        }

        // Cleanup message sau khi gửi
        setTimeout(() => {
          chrome.storage.local.remove(["wsOutgoingMessage"]);
        }, 100);
      }
    });
  }

  /**
   * Monitor connection health based on ping/pong
   */
  private startHealthMonitor(): void {
    const checkInterval = setInterval(() => {
      if (this.state.status !== "connected") {
        return;
      }

      const timeSinceLastPing = Date.now() - this.lastPingTime;

      if (timeSinceLastPing > this.PING_TIMEOUT) {
        // Force reconnect
        if (this.ws) {
          this.ws.close();
        }
      }
    }, 10000); // Check every 10 seconds

    // Cleanup on disconnect
    this.ws?.addEventListener("close", () => {
      clearInterval(checkInterval);
    });
  }

  /**
   * 🆕 Helper method để gửi disconnect signal
   */
  private sendDisconnectSignal(): void {
    try {
      console.log(
        `[WSConnection] 📤 Sending disconnect signal for ${this.state.id}`
      );

      chrome.storage.local.set({
        wsOutgoingMessage: {
          connectionId: this.state.id,
          data: {
            type: "focusedTabsUpdate",
            data: [],
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        },
      });

      setTimeout(() => {
        chrome.storage.local.remove(["wsOutgoingMessage"]);
      }, 500);
    } catch (error) {
      console.error(
        `[WSConnection] ❌ Failed to send disconnect signal:`,
        error
      );
    }
  }

  /**
   * 🆕 Force disconnect với disconnect signal
   */
  public forceDisconnect(): void {
    console.log(
      `[WSConnection] 🔴 FORCE DISCONNECT called for ${this.state.id}`
    );

    // Gửi disconnect signal trước
    this.sendDisconnectSignal();

    // Đóng WebSocket nếu có
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // Update state
    this.state.status = "disconnected";
    this.notifyStateChange();
  }
}
