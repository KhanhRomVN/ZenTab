export class MessageHandler {
  constructor(private containerManager: any, private zenTabManager: any) {}

  async handleMessage(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      let result: any;

      switch (message.action) {
        case "selectTab":
          await this.zenTabManager.selectTab(
            message.containerId,
            message.tabId
          );
          result = { success: true };
          break;

        case "unselectTab":
          await this.zenTabManager.unselectTab(message.containerId);
          result = { success: true };
          break;

        case "getSelectedTab":
          result = this.zenTabManager.getSelectedTab(message.containerId);
          break;

        case "getAllSelectedTabs":
          result = Object.fromEntries(this.zenTabManager.getAllSelectedTabs());
          break;

        case "openSelectedTab":
          await this.zenTabManager.openSelectedTab(message.containerId);
          result = { success: true };
          break;

        case "containersUpdated":
          // Broadcast to all connected ports (sidebar)
          result = { success: true, broadcast: true };
          break;

        default:
          console.warn(`[MessageHandler] Unknown action: ${message.action}`);
          result = { error: `Unknown action: ${message.action}` };
      }

      sendResponse(result);
    } catch (error) {
      console.error("[MessageHandler] Error:", error);
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
