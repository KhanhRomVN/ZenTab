/**
 * Background Health Checker - Kiểm tra background script đã ready chưa
 */
export class BackgroundHealth {
  private static readonly MAX_WAIT_TIME = 10000; // 10 seconds
  private static readonly CHECK_INTERVAL = 200; // 200ms

  /**
   * Wait cho background script sẵn sàng
   */
  public static async waitForReady(): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_WAIT_TIME) {
      try {
        const isReady = await this.checkHealth();
        if (isReady) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, this.CHECK_INTERVAL));
    }

    return false;
  }

  /**
   * Check background health với timeout
   */
  private static async checkHealth(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, 1000);

      try {
        chrome.runtime.sendMessage({ action: "ping" }, (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            resolve(false);
            return;
          }

          resolve(response?.success === true);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }

  /**
   * Send message với auto-retry và health check
   */
  public static async sendMessage<T = any>(
    message: any,
    options?: {
      maxRetries?: number;
      timeout?: number;
      waitForReady?: boolean;
    }
  ): Promise<T | null> {
    const {
      maxRetries = 3,
      timeout = 5000,
      waitForReady = true,
    } = options || {};

    // Wait for background ready nếu cần
    if (waitForReady) {
      const isReady = await this.waitForReady();
      if (!isReady) {
        throw new Error("Background script not ready after timeout");
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await new Promise<T | null>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Request timeout"));
          }, timeout);

          try {
            chrome.runtime.sendMessage(message, (response) => {
              clearTimeout(timeoutId);

              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || "";

                // Nếu là "Receiving end does not exist", retry
                if (errorMsg.includes("Receiving end does not exist")) {
                  reject(new Error("Background not ready"));
                } else {
                  reject(new Error(errorMsg));
                }
                return;
              }

              resolve(response as T);
            });
          } catch (sendError) {
            clearTimeout(timeoutId);
            reject(sendError);
          }
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        if (
          errorMessage.includes("Background not ready") ||
          errorMessage.includes("Receiving end does not exist")
        ) {
          if (attempt < maxRetries) {
            console.log(
              `[BackgroundHealth] 🔄 Retrying... (attempt ${attempt}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, attempt * 500));
            continue;
          }
        } else {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Failed to send message");
  }
}
