export class MessageHandler {
  constructor(private containerManager: any, private zenTabManager: any) {}

  async handleMessage(
    message: any,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      let result: any;

      switch (message.action) {
        case "getUnusedContainers":
          const unusedContainers =
            await this.containerManager.getUnusedContainers();
          // Filter out blacklisted containers
          result = unusedContainers.filter(
            (container: any) =>
              !this.zenTabManager.isBlacklisted(container.cookieStoreId)
          );
          break;

        case "addContainerToZenTab":
          await this.containerManager.addContainerToZenTab(message.containerId);
          result = { success: true };
          break;

        case "createZenTab":
          await this.zenTabManager.ensureZenTab(message.containerId);
          result = { success: true };
          break;

        case "removeContainerFromZenTab":
          await this.containerManager.removeContainerFromZenTab(
            message.containerId
          );
          result = { success: true };
          break;

        case "openZenTab":
          await this.zenTabManager.openZenTab(message.containerId);
          result = { success: true };
          break;

        case "getZenTabContainers":
          result = await this.containerManager.getZenTabContainers();
          break;

        case "addToBlacklist":
          await this.zenTabManager.addToBlacklist(message.containerId);
          result = { success: true };
          break;

        case "removeFromBlacklist":
          await this.zenTabManager.removeFromBlacklist(message.containerId);
          result = { success: true };
          break;

        case "getBlacklistedContainers":
          result = Array.from(this.zenTabManager.blacklistedContainers || []);
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
