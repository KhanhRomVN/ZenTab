export class MessageHandler {
  constructor(private containerManager: any) {}

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
