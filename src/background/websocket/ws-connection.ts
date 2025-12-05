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
    if (
      this.state.status === "connected" ||
      this.state.status === "connecting"
    ) {
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
          this.lastPingTime = Date.now();

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
                chrome.storage.local.remove(["wsOutgoingMessage"], () => {});
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
          console.log(`[WSConnection] 📨 Message received from Zen:`, {
            connectionId: this.state.id,
            dataLength: event.data?.length || 0,
            timestamp: Date.now(),
          });
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
    const receiveTime = Date.now();
    console.log(`[WSConnection] ========== HANDLE MESSAGE START ==========`);
    console.log(`[WSConnection] 📥 RAW MESSAGE RECEIVED:`, {
      connectionId: this.state.id,
      connectionStatus: this.state.status,
      wsReadyState: this.ws?.readyState,
      dataLength: data.length,
      dataPreview: data.substring(0, 500),
      timestamp: receiveTime,
    });

    try {
      const parseStart = Date.now();
      const message = JSON.parse(data);
      const parseTime = Date.now() - parseStart;

      console.log(`[WSConnection] ✅ JSON PARSED in ${parseTime}ms`);
      console.log(`[WSConnection] 🔍 PARSED MESSAGE STRUCTURE:`, {
        type: message.type,
        hasTabId: !!message.tabId,
        tabId: message.tabId,
        hasRequestId: !!message.requestId,
        requestId: message.requestId,
        timestamp: message.timestamp,
        messageAge: message.timestamp ? receiveTime - message.timestamp : "N/A",
        allKeys: Object.keys(message),
      });

      console.log(`[WSConnection] 📊 MESSAGE TYPE: ${message.type}`);

      if (message.type === "sendPrompt") {
        console.log(`[WSConnection] 🎯 SEND PROMPT MESSAGE DETAILS:`, {
          tabId: message.tabId,
          requestId: message.requestId,
          userPromptLength: message.userPrompt?.length || 0,
          userPreview: message.userPrompt?.substring(0, 100),
          systemPromptLength: message.systemPrompt?.length || 0,
          isNewTask: message.isNewTask,
          folderPath: message.folderPath,
          hasFolderPath: !!message.folderPath,
        });
      }

      if (!message.timestamp) {
        const newTimestamp = Date.now();
        message.timestamp = newTimestamp;
        console.log(
          `[WSConnection] ⚠️ Message missing timestamp, added: ${newTimestamp}`
        );
      }

      if (!message.timestamp) {
        message.timestamp = Date.now();
        console.log(
          `[WSConnection] ⚠️ Message missing timestamp, added:`,
          message.timestamp
        );
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
      const messageAge =
        messageTimestamp > 0 ? Date.now() - messageTimestamp : 0;

      console.log(`[WSConnection] ⏱️ Message timestamp check:`, {
        messageTimestamp,
        currentTime: Date.now(),
        messageAge,
        maxAge: 60000,
        willSkip: messageAge > 60000,
      });

      if (messageTimestamp === 0) {
        console.log(
          `[WSConnection] ⚠️ Message has no timestamp, will process anyway`
        );
      } else {
        if (messageAge > 60000) {
          console.error(
            `[WSConnection] ❌ Message too old (${messageAge}ms), skipping!`
          );
          return;
        }
      }

      console.log(`[WSConnection] 💾 Saving message to storage:`, {
        connectionId: this.state.id,
        messageType: message.type,
        requestId: message.requestId,
      });

      chrome.storage.local.get(["wsMessages"], (result) => {
        const messages = result.wsMessages || {};
        console.log(`[WSConnection] 📊 Current wsMessages:`, {
          connectionCount: Object.keys(messages).length,
          hasThisConnection: !!messages[this.state.id],
          thisConnectionMessageCount: messages[this.state.id]?.length || 0,
        });

        if (!messages[this.state.id]) {
          messages[this.state.id] = [];
          console.log(
            `[WSConnection] 🆕 Created new message array for connection ${this.state.id}`
          );
        }

        console.log(`[WSConnection] 🔍 Checking for duplicates:`, {
          requestId: message.requestId,
          existingRequestIds: messages[this.state.id].map(
            (m: any) => m.data.requestId
          ),
        });

        // 🆕 CRITICAL FIX: Chỉ check duplicate cho messages CÓ requestId
        // Messages như focusedTabsUpdate, ping, pong KHÔNG có requestId → skip duplicate check
        const isDuplicate = message.requestId
          ? messages[this.state.id].some(
              (existing: any) => existing.data.requestId === message.requestId
            )
          : false;

        if (isDuplicate) {
          console.error(
            `[WSConnection] ❌ DUPLICATE MESSAGE DETECTED, SKIPPING:`,
            {
              requestId: message.requestId,
              messageType: message.type,
              existingCount: messages[this.state.id].length,
            }
          );
          return;
        }

        // 🆕 LOG: Confirm message will be saved
        console.log(`[WSConnection] ✅ Message passed duplicate check:`, {
          type: message.type,
          requestId: message.requestId || "no-request-id",
          hasRequestId: !!message.requestId,
          willSave: true,
        });

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

        chrome.storage.local.set({ wsMessages: messages }, () => {
          console.log(`[WSConnection] ✅ Message saved to storage:`, {
            requestId: message.requestId,
            type: message.type,
            connectionId: this.state.id,
            totalMessages: messages[this.state.id].length,
          });

          // Verify save
          chrome.storage.local.get(["wsMessages"], (verifyResult) => {
            const verifyMessages = verifyResult.wsMessages || {};
            const saved = verifyMessages[this.state.id]?.find(
              (m: any) => m.data.requestId === message.requestId
            );

            if (saved) {
              console.log(
                `[WSConnection] ✅ VERIFIED: Message saved successfully`
              );
            } else {
              console.error(
                `[WSConnection] ❌ VERIFICATION FAILED: Message NOT found in storage!`
              );
            }
          });
        });
      });
    } catch (error) {
      console.error(`[WSConnection] ❌ Exception in handleMessage:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        messagePreview: data.substring(0, 200),
      });
    }
  }

  private notifyStateChange(): void {
    const updateStorage = async () => {
      try {
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
        const newState = {
          id: this.state.id,
          port: this.state.port,
          url: this.state.url,
          status: this.state.status,
          lastConnected: this.state.lastConnected,
        };

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
        if (verifyStates[this.state.id]) {
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
