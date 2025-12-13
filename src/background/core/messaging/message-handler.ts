// src/background/core/messaging/message-handler.ts

import { ContainerManager } from "../managers/container/container-manager";
import { TabStateManager } from "../managers/tab-state";
import { WSManager } from "../managers/websocket";

/**
 * Message Handler - Xử lý tất cả runtime messages
 */
export class MessageHandler {
  private containerManager: ContainerManager;
  private tabStateManager: TabStateManager;
  private wsManager: WSManager;

  constructor(
    containerManager: ContainerManager,
    tabStateManager: TabStateManager,
    wsManager: WSManager
  ) {
    this.containerManager = containerManager;
    this.tabStateManager = tabStateManager;
    this.wsManager = wsManager;
  }

  /**
   * Xử lý incoming message
   */
  public async handleMessage(
    message: any,
    _sender: any,
    sendResponse: (response: any) => void
  ): Promise<boolean> {
    try {
      // Validate message structure
      if (!message || typeof message !== "object") {
        console.error("[MessageHandler] Invalid message:", message);
        sendResponse({
          success: false,
          error: "Invalid message format",
        });
        return false;
      }

      if (!message.action || typeof message.action !== "string") {
        console.error("[MessageHandler] Missing action:", message);
        sendResponse({
          success: false,
          error: "Missing action field",
        });
        return false;
      }

      // Handle WebSocket actions
      if (await this.handleWebSocketActions(message, sendResponse)) {
        return true;
      }

      // Handle DeepSeek actions
      if (await this.handleDeepSeekActions(message, sendResponse)) {
        return true;
      }

      // Handle Tab State actions
      if (await this.handleTabStateActions(message, sendResponse)) {
        return true;
      }

      // Handle Container actions
      if (await this.handleContainerActions(message, sendResponse)) {
        return true;
      }

      // Handle other actions
      return this.handleOtherActions(message, sendResponse);
    } catch (error) {
      console.error("[MessageHandler] Unexpected error:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Handle WebSocket related actions
   */
  private async handleWebSocketActions(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<boolean> {
    switch (message.action) {
      case "connectWebSocket":
        await this.handleConnectWebSocket(message, sendResponse);
        return true;

      case "disconnectWebSocket":
        this.handleDisconnectWebSocket(message, sendResponse);
        return true;

      case "ws.sendResponse":
        this.handleWSSendResponse(message, sendResponse);
        return true;

      case "getWSConnectionInfo":
        await this.handleGetWSConnectionInfo(message, sendResponse);
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle DeepSeek related actions
   */
  private async handleDeepSeekActions(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<boolean> {
    // Dynamic import để tránh circular dependencies
    const { DeepSeekController } = await import(
      "../../ai-services/deepseek/controller"
    );

    switch (message.action) {
      case "deepseek.clickNewChat":
        const clickSuccess = await DeepSeekController.clickNewChatButton(
          message.tabId
        );
        sendResponse({ success: clickSuccess });
        return true;

      case "deepseek.isDeepThinkEnabled":
        const enabled = await DeepSeekController.isDeepThinkEnabled(
          message.tabId
        );
        sendResponse({ enabled });
        return true;

      case "deepseek.toggleDeepThink":
        const toggleSuccess = await DeepSeekController.toggleDeepThink(
          message.tabId,
          message.enable
        );
        sendResponse({ success: toggleSuccess });
        return true;

      case "deepseek.sendPrompt":
        const promptSuccess = await DeepSeekController.sendPrompt(
          message.tabId,
          message.prompt,
          message.requestId
        );
        sendResponse({ success: promptSuccess });
        return true;

      case "deepseek.stopGeneration":
        const stopSuccess = await DeepSeekController.stopGeneration(
          message.tabId
        );
        sendResponse({ success: stopSuccess });
        return true;

      case "deepseek.getLatestResponse":
        const response = await DeepSeekController.getLatestResponse(
          message.tabId
        );
        sendResponse({ response });
        return true;

      case "deepseek.createNewChat":
        const createSuccess = await DeepSeekController.createNewChat(
          message.tabId
        );
        sendResponse({ success: createSuccess });
        return true;

      case "deepseek.getChatTitle":
        const title = await DeepSeekController.getChatTitle(message.tabId);
        sendResponse({ title });
        return true;

      case "deepseek.isGenerating":
        const generating = await DeepSeekController.isGenerating(message.tabId);
        sendResponse({ generating });
        return true;

      case "deepseek.getCurrentInput":
        const input = await DeepSeekController.getCurrentInput(message.tabId);
        sendResponse({ input });
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle Tab State actions
   */
  private async handleTabStateActions(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<boolean> {
    switch (message.action) {
      case "getTabStates":
        try {
          const tabStates = await this.tabStateManager.getAllTabStates();
          sendResponse({ success: true, tabStates });
        } catch (error) {
          console.error("[MessageHandler] getTabStates error:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      case "unlinkTabFromFolder":
        try {
          const success = await this.tabStateManager.unlinkTabFromFolder(
            message.tabId
          );
          sendResponse({ success });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle Container actions
   */
  private async handleContainerActions(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<boolean> {
    switch (message.action) {
      case "removeContainerFromZenTab":
        try {
          await this.containerManager.removeContainerFromZenTab(
            message.containerId
          );
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle other actions
   */
  private handleOtherActions(
    message: any,
    sendResponse: (response: any) => void
  ): boolean {
    switch (message.action) {
      case "ping":
        sendResponse({
          success: true,
          timestamp: Date.now(),
          ready: true,
        });
        return true;

      case "addToBlacklist":
        sendResponse({
          success: true,
          note: "Blacklist feature not implemented yet",
        });
        return true;

      default:
        sendResponse({
          error: `Unknown action: ${message.action}`,
        });
        return true;
    }
  }

  /**
   * Handle WebSocket connect
   */
  private async handleConnectWebSocket(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const result = await this.wsManager.connect(message.apiProvider);
      sendResponse(result);
    } catch (error) {
      console.error("[MessageHandler] WebSocket connection error:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Handle WebSocket disconnect
   */
  private handleDisconnectWebSocket(
    message: any,
    sendResponse: (response: any) => void
  ): void {
    const result = this.wsManager.disconnect(message.port);
    sendResponse(result);
  }

  /**
   * Handle WebSocket send response
   */
  private handleWSSendResponse(
    message: any,
    sendResponse: (response: any) => void
  ): void {
    // message.port is optional
    const success = this.wsManager.send(message.data, message.port);
    sendResponse({ success });
  }

  /**
   * Handle get WebSocket connection info
   */
  private async handleGetWSConnectionInfo(
    _message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      const states = this.wsManager.getConnectionInfo();

      if (states.length > 0) {
        sendResponse({ success: true, states });
      } else {
        sendResponse({
          success: false,
          states: [],
          error: "No WebSocket connections found",
        });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
