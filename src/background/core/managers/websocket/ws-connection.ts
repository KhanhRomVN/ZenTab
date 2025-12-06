// src/background/core/managers/websocket/ws-connection.ts

import { StorageManager } from "../../storage/storage-manager";
import {
  WSConnectionConfig,
  WSConnectionState,
} from "../../types/websocket.types";

/**
 * WebSocket Connection - Xử lý single WebSocket connection
 */
export class WSConnection {
  private ws?: WebSocket;
  private forwardedRequests: Set<string> = new Set();
  private lastPingTime: number = 0;
  private readonly PING_TIMEOUT = 90000; // 90 seconds
  private healthMonitorInterval?: NodeJS.Timeout;

  public state: WSConnectionState;

  constructor(config: WSConnectionConfig) {
    this.state = {
      id: config.id,
      port: config.port,
      url: config.url,
      status: "disconnected",
    };

    this.notifyStateChange();
    this.setupOutgoingMessageListener();
  }

  /**
   * Connect tới WebSocket server
   */
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
          this.startHealthMonitor();

          // 🆕 Broadcast tabs sau khi connect (delay 500ms để đảm bảo client ready)
          setTimeout(() => {
            this.broadcastCurrentTabs();
          }, 500);

          resolve();
        };

        this.ws.onerror = (error) => {
          console.error("[WSConnection] ❌ WebSocket ERROR:", {
            errorType: error.type,
            readyState: this.ws?.readyState,
            connectionId: this.state.id,
            url: this.state.url,
          });

          this.state.status = "error";
          this.notifyStateChange();
          this.sendDisconnectSignal();

          resolve();
        };

        this.ws.onclose = () => {
          const wasAttemptingConnection =
            this.state.status === "connected" ||
            this.state.status === "connecting";

          if (wasAttemptingConnection) {
            this.state.status = "disconnected";
            this.notifyStateChange();
            this.sendDisconnectSignal();
          } else {
            this.state.status = "disconnected";
            this.notifyStateChange();
          }

          this.stopHealthMonitor();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error(
          "[WSConnection] ❌ Exception during WebSocket creation:",
          error
        );

        this.state.status = "error";
        this.notifyStateChange();
        resolve();
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.state.status = "disconnected";
    this.notifyStateChange();
    this.stopHealthMonitor();
  }

  /**
   * Gửi message qua WebSocket
   */
  public send(data: any): void {
    if (this.ws && this.state.status === "connected") {
      try {
        const messageStr = JSON.stringify(data);
        this.ws.send(messageStr);
      } catch (error) {
        console.error("[WSConnection] ❌ Failed to send message:", error);
      }
    }
  }

  /**
   * Lấy connection state
   */
  public getState(): WSConnectionState {
    return { ...this.state };
  }

  /**
   * Xử lý incoming messages
   */
  private async handleMessage(data: string): Promise<void> {
    try {
      const message = JSON.parse(data);

      // 🆕 LOG: Chỉ log khi type = sendPrompt
      if (message.type === "sendPrompt") {
        console.log(
          `[WSConnection] 📥 RECEIVED REQUEST:`,
          JSON.stringify(message)
        );
      }

      // Handle ping messages
      if (message.type === "ping") {
        this.handlePing(message);
        return;
      }

      // Handle cleanup messages
      if (message.type === "cleanupMessages") {
        await this.handleCleanupMessages();
        return;
      }

      // Handle folder cleanup
      if (message.type === "cleanupFolderLink") {
        await this.handleFolderCleanup(message);
        return;
      }

      // Handle getTabsByFolder request
      if (message.type === "getTabsByFolder") {
        await this.handleGetTabsByFolder(message);
        return;
      }

      // Handle getAvailableTabs request
      if (message.type === "getAvailableTabs") {
        await this.handleGetAvailableTabs(message);
        return;
      }

      // Handle prompt response forwarding
      if (message.type === "promptResponse") {
        await this.handlePromptResponse(message);
        return;
      }

      // Store other messages
      await this.storeMessage(message);
    } catch (error) {
      console.error("[WSConnection] ❌ Error handling message:", error);
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(_message: any): void {
    this.lastPingTime = Date.now();

    if (this.ws && this.state.status === "connected") {
      const pongMessage = {
        type: "pong",
        timestamp: Date.now(),
      };
      this.ws.send(JSON.stringify(pongMessage));
    }
  }

  /**
   * Handle cleanup messages request
   */
  private async handleCleanupMessages(): Promise<void> {
    const storageManager = this.getStorageManager();

    await storageManager.remove(["wsMessages", "wsOutgoingMessage"]);

    // Cleanup legacy keys
    const allItems = await storageManager.getAll();
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
      await storageManager.remove(keysToRemove);
    }

    this.forwardedRequests.clear();
  }

  /**
   * Handle folder cleanup
   */
  private async handleFolderCleanup(message: any): Promise<void> {
    const folderPath = message.folderPath;
    if (!folderPath) return;

    const dedupeKey = `cleanup_${folderPath}_${Date.now()}`;

    // Check deduplication
    const storageManager = this.getStorageManager();
    const result = await storageManager.get<any>(dedupeKey);
    if (result) return;

    await storageManager.set(dedupeKey, Date.now());

    // Schedule cleanup
    setTimeout(() => {
      storageManager.remove([dedupeKey]).catch(() => {});
    }, 5000);

    // Forward to storage
    await storageManager.set("wsIncomingRequest", {
      type: "cleanupFolderLink",
      folderPath: folderPath,
      connectionId: this.state.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle getTabsByFolder request
   */
  private async handleGetTabsByFolder(message: any): Promise<void> {
    const requestId = message.requestId;
    const folderPath = message.folderPath;

    if (!folderPath) return;

    const dedupeKey = `folder_req_${requestId}`;

    // Check deduplication
    const storageManager = this.getStorageManager();
    const result = await storageManager.get<any>(dedupeKey);
    if (result) return;

    await storageManager.set(dedupeKey, Date.now());

    // Schedule cleanup
    setTimeout(() => {
      storageManager.remove([dedupeKey]).catch(() => {});
    }, 5000);

    // Forward to storage
    await storageManager.set("wsIncomingRequest", {
      type: "getTabsByFolder",
      requestId: requestId,
      folderPath: folderPath,
      connectionId: this.state.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle getAvailableTabs request
   */
  private async handleGetAvailableTabs(message: any): Promise<void> {
    const requestId = message.requestId;
    const dedupeKey = `tabs_req_${requestId}`;

    // Check deduplication
    const storageManager = this.getStorageManager();
    const result = await storageManager.get<any>(dedupeKey);
    if (result) return;

    await storageManager.set(dedupeKey, Date.now());

    // Schedule cleanup
    setTimeout(() => {
      storageManager.remove([dedupeKey]).catch(() => {});
    }, 5000);

    // Forward to storage
    await storageManager.set("wsIncomingRequest", {
      type: "getAvailableTabs",
      requestId: requestId,
      connectionId: this.state.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle prompt response forwarding
   */
  private async handlePromptResponse(message: any): Promise<void> {
    const requestId = message.requestId;

    if (this.forwardedRequests.has(requestId)) {
      return;
    }

    // Check storage deduplication
    const storageKey = `forwarded_${requestId}`;
    const storageManager = this.getStorageManager();
    const result = await storageManager.get<any>(storageKey);
    if (result) return;

    this.forwardedRequests.add(requestId);
    await storageManager.set(storageKey, Date.now());

    // Forward via WebSocket
    this.send(message);

    // Schedule cleanup
    setTimeout(() => {
      this.forwardedRequests.delete(requestId);
      storageManager.remove([storageKey]).catch(() => {});
    }, 60000);
  }

  /**
   * Store message to storage
   */
  private async storeMessage(message: any): Promise<void> {
    try {
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      const storageManager = this.getStorageManager();
      const result = await storageManager.get<any>("wsMessages");
      const messages = result || {};

      if (!messages[this.state.id]) {
        messages[this.state.id] = [];
      }

      // Check for duplicates
      const isDuplicate = message.requestId
        ? messages[this.state.id].some(
            (existing: any) => existing.data.requestId === message.requestId
          )
        : false;

      if (isDuplicate) {
        return;
      }

      // Sanitize message if needed
      let sanitizedMessage = message;
      if (message.type === "promptResponse" && message.response) {
        try {
          JSON.parse(message.response);
        } catch {
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

      // Keep only last 50 messages
      if (messages[this.state.id].length > 50) {
        messages[this.state.id] = messages[this.state.id].slice(-50);
      }

      await storageManager.set("wsMessages", messages);
    } catch (error) {
      console.error("[WSConnection] ❌ Error storing message:", error);
    }
  }

  /**
   * Notify state change
   */
  private async notifyStateChange(): Promise<void> {
    try {
      const storageManager = this.getStorageManager();
      const result = await storageManager.get<any>("wsStates");
      const states = result || {};

      states[this.state.id] = {
        id: this.state.id,
        port: this.state.port,
        url: this.state.url,
        status: this.state.status,
        lastConnected: this.state.lastConnected,
      };

      await storageManager.set("wsStates", states);

      // Also send runtime message
      const browserAPI = this.getBrowserAPI();
      try {
        browserAPI.runtime.sendMessage({
          type: "wsStateChanged",
          connectionId: this.state.id,
          state: { ...this.state },
        });
      } catch {
        // Ignore errors if no receivers
      }
    } catch (error) {
      console.error("[WSConnection] ❌ Error notifying state change:", error);
    }
  }

  /**
   * Setup outgoing message listener
   */
  private setupOutgoingMessageListener(): void {
    const storageManager = this.getStorageManager();

    storageManager.onChange((changes, areaName) => {
      if (areaName !== "local") return;

      if (changes.wsOutgoingMessage) {
        const outgoingMessage = changes.wsOutgoingMessage.newValue;

        if (
          !outgoingMessage ||
          outgoingMessage.connectionId !== this.state.id
        ) {
          return;
        }

        // Forward via WebSocket
        if (this.ws && this.state.status === "connected") {
          try {
            this.ws.send(JSON.stringify(outgoingMessage.data));
          } catch (error) {
            console.error(
              "[WSConnection] ❌ Failed to send outgoing message:",
              error
            );
          }
        }

        // Cleanup message
        setTimeout(() => {
          storageManager.remove(["wsOutgoingMessage"]).catch(() => {});
        }, 100);
      }
    });
  }

  /**
   * Start health monitor
   */
  private startHealthMonitor(): void {
    this.stopHealthMonitor();

    this.healthMonitorInterval = setInterval(() => {
      if (this.state.status !== "connected") return;

      const timeSinceLastPing = Date.now() - this.lastPingTime;

      if (timeSinceLastPing > this.PING_TIMEOUT) {
        this.disconnect();
      }
    }, 10000);
  }

  /**
   * Stop health monitor
   */
  private stopHealthMonitor(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = undefined;
    }
  }

  /**
   * Send disconnect signal
   */
  private sendDisconnectSignal(): void {
    try {
      const storageManager = this.getStorageManager();

      storageManager
        .set("wsOutgoingMessage", {
          connectionId: this.state.id,
          data: {
            type: "focusedTabsUpdate",
            data: [], // Empty array = disconnect signal
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        })
        .then(() => {
          setTimeout(() => {
            storageManager.remove(["wsOutgoingMessage"]).catch(() => {});
          }, 500);
        })
        .catch((error) => {
          console.error(
            "[WSConnection] ❌ Failed to send disconnect signal:",
            error
          );
        });
    } catch (error) {
      console.error(
        "[WSConnection] ❌ Error sending disconnect signal:",
        error
      );
    }
  }

  /**
   * 🆕 Broadcast current tabs after connection established
   */
  private async broadcastCurrentTabs(): Promise<void> {
    try {
      const browserAPI = this.getBrowserAPI();

      // Get all AI chat tabs
      const urlPatterns = [
        "https://chat.deepseek.com/*",
        "https://chatgpt.com/*",
        "https://*.openai.com/*",
        "https://claude.ai/*",
        "https://aistudio.google.com/prompts/*",
        "https://grok.com/*",
      ];

      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
        browserAPI.tabs.query(
          { url: urlPatterns },
          (tabs: chrome.tabs.Tab[]) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve(tabs || []);
          }
        );
      });

      const focusedTabs = await Promise.all(
        tabs
          .filter((tab) => tab && tab.id)
          .map(async (tab) => {
            const provider = this.detectProviderFromUrl(tab.url);
            const cookieStoreId = (tab as any).cookieStoreId || undefined;
            const containerName = await this.getContainerName(cookieStoreId);

            return {
              tabId: tab.id!,
              containerName: containerName,
              title: tab.title || "Untitled",
              url: tab.url,
              provider: provider,
              cookieStoreId: cookieStoreId,
            };
          })
      );

      // Send focusedTabsUpdate
      if (this.ws && this.state.status === "connected") {
        this.ws.send(
          JSON.stringify({
            type: "focusedTabsUpdate",
            data: focusedTabs,
            timestamp: Date.now(),
          })
        );
      }
    } catch (error) {
      console.error(`[WSConnection] ❌ Error broadcasting tabs:`, error);
    }
  }

  /**
   * 🆕 Helper to detect provider from URL
   */
  private detectProviderFromUrl(
    url?: string
  ): "deepseek" | "chatgpt" | "gemini" | "grok" | "claude" | undefined {
    if (!url) return undefined;

    const urlLower = url.toLowerCase();

    if (urlLower.includes("deepseek.com")) return "deepseek";
    if (urlLower.includes("chatgpt.com") || urlLower.includes("openai.com"))
      return "chatgpt";
    if (urlLower.includes("aistudio.google.com/prompts")) return "gemini";
    if (urlLower.includes("grok.com")) return "grok";
    if (urlLower.includes("claude.ai")) return "claude";

    return undefined;
  }

  /**
   * 🆕 Get container name from cookieStoreId
   */
  private async getContainerName(
    cookieStoreId?: string
  ): Promise<string | null> {
    if (!cookieStoreId || cookieStoreId === "firefox-default") {
      return null;
    }

    try {
      const isFirefox = typeof (globalThis as any).browser !== "undefined";
      if (!isFirefox) return null;

      const browserAPI = (globalThis as any).browser;
      if (!browserAPI.contextualIdentities) return null;

      const container = await browserAPI.contextualIdentities.get(
        cookieStoreId
      );
      return container?.name || null;
    } catch (error) {
      return null;
    }
  }

  private getStorageManager(): StorageManager {
    // This should be injected via constructor in production
    // For now, we'll create a new instance
    return new StorageManager();
  }

  private getBrowserAPI(): any {
    if (typeof (globalThis as any).browser !== "undefined") {
      return (globalThis as any).browser;
    }
    if (typeof chrome !== "undefined") {
      return chrome;
    }
    throw new Error("No browser API available");
  }
}
