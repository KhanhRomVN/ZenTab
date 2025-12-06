// src/background/ai-services/deepseek/prompt-handler.ts

import { browserAPI } from "../../utils/browser/browser-api";
import { TabStateManager } from "../../core/managers/tab-state";
import { ChatController } from "./chat-controller";
import { ResponseMonitor } from "./response-monitor";
import { PromptBuilder } from "./prompt-builder";

/**
 * Prompt Handler - Xử lý gửi prompt tới DeepSeek
 */
export class PromptHandler {
  private static tabStateManager = TabStateManager.getInstance();

  // Configuration
  private static readonly CONFIG = {
    maxRetries: 3,
    baseDelay: 200,
    initialDelay: 1500,
    textareaCheckDelay: 1000,
  };

  /**
   * Gửi prompt tới DeepSeek tab
   */
  public static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean> {
    try {
      // Validate tab
      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        await this.sendValidationError(
          tabId,
          requestId,
          validation.error || "Validation failed"
        );
        return false;
      }

      // Mark tab as busy
      await this.tabStateManager.markTabBusy(tabId, requestId);

      // Create new chat nếu cần
      if (isNewTask === true) {
        await ChatController.clickNewChatButton(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Fill textarea
      const fillSuccess = await this.fillTextarea(tabId, prompt);
      if (!fillSuccess) {
        await this.handleTextareaFillFailure(tabId, requestId);
        return false;
      }

      // Click send button
      const clickSuccess = await this.clickSendButton(tabId);
      if (!clickSuccess) {
        await this.handleSendButtonFailure(tabId, requestId);
        return false;
      }

      // Start response monitoring
      await ResponseMonitor.startMonitoring(tabId, requestId, prompt);

      return true;
    } catch (error) {
      console.error(`[PromptHandler] ❌ Error sending prompt:`, error);
      await this.tabStateManager.markTabFree(tabId);
      return false;
    }
  }

  /**
   * Validate tab trước khi gửi prompt
   */
  private static async validateTab(
    tabId: number
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const tab = await browserAPI.getTab(tabId);

      if (!tab.url?.startsWith("https://chat.deepseek.com")) {
        return {
          isValid: false,
          error: `Tab is not DeepSeek page: ${tab.url}`,
        };
      }

      const tabState = await this.tabStateManager.getTabState(tabId);

      if (!tabState) {
        return {
          isValid: false,
          error: `Tab ${tabId} state not found`,
        };
      }

      if (tabState.status !== "free") {
        return {
          isValid: false,
          error: `Tab ${tabId} is currently ${tabState.status}`,
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fill textarea với prompt
   */
  private static async fillTextarea(
    tabId: number,
    prompt: string
  ): Promise<boolean> {
    let retries = this.CONFIG.maxRetries;

    while (retries > 0) {
      try {
        const result = await browserAPI.executeScript(
          tabId,
          (text: string) => {
            const textarea = document.querySelector(
              'textarea[placeholder="Message DeepSeek"]'
            ) as HTMLTextAreaElement;

            if (!textarea) {
              return { success: false, reason: "textarea_not_found" };
            }

            // Focus textarea
            textarea.focus();

            // Set value
            textarea.value = text;

            // Dispatch events
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              data: text,
              inputType: "insertText",
            });
            textarea.dispatchEvent(inputEvent);

            const changeEvent = new Event("change", { bubbles: true });
            textarea.dispatchEvent(changeEvent);

            // Trigger React's internal event system
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              "value"
            )?.set;

            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(textarea, text);
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }

            return {
              success: true,
              valueLength: textarea.value.length,
            };
          },
          [prompt]
        );

        if (result && result.success) {
          // Wait for textarea to update
          await new Promise((resolve) =>
            setTimeout(resolve, this.CONFIG.textareaCheckDelay)
          );

          // Verify textarea value
          const verifyResult = await browserAPI.executeScript(tabId, () => {
            const textarea = document.querySelector(
              'textarea[placeholder="Message DeepSeek"]'
            ) as HTMLTextAreaElement;
            return textarea?.value.length || 0;
          });

          if (verifyResult && verifyResult > 0) {
            return true;
          }
        }
      } catch (error) {
        console.error(
          `[PromptHandler] ❌ Textarea fill attempt failed:`,
          error
        );
      }

      retries--;
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return false;
  }

  /**
   * Click send button
   */
  private static async clickSendButton(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const sendButton = document.querySelector(
          ".ds-icon-button._7436101"
        ) as HTMLButtonElement;

        if (!sendButton) {
          return { success: false, reason: "button_not_found" };
        }

        const isDisabled = sendButton.classList.contains(
          "ds-icon-button--disabled"
        );

        if (isDisabled) {
          // Try to enable button
          const textarea = document.querySelector(
            'textarea[placeholder="Message DeepSeek"]'
          ) as HTMLTextAreaElement;

          if (textarea && textarea.value) {
            // Re-focus và trigger events
            textarea.focus();
            textarea.blur();
            textarea.focus();

            const events = [
              new Event("input", { bubbles: true }),
              new Event("change", { bubbles: true }),
              new Event("keyup", { bubbles: true }),
              new Event("keydown", { bubbles: true }),
            ];

            events.forEach((event) => textarea.dispatchEvent(event));

            // Check lại button state sau delay
            return new Promise((resolve) => {
              setTimeout(() => {
                const stillDisabled = sendButton.classList.contains(
                  "ds-icon-button--disabled"
                );

                if (stillDisabled) {
                  resolve({ success: false, reason: "button_still_disabled" });
                } else {
                  sendButton.click();
                  resolve({ success: true });
                }
              }, 500);
            });
          }

          return { success: false, reason: "button_disabled" };
        }

        sendButton.click();
        return { success: true };
      });

