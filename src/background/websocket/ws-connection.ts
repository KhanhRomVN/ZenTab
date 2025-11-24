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
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private retryStartTime?: number;
  private readonly MAX_RETRY_DURATION = 10000;
  private manualDisconnect = false;
  private forwardedRequests: Set<string> = new Set();
  private lastPingTime: number = 0;
  private readonly PING_TIMEOUT = 90000; // 45 seconds (30s backend ping + 15s buffer)

  public state: WSConnectionState;

  constructor(config: WSConnectionConfig) {
    this.state = {
      id: config.id,
      port: config.port,
      url: config.url,
      status: "disconnected",
      reconnectAttempts: 0,
    };

    this.notifyStateChange();

    // CRITICAL: Setup storage listener để forward wsOutgoingMessage qua WebSocket
    this.setupOutgoingMessageListener();
  }

  public disconnect(): void {
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

    this.state.reconnectAttempts = 0;

    this.notifyStateChange();
  }

  public async connect(): Promise<void> {
    if (
      this.state.status === "connected" ||
      this.state.status === "connecting"
    ) {
      return;
    }

    this.manualDisconnect = false;

    if (!this.retryStartTime) {
      this.retryStartTime = Date.now();
    }
    this.state.status = "connecting";
    this.notifyStateChange();

    return new Promise<void>((resolve) => {
      try {
        this.ws = new WebSocket(this.state.url);
        this.ws.onopen = () => {
          this.state.status = "connected";
          this.state.lastConnected = Date.now();
          this.state.reconnectAttempts = 0;
          this.retryStartTime = undefined;
          this.lastPingTime = Date.now(); // Initialize ping time
          this.notifyStateChange();

          // Start health monitoring
          this.startHealthMonitor();

          resolve();
        };

        this.ws.onerror = (error) => {
          console.error(
            `[WSConnection] ❌ WebSocket error on ${this.state.url}:`,
            error
          );
          this.state.status = "error";
          this.notifyStateChange();
        };

        this.ws.onclose = () => {
          this.state.status = "disconnected";
          this.ws = undefined;
          this.notifyStateChange();

          if (!this.manualDisconnect) {
            const elapsedTime = this.retryStartTime
              ? Date.now() - this.retryStartTime
              : 0;

            if (
              elapsedTime < this.MAX_RETRY_DURATION &&
              this.state.reconnectAttempts < this.maxReconnectAttempts
            ) {
              this.scheduleReconnect();
            } else {
              console.error(
                `[WSConnection] ❌ Max retries (${this.maxReconnectAttempts}) reached or timeout exceeded`
              );
              this.state.status = "error";
              this.retryStartTime = undefined;
              this.notifyStateChange();
            }
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error(
          `[WSConnection] ❌ Exception during WebSocket creation:`,
          error
        );
        this.state.status = "error";
        this.notifyStateChange();
        resolve();
      }
    });
  }

  public send(data: any): void {
    if (this.ws && this.state.status === "connected") {
      this.ws.send(JSON.stringify(data));
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

      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      // CRITICAL: Handle ping messages - reply with pong
      if (message.type === "ping") {
        try {
          if (this.ws && this.state.status === "connected") {
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
    const isDefaultConnection =
      this.state.id.startsWith("ws-") && this.state.id.includes("-");
    if (!isDefaultConnection) {
      return;
    }

    const updateStorage = () => {
      chrome.storage.local.get(["wsStates"], (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[WSConnection] Error reading wsStates:",
            chrome.runtime.lastError
          );
          return;
        }

        const states = result.wsStates || {};
        const newState = {
          status: this.state.status,
          lastConnected: this.state.lastConnected,
          reconnectAttempts: this.state.reconnectAttempts,
        };

        states[this.state.id] = newState;
        chrome.storage.local.set({ wsStates: states }, () => {
          if (chrome.runtime.lastError) {
            return;
          }
        });
      });
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
}
