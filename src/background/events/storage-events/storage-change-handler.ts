// src/background/events/storage-events/storage-change-handler.ts

import { TabStateManager } from "../../core/managers/tab-state";
import { WSManager } from "../../core/managers/websocket";

/**
 * Storage Change Handler - Xử lý storage change events
 */
export class StorageChangeHandler {
  private tabStateManager: TabStateManager;
  private wsManager: WSManager;

  constructor(tabStateManager: TabStateManager, wsManager: WSManager) {
    this.tabStateManager = tabStateManager;
    this.wsManager = wsManager;
  }

  /**
   * Setup storage change listeners
   */
  public async setupListeners(): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    browserAPI.storage.onChanged.addListener(
      (changes: any, areaName: string) => {
        this.handleStorageChanges(changes, areaName);
      }
    );
  }

  /**
   * Cleanup listeners
   */
  public async cleanup(): Promise<void> {
    // Note: Chrome API doesn't provide a way to remove these listeners
  }

  /**
   * Handle storage changes
   */
  private async handleStorageChanges(
    changes: any,
    areaName: string
  ): Promise<void> {
    if (areaName !== "local") return;

    // Handle WebSocket messages
    if (changes.wsMessages) {
      await this.handleWSMessages(changes.wsMessages.newValue);
    }

    // Handle WebSocket incoming requests
    if (changes.wsIncomingRequest) {
      await this.handleWSIncomingRequest(changes.wsIncomingRequest.newValue);
    }

    // Handle API Provider changes
    if (changes.apiProvider) {
      await this.handleAPIProviderChange(
        changes.apiProvider.newValue,
        changes.apiProvider.oldValue
      );
    }

    // Handle selected tabs changes
    if (changes.zenTabSelectedTabs) {
      await this.handleSelectedTabsChange();
    }
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWSMessages(messages: any): Promise<void> {
    if (!messages || Object.keys(messages).length === 0) {
      return;
    }

    // Process each connection's messages
    for (const [connectionId, msgArray] of Object.entries(messages)) {
      const msgs = msgArray as Array<{ timestamp: number; data: any }>;

      const now = Date.now();
      const recentMsgs = msgs.filter((msg) => {
        const age = now - msg.timestamp;
        return age < 180000; // 3 minutes
      });

      if (recentMsgs.length === 0) continue;

      // Process latest message
      const latestMsg = recentMsgs[recentMsgs.length - 1];

      if (latestMsg.data.type === "sendPrompt") {
        await this.handleSendPromptMessage(latestMsg.data, connectionId);
      }
    }
  }

  /**
   * Handle send prompt message
   */
  private async handleSendPromptMessage(
    message: any,
    connectionId: string
  ): Promise<void> {
    const { tabId, prompt, requestId, isNewTask, folderPath, conversationId } =
      message;

    // 🔥 FIX: More lenient validation - only check essential fields
    if (!tabId) {
      console.error(
        "[StorageChangeHandler] ❌ Invalid sendPrompt: missing tabId"
      );
      return;
    }

    if (!requestId) {
      console.error(
        "[StorageChangeHandler] ❌ Invalid sendPrompt: missing requestId"
      );
      return;
    }

    if (!prompt || prompt.trim() === "") {
      console.error(
        "[StorageChangeHandler] ❌ Invalid sendPrompt: missing or empty prompt"
      );
      return;
    }

    // Check deduplication
    const requestKey = `processed_${requestId}`;
    const browserAPI = this.getBrowserAPI();

    try {
      const result = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get([requestKey], (data: any) => {
          resolve(data || {});
        });
      });

      if (result[requestKey]) {
        return;
      }

      // Mark as processed
      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set({ [requestKey]: Date.now() }, () => {
          resolve();
        });
      });

      // 🆕 CRITICAL: Store folderPath mapping separately to avoid triggering validation
      // Don't store incomplete sendPrompt messages in wsMessages
      const folderMappingKey = `folderPath_${requestId}`;

      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set(
          { [folderMappingKey]: folderPath || null },
          () => {
            resolve();
          }
        );
      });

      // Schedule cleanup after 5 minutes
      setTimeout(() => {
        browserAPI.storage.local.remove([folderMappingKey]);
      }, 300000);

      // Dynamic import để tránh circular dependencies
      const { DeepSeekController } = await import(
        "../../ai-services/deepseek/controller"
      );

      const success = await DeepSeekController.sendPrompt(
        tabId,
        prompt,
        requestId,
        isNewTask === true,
        conversationId // 🆕 Pass conversationId to controller
      );

      if (success) {
        // Cleanup after 2 minutes
        setTimeout(() => {
          browserAPI.storage.local.remove([requestKey]);
        }, 120000);
      } else {
        // Send error response
        await this.sendErrorResponse(
          connectionId,
          requestId,
          tabId,
          "Failed to send prompt to DeepSeek tab"
        );

        browserAPI.storage.local.remove([requestKey]);
      }
    } catch (error) {
      console.error(
        "[StorageChangeHandler] ❌ Error processing sendPrompt:",
        error
      );
      browserAPI.storage.local.remove([requestKey]);
    }
  }

  /**
   * Handle WebSocket incoming requests
   */
  private async handleWSIncomingRequest(request: any): Promise<void> {
    if (!request) return;

    switch (request.type) {
      case "getAvailableTabs":
        await this.handleGetAvailableTabs(request);
        break;

      case "cleanupFolderLink":
        await this.handleCleanupFolderLink(request);
        break;

      case "getTabsByFolder":
        await this.handleGetTabsByFolder(request);
        break;
    }
  }

  /**
   * Handle get available tabs request
   */
  private async handleGetAvailableTabs(request: any): Promise<void> {
    const { requestId, connectionId } = request;

    try {
      const availableTabs = await this.tabStateManager.getAllTabStates();

      // Send response via wsOutgoingMessage
      const browserAPI = this.getBrowserAPI();

      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set(
          {
            wsOutgoingMessage: {
              connectionId: connectionId,
              data: {
                type: "availableTabs",
                requestId: requestId,
                tabs: availableTabs,
                timestamp: Date.now(),
              },
              timestamp: Date.now(),
            },
          },
          () => {
            resolve();
          }
        );
      });

      // Cleanup request
      browserAPI.storage.local.remove(["wsIncomingRequest"]);
    } catch (error) {
      console.error(
        "[StorageChangeHandler] ❌ Error processing getAvailableTabs:",
        error
      );

      // Send error response
      await this.sendErrorResponse(
        connectionId,
        requestId,
        0,
        error instanceof Error ? error.message : String(error)
      );

      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
    }
  }

  /**
   * Handle cleanup folder link request
   */
  private async handleCleanupFolderLink(request: any): Promise<void> {
    const { folderPath } = request;

    if (!folderPath) {
      console.error(
        "[StorageChangeHandler] ❌ cleanupFolderLink missing folderPath"
      );
      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
      return;
    }

    try {
      await this.tabStateManager.unlinkFolder(folderPath);
      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
    } catch (error) {
      console.error(
        "[StorageChangeHandler] ❌ Error processing cleanupFolderLink:",
        error
      );
      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
    }
  }

  /**
   * Handle get tabs by folder request
   */
  private async handleGetTabsByFolder(request: any): Promise<void> {
    const { folderPath, requestId, connectionId } = request;

    if (!folderPath || !requestId || !connectionId) {
      console.error(
        "[StorageChangeHandler] ❌ getTabsByFolder missing required fields"
      );
      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
      return;
    }

    try {
      const matchingTabs = await this.tabStateManager.getTabsByFolder(
        folderPath
      );

      const browserAPI = this.getBrowserAPI();

      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set(
          {
            wsOutgoingMessage: {
              connectionId: connectionId,
              data: {
                type: "availableTabs",
                requestId: requestId,
                tabs: matchingTabs,
                timestamp: Date.now(),
              },
              timestamp: Date.now(),
            },
          },
          () => {
            resolve();
          }
        );
      });

      browserAPI.storage.local.remove(["wsIncomingRequest"]);
    } catch (error) {
      console.error(
        "[StorageChangeHandler] ❌ Error processing getTabsByFolder:",
        error
      );

      // Send error response
      await this.sendErrorResponse(
        connectionId,
        requestId,
        0,
        error instanceof Error ? error.message : String(error)
      );

      this.getBrowserAPI().storage.local.remove(["wsIncomingRequest"]);
    }
  }

  /**
   * Handle API Provider changes
   */
  private async handleAPIProviderChange(
    newValue: string,
    oldValue: string
  ): Promise<void> {
    if (newValue !== oldValue) {
      // WebSocket sẽ tự động reconnect khi cần
    }
  }

  /**
   * Handle selected tabs changes
   */
  private async handleSelectedTabsChange(): Promise<void> {
    // TabBroadcaster sẽ tự động handle việc này
  }

  /**
   * Send error response
   */
  private async sendErrorResponse(
    connectionId: string,
    requestId: string,
    tabId: number,
    error: string
  ): Promise<void> {
    const browserAPI = this.getBrowserAPI();

    await new Promise<void>((resolve) => {
      browserAPI.storage.local.set(
        {
          wsOutgoingMessage: {
            connectionId: connectionId,
            data: {
              type: "promptResponse",
              requestId: requestId,
              tabId: tabId,
              success: false,
              error: error,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
          },
        },
        () => {
          resolve();
        }
      );
    });
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
