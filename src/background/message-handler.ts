export class MessageHandler {
  private containerManager: any;

  constructor(containerManager?: any) {
    this.containerManager = containerManager;
  }

  async handleMessage(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      let result: any;

      switch (message.action) {
        case "containersUpdated":
          // Broadcast to all connected ports (sidebar)
          result = { success: true, broadcast: true };
          break;

        case "removeContainerFromZenTab":
          if (this.containerManager) {
            await this.containerManager.removeContainerFromZenTab(
              message.containerId
            );
            result = { success: true };
          } else {
            result = { error: "Container manager not available" };
          }
          break;

        case "addToBlacklist":
          // Placeholder for blacklist functionality
          result = {
            success: true,
            note: "Blacklist feature not implemented yet",
          };
          break;

        default:
          result = { error: `Unknown action: ${message.action}` };
      }

      sendResponse(result);
    } catch (error) {
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
