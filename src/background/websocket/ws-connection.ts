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
  private reconnectDelay = 2000;
  private retryStartTime?: number;
  private readonly MAX_RETRY_DURATION = 10000;
  private manualDisconnect = false;
  private forwardedRequests: Set<string> = new Set();

  public state: WSConnectionState;

  constructor(config: WSConnectionConfig) {
    this.state = {
      id: config.id,
      port: config.port,
      url: config.url,
      status: "disconnected",
      reconnectAttempts: 0,
    };

    this.setupOutgoingListener();
    this.setupBackendOutgoingListener();
    this.notifyStateChange();
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
          this.notifyStateChange();

          resolve();
        };

        this.ws.onerror = (error) => {
          console.error(
            `[WSConnection] WebSocket error on ${this.state.url}:`,
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
                `[WSConnection] Max retries reached or timeout exceeded`
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
          `[WSConnection] Exception during WebSocket creation:`,
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
          console.warn(
            "[WSConnection] ⚠️ cleanupFolderLink missing folderPath"
          );
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
        if (this.state.port !== 1500) {
          return;
        }

        const requestId = message.requestId;
        const folderPath = message.folderPath;

        if (!folderPath) {
          console.warn("[WSConnection] ⚠️ getTabsByFolder missing folderPath");
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
        if (this.state.port !== 1500) {
          return;
        }

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
            return;
          }
        });

        return;
      }

      if (message.type === "promptResponse") {
        if (this.state.port !== 1500) {
          return;
        }

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

        const currentTimestamp = Date.now();
        const forwardPayload = {
          wsOutgoingMessage: {
            connectionId: this.state.id,
            data: message,
            timestamp: currentTimestamp,
          },
        };

        chrome.storage.local.set(forwardPayload, () => {
          if (chrome.runtime.lastError) {
            this.forwardedRequests.delete(message.requestId);
            return;
          }

          const storageKey = `forwarded_${message.requestId}`;
          chrome.storage.local.set(
            {
              [storageKey]: currentTimestamp,
            },
            () => {
              setTimeout(() => {
                chrome.storage.local.remove([storageKey]);
              }, 60000);
            }
          );
        });

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

  private setupOutgoingListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsOutgoingMessage) {
        const msg = changes.wsOutgoingMessage.newValue;

        if (msg && msg.connectionId === this.state.id) {
          this.send(msg.data);
        }
      }
    });
  }

  private setupBackendOutgoingListener(): void {
    const processedMessages = new Set<string>();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsOutgoingMessage) {
        const outgoingMsg = changes.wsOutgoingMessage.newValue;

        if (!outgoingMsg) {
          return;
        }

        if (outgoingMsg.connectionId !== this.state.id) {
          return;
        }

        const messageKey = `${outgoingMsg.timestamp}_${
          outgoingMsg.data?.requestId || "unknown"
        }`;

        if (processedMessages.has(messageKey)) {
          return;
        }

        processedMessages.add(messageKey);

        this.send(outgoingMsg.data);

        setTimeout(() => {
          processedMessages.delete(messageKey);
        }, 300000);
      }
    });
  }

  private notifyStateChange(): void {
    if (this.state.id !== "ws-default-1500") {
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
          port: this.state.port,
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
}
