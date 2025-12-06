// src/background/core/managers/websocket/ws-message-processor.ts
import { TabStateManager } from "../tab-state";
import { StorageManager } from "../../storage/storage-manager";

/**
 * WebSocket Message Processor - Xử lý các messages từ WebSocket
 */
export class WSMessageProcessor {
  private tabStateManager: TabStateManager;
  private storageManager: StorageManager;

  constructor(
    tabStateManager: TabStateManager,
    storageManager: StorageManager
  ) {
    this.tabStateManager = tabStateManager;
    this.storageManager = storageManager;
  }

  /**
   * Process incoming WebSocket message
   */
  public async processMessage(
    connectionId: string,
    message: any
  ): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      // Validate message structure
      const validation = this.validateMessage(message);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid message: ${validation.errors.join(", ")}`,
        };
      }

      // Process based on message type
      switch (message.type) {
        case "ping":
          return this.processPing(message);

        case "getAvailableTabs":
          return this.processGetAvailableTabs(message, connectionId);

        case "sendPrompt":
          return this.processSendPrompt(message, connectionId);

        case "cleanupFolderLink":
          return this.processCleanupFolderLink(message);

        case "getTabsByFolder":
          return this.processGetTabsByFolder(message, connectionId);

        case "getTabStatus":
          return this.processGetTabStatus(message);

        case "updateTabStatus":
          return this.processUpdateTabStatus(message);

        default:
          return {
            success: false,
            error: `Unknown message type: ${message.type}`,
          };
      }
    } catch (error) {
      console.error("[WSMessageProcessor] ❌ Error processing message:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate message structure
   */
  private validateMessage(message: any): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!message || typeof message !== "object") {
      errors.push("Message must be an object");
      return { isValid: false, errors };
    }

    if (!message.type || typeof message.type !== "string") {
      errors.push("Message must have a 'type' string property");
    }

    if (message.requestId && typeof message.requestId !== "string") {
      errors.push("requestId must be a string if provided");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process ping message
   */
  private async processPing(message: any): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    return {
      success: true,
      response: {
        type: "pong",
        timestamp: Date.now(),
        requestId: message.requestId,
      },
    };
  }

  /**
   * Process getAvailableTabs message
   */
  private async processGetAvailableTabs(
    message: any,
    connectionId: string
  ): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    try {
      const allTabStates = await this.tabStateManager.getAllTabStates();

      // Filter only free tabs that can accept requests
      const availableTabs = allTabStates.filter(
        (tab) => tab.status === "free" && tab.canAccept
      );

      return {
        success: true,
        response: {
          type: "availableTabs",
          requestId: message.requestId,
          connectionId,
          tabs: availableTabs,
          count: availableTabs.length,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error getting available tabs:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process sendPrompt message
   */
  private async processSendPrompt(
    message: any,
    connectionId: string
  ): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    const { tabId, prompt, requestId, isNewTask, folderPath } = message;

    // Validate required fields
    if (!tabId || !prompt || !requestId) {
      return {
        success: false,
        error: "Missing required fields: tabId, prompt, or requestId",
      };
    }

    try {
      // Store the message in storage để StorageChangeHandler xử lý
      await this.storageManager.set("wsIncomingRequest", {
        type: "sendPrompt",
        connectionId,
        tabId,
        prompt,
        requestId,
        isNewTask: isNewTask === true,
        folderPath,
        timestamp: Date.now(),
      });

      return {
        success: true,
        response: {
          type: "promptAccepted",
          requestId,
          connectionId,
          tabId,
          timestamp: Date.now(),
          message: "Prompt accepted for processing",
        },
      };
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error processing sendPrompt:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process cleanupFolderLink message
   */
  private async processCleanupFolderLink(message: any): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    const { folderPath } = message;

    if (!folderPath) {
      return {
        success: false,
        error: "folderPath is required",
      };
    }

    try {
      // Store cleanup request in storage
      await this.storageManager.set("wsIncomingRequest", {
        type: "cleanupFolderLink",
        folderPath,
        timestamp: Date.now(),
      });

      return {
        success: true,
        response: {
          type: "cleanupStarted",
          folderPath,
          timestamp: Date.now(),
          message: "Folder cleanup started",
        },
      };
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error processing cleanupFolderLink:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process getTabsByFolder message
   */
  private async processGetTabsByFolder(
    message: any,
    connectionId: string
  ): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    const { folderPath, requestId } = message;

    if (!folderPath || !requestId) {
      return {
        success: false,
        error: "folderPath and requestId are required",
      };
    }

    try {
      // Store request in storage
      await this.storageManager.set("wsIncomingRequest", {
        type: "getTabsByFolder",
        connectionId,
        folderPath,
        requestId,
        timestamp: Date.now(),
      });

      return {
        success: true,
        response: {
          type: "tabsByFolderRequested",
          requestId,
          connectionId,
          folderPath,
          timestamp: Date.now(),
          message: "Tabs by folder request accepted",
        },
      };
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error processing getTabsByFolder:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process getTabStatus message
   */
  private async processGetTabStatus(message: any): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    const { tabId } = message;

    if (!tabId) {
      return {
        success: false,
        error: "tabId is required",
      };
    }

    try {
      const tabState = await this.tabStateManager.getTabState(tabId);

      return {
        success: true,
        response: {
          type: "tabStatus",
          tabId,
          tabState,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error processing getTabStatus:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process updateTabStatus message
   */
  private async processUpdateTabStatus(message: any): Promise<{
    success: boolean;
    response?: any;
    error?: string;
  }> {
    const { tabId, status, requestId, folderPath } = message;

    if (!tabId || !status) {
      return {
        success: false,
        error: "tabId and status are required",
      };
    }

    try {
      let success = false;

      switch (status) {
        case "free":
          success = await this.tabStateManager.markTabFree(tabId);
          break;

        case "busy":
          if (!requestId) {
            return {
              success: false,
              error: "requestId is required for busy status",
            };
          }
          success = await this.tabStateManager.markTabBusy(tabId, requestId);
          break;

        case "sleep":
          success = await this.tabStateManager.markTabSleep(tabId);
          break;

        default:
          return {
            success: false,
            error: `Invalid status: ${status}`,
          };
      }

      // Update folder path if provided
      if (success && folderPath) {
        await this.tabStateManager.linkTabToFolder(tabId, folderPath);
      }

      if (success) {
        return {
          success: true,
          response: {
            type: "tabStatusUpdated",
            tabId,
            status,
            success: true,
            timestamp: Date.now(),
          },
        };
      } else {
        return {
          success: false,
          error: "Failed to update tab status",
        };
      }
    } catch (error) {
      console.error(
        "[WSMessageProcessor] ❌ Error processing updateTabStatus:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format error response
   */
  public formatErrorResponse(
    requestId: string | undefined,
    error: string,
    errorType: string = "processing_error"
  ): any {
    return {
      type: "error",
      requestId,
      error,
      errorType,
      timestamp: Date.now(),
    };
  }

  /**
   * Format success response
   */
  public formatSuccessResponse(
    requestId: string | undefined,
    type: string,
    data: any = {}
  ): any {
    return {
      type,
      requestId,
      ...data,
      timestamp: Date.now(),
      success: true,
    };
  }

  /**
   * Batch process multiple messages
   */
  public async processBatch(
    connectionId: string,
    messages: any[]
  ): Promise<Array<{ success: boolean; response?: any; error?: string }>> {
    const results: Array<{ success: boolean; response?: any; error?: string }> =
      [];

    for (const message of messages) {
      const result = await this.processMessage(connectionId, message);
      results.push(result);
    }

    return results;
  }
}