      // Handle promise result từ script
      if (result && typeof result.then === "function") {
        const promiseResult = await result;
        return promiseResult.success === true;
      }

      return result?.success === true;
    } catch (error) {
      console.error(`[PromptHandler] ❌ Error clicking send button:`, error);
      return false;
    }
  }

  /**
   * Handle textarea fill failure
   */
  private static async handleTextareaFillFailure(
    tabId: number,
    requestId: string
  ): Promise<void> {
    console.error(`[PromptHandler] ❌ Textarea fill failed for tab ${tabId}`);

    await this.sendErrorResponse(
      tabId,
      requestId,
      "Failed to fill textarea",
      "TEXTAREA_FILL_FAILED"
    );

    await this.tabStateManager.markTabFree(tabId);
  }

  /**
   * Handle send button failure
   */
  private static async handleSendButtonFailure(
    tabId: number,
    requestId: string
  ): Promise<void> {
    console.error(
      `[PromptHandler] ❌ Send button click failed for tab ${tabId}`
    );

    await this.sendErrorResponse(
      tabId,
      requestId,
      "Failed to click send button",
      "SEND_BUTTON_FAILED"
    );

    await this.tabStateManager.markTabFree(tabId);
  }

  /**
   * Gửi validation error
   */
  private static async sendValidationError(
    tabId: number,
    requestId: string,
    error: string
  ): Promise<void> {
    await this.sendErrorResponse(tabId, requestId, error, "VALIDATION_FAILED");
  }

  /**
   * Gửi error response
   */
  private static async sendErrorResponse(
    tabId: number,
    requestId: string,
    error: string,
    errorType: string
  ): Promise<void> {
    try {
      // Lấy connectionId từ storage
      const connectionId = await this.getConnectionIdForRequest(requestId);

      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: connectionId,
        data: {
          type: "promptResponse",
          requestId: requestId,
          tabId: tabId,
          success: false,
          error: error,
          errorType: errorType,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`[PromptHandler] ❌ Error sending error response:`, error);
    }
  }

  /**
   * Lấy connectionId cho request
   */
  private static async getConnectionIdForRequest(
    requestId: string
  ): Promise<string> {
    try {
      const messages = await browserAPI.getStorageValue<any>("wsMessages");
      if (!messages) return "default";

      for (const [connId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        const matchingMsg = msgs.find(
          (msg) => msg.data?.requestId === requestId
        );

        if (matchingMsg) {
          return connId;
        }
      }

      return "default";
    } catch (error) {
      return "default";
    }
  }
}
