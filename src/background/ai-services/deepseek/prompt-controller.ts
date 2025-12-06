// src/background/ai-services/deepseek/prompt-controller.ts

import { browserAPI } from "../../utils/browser/browser-api";
import { StateController } from "./state-controller";
import { ChatController } from "./chat-controller";
import { TabStateManager } from "../../core/managers/tab-state";
import { encode } from "gpt-tokenizer";

/**
 * Prompt Controller - Xử lý gửi prompt và nhận response
 */
export class PromptController {
  private static activePollingTasks: Map<number, string> = new Map();
  private static tabStateManager = TabStateManager.getInstance();

  // Configuration
  private static readonly CONFIG = {
    maxPolls: 1500,
    pollInterval: 1000,
    initialDelay: 3000,
    maxRetries: 3,
    baseDelay: 200,
  };

  // Storage key cho folder tokens
  private static readonly FOLDER_TOKENS_KEY = "folderTokenAccumulator";
  private static folderTokenMutex: Map<string, Promise<void>> = new Map();

  /**
   * Tính tokens sử dụng gpt-tokenizer
   */
  private static calculateTokens(text: string): number {
    if (!text) {
      return 0;
    }

    try {
      const tokens = encode(text);
      return tokens.length;
    } catch (error) {
      console.error("[PromptController] ❌ Error calculating tokens:", error);

      // Fallback: word-based estimation
      const words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      return Math.ceil(words.length * 0.75); // ~0.75 tokens per word
    }
  }

  /**
   * Build final prompt - chỉ gửi message gốc từ WS
   */
  private static async buildFinalPrompt(
    systemPrompt: string | null | undefined,
    userPrompt: string
  ): Promise<string> {
    // Chỉ gửi trực tiếp message nhận được từ WS
    // Không thêm bất kỳ rules nào
    if (systemPrompt) {
      return `${systemPrompt}\n\n${userPrompt}`;
    }

    return userPrompt;
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
        // Thử initialize tab
        await this.initializeTab(tabId);
        const retryState = await this.tabStateManager.getTabState(tabId);

        if (!retryState) {
          return {
            isValid: false,
            error: `Failed to initialize tab ${tabId}`,
          };
        }

        if (retryState.status !== "free") {
          return {
            isValid: false,
            error: `Tab ${tabId} is currently ${retryState.status}`,
          };
        }

        return { isValid: true };
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
   * Initialize tab nếu chưa có state
   */
  private static async initializeTab(tabId: number): Promise<void> {
    try {
      // Lấy tab info
      const tab = await browserAPI.getTab(tabId);

      if (!tab || !tab.url?.includes("deepseek.com")) {
        return;
      }

      // Tạo initial state
      await this.determineInitialStatus(tabId, tab);

      // Lưu state
      await this.tabStateManager.markTabFree(tabId);
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error initializing tab ${tabId}:`,
        error
      );
    }
  }

  /**
   * Xác định initial status của tab
   */
  private static async determineInitialStatus(
    tabId: number,
    tab: any
  ): Promise<"free" | "busy" | "sleep"> {
    // Check sleep tab
    if (this.isSleepTab(tab)) {
      return "sleep";
    }

    // Check button state
    try {
      const isBusy = await this.checkButtonState(tabId);
      return isBusy ? "busy" : "free";
    } catch (error) {
      return "free";
    }
  }

  /**
   * Kiểm tra sleep tab
   */
  private static isSleepTab(tab: any): boolean {
    if (tab.discarded === true) {
      return true;
    }

    const title = tab.title || "";
    if (title.includes("💤")) {
      return true;
    }

    return false;
  }

  /**
   * Kiểm tra button state
   */
  private static async checkButtonState(tabId: number): Promise<boolean> {
    try {
      const scriptCode = `
        (function() {
          const sendButton = document.querySelector(".ds-icon-button._7436101");
          if (!sendButton) return { isBusy: false };
          
          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";
          
          const isStopIcon = pathData.includes("M2 4.88006");
          return { isBusy: !!isStopIcon };
        })();
      `;

      const result = await browserAPI.executeScript(
        tabId,
        () => {
          // Code sẽ được thực thi bởi executeScript
          return null;
        },
        [],
        scriptCode
      );

      const buttonState = result || { isBusy: false };
      return buttonState.isBusy;
    } catch (error) {
      return false;
    }
  }

  /**
   * Overload 1: Accept pre-combined prompt
   */
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  /**
   * Overload 2: Accept systemPrompt + userPrompt separately
   */
  static async sendPrompt(
    tabId: number,
    systemPrompt: string | null,
    userPrompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  /**
   * Gửi prompt tới DeepSeek tab
   */
  static async sendPrompt(
    tabId: number,
    promptOrSystemPrompt: string,
    userPromptOrRequestId: string,
    requestIdOrIsNewTask?: string | boolean,
    isNewTask?: boolean
  ): Promise<boolean> {
    let finalPrompt: string = "";
    let requestId: string = "unknown";
    let isNewTaskFlag: boolean = false;

    try {
      // Parse arguments
      if (typeof requestIdOrIsNewTask === "string") {
        const systemPrompt = promptOrSystemPrompt;
        const userPrompt = userPromptOrRequestId;
        requestId = requestIdOrIsNewTask;
        isNewTaskFlag = isNewTask === true;
        finalPrompt = await this.buildFinalPrompt(systemPrompt, userPrompt);
      } else {
        finalPrompt = promptOrSystemPrompt;
        requestId = userPromptOrRequestId;
        isNewTaskFlag = requestIdOrIsNewTask === true;
      }

      // Validate tab
      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        console.error(
          `[PromptController] ❌ Tab validation failed:`,
          validation.error
        );
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
      if (isNewTaskFlag) {
        await ChatController.clickNewChatButton(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Fill textarea
      const fillSuccess = await this.fillTextarea(tabId, finalPrompt);
      if (!fillSuccess) {
        await this.tabStateManager.markTabFree(tabId);
        return false;
      }

      // Click send button
      const clickSuccess = await this.clickSendButton(tabId);
      if (!clickSuccess) {
        await this.tabStateManager.markTabFree(tabId);
        return false;
      }

      // Start response polling
      this.activePollingTasks.set(tabId, requestId);
      this.startResponsePolling(tabId, requestId, finalPrompt);

      return true;
    } catch (error) {
      console.error(`[PromptController] ❌ Error sending prompt:`, error);
      await this.tabStateManager.markTabFree(tabId);
      return false;
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
              value: textarea.value.substring(0, 100),
            };
          },
          [prompt]
        );

        if (result && result.success) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.CONFIG.baseDelay)
          );
          return true;
        }
      } catch (error) {
        console.error(
          `[PromptController] ❌ Textarea fill attempt failed:`,
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

            // Check again after delay
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

      if (result && typeof result.then === "function") {
        // Handle promise from script
        const promiseResult = await result;
        return promiseResult.success === true;
      }

      return result?.success === true;
    } catch (error) {
      console.error(`[PromptController] ❌ Error clicking send button:`, error);
      return false;
    }
  }

  /**
   * Start response polling
   */
  private static startResponsePolling(
    tabId: number,
    requestId: string,
    originalPrompt: string = ""
  ): void {
    const poll = async () => {
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== requestId) {
        return;
      }

      try {
        const isGenerating = await StateController.isGenerating(tabId);

        if (!isGenerating) {
          // AI đã trả lời xong
          await this.handleResponseComplete(tabId, requestId, originalPrompt);
          this.activePollingTasks.delete(tabId);
          return;
        }

        // Tiếp tục polling
        setTimeout(poll, this.CONFIG.pollInterval);
      } catch (error) {
        console.error(`[PromptController] ❌ Polling error:`, error);
        this.activePollingTasks.delete(tabId);
        await this.tabStateManager.markTabFree(tabId);
      }
    };

    setTimeout(poll, this.CONFIG.initialDelay);
  }

  /**
   * Handle khi response hoàn thành
   */
  private static async handleResponseComplete(
    tabId: number,
    requestId: string,
    originalPrompt: string
  ): Promise<void> {
    try {
      // Lấy response
      const rawResponse = await this.getLatestResponseDirectly(tabId);

      // 🆕 LOG 1: Raw response từ DeepSeek tab
      console.log(`[PromptController] 📥 RAW RESPONSE`, rawResponse);

      if (!rawResponse) {
        await this.sendErrorResponse(tabId, requestId, "No response received");
        await this.tabStateManager.markTabFree(tabId);
        return;
      }

      // 🆕 LOG 2: Processed response sau khi xử lý
      console.log(`[PromptController] 🔄 PROCESSED RESPONSE`, rawResponse);

      // Lấy folderPath từ storage
      const folderPath = await this.getFolderPathForRequest(requestId);

      // Tính tokens
      const promptTokens = this.calculateTokens(originalPrompt);
      const completionTokens = this.calculateTokens(rawResponse);
      const totalTokens = promptTokens + completionTokens;

      // Lưu tokens nếu có folderPath
      if (folderPath) {
        await this.saveTokensForFolder(
          folderPath,
          promptTokens,
          completionTokens,
          totalTokens
        );

        await this.tabStateManager.markTabFreeWithFolder(tabId, folderPath);
      } else {
        await this.tabStateManager.markTabFree(tabId);
      }

      // Gửi response
      await this.sendSuccessResponse(tabId, requestId, rawResponse, {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });
    } catch (error) {
      console.error(`[PromptController] ❌ Error handling response:`, error);
      await this.sendErrorResponse(
        tabId,
        requestId,
        "Error processing response"
      );
      await this.tabStateManager.markTabFree(tabId);
    }
  }

  /**
   * Lấy response trực tiếp từ page
   */
  private static async getLatestResponseDirectly(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Tìm tất cả message containers
        const messageContainers =
          document.querySelectorAll('[class*="message"]');
        if (messageContainers.length === 0) return null;

        // Lấy container cuối cùng (mới nhất)
        const lastContainer = messageContainers[messageContainers.length - 1];

        // Tìm markdown content
        const markdown = lastContainer.querySelector(".ds-markdown");
        if (markdown) {
          return markdown.textContent?.trim() || null;
        }

        return lastContainer.textContent?.trim() || null;
      });

      return result;
    } catch (error) {
      console.error(`[PromptController] ❌ Error getting response:`, error);
      return null;
    }
  }

  /**
   * Lấy folderPath cho request
   */
  private static async getFolderPathForRequest(
    requestId: string
  ): Promise<string | null> {
    try {
      const messages = await browserAPI.getStorageValue<any>("wsMessages");
      if (!messages) return null;

      for (const [, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        const matchingMsg = msgs.find(
          (msg) => msg.data?.requestId === requestId
        );

        if (matchingMsg?.data?.folderPath) {
          return matchingMsg.data.folderPath;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Lưu tokens cho folder
   */
  private static async saveTokensForFolder(
    folderPath: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number
  ): Promise<void> {
    // Acquire mutex lock
    while (this.folderTokenMutex.has(folderPath)) {
      await this.folderTokenMutex.get(folderPath);
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.folderTokenMutex.set(folderPath, lockPromise);

    try {
      const currentAccumulator =
        (await browserAPI.getStorageValue<any>(
          this.FOLDER_TOKENS_KEY,
          "session"
        )) || {};
      const currentTokens = currentAccumulator[folderPath] || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      currentAccumulator[folderPath] = {
        prompt_tokens: currentTokens.prompt_tokens + promptTokens,
        completion_tokens: currentTokens.completion_tokens + completionTokens,
        total_tokens: currentTokens.total_tokens + totalTokens,
        lastUpdated: Date.now(),
      };

      await browserAPI.setStorageValue(
        this.FOLDER_TOKENS_KEY,
        currentAccumulator,
        "session"
      );
    } catch (error) {
      console.error(`[PromptController] ❌ Error saving tokens:`, error);
    } finally {
      this.folderTokenMutex.delete(folderPath);
      releaseLock!();
    }
  }

  /**
   * Gửi validation error
   */
  private static async sendValidationError(
    tabId: number,
    requestId: string,
    error: string
  ): Promise<void> {
    await this.sendErrorResponse(tabId, requestId, error);
  }

  /**
   * Gửi success response
   */
  private static async sendSuccessResponse(
    tabId: number,
    requestId: string,
    response: string,
    usage: any
  ): Promise<void> {
    try {
      const responseObject = this.buildOpenAIResponse(response, usage);

      console.log(
        `[PromptController] 🔧 BUILT JSON OBJECT for tab ${tabId}:`,
        responseObject
      );

      const folderPath = await this.getFolderPathForRequest(requestId);
      const responseString = JSON.stringify(responseObject);

      console.log(`[PromptController] 📤 SENDING JSON STRING:`, responseString);

      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: await this.getConnectionIdForRequest(requestId),
        data: {
          type: "promptResponse",
          requestId: requestId,
          tabId: tabId,
          success: true,
          response: responseString,
          folderPath: folderPath || null,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error sending success response:`,
        error
      );
    }
  }

  /**
   * Gửi error response
   */
  private static async sendErrorResponse(
    tabId: number,
    requestId: string,
    error: string
  ): Promise<void> {
    try {
      const folderPath = await this.getFolderPathForRequest(requestId);

      const errorObject = {
        type: "promptResponse",
        requestId: requestId,
        tabId: tabId,
        success: false,
        error: error,
        folderPath: folderPath || null,
        timestamp: Date.now(),
      };

      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: await this.getConnectionIdForRequest(requestId),
        data: errorObject,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error sending error response:`,
        error
      );
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

  /**
   * Build OpenAI response format
   */
  private static buildOpenAIResponse(content: string, usage: any): any {
    const generateHex = (length: number): string => {
      return Array.from({ length }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
    };

    return {
      id: `chatcmpl-${generateHex(16)}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: content,
          },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: usage,
      system_fingerprint: `fp_${generateHex(8)}`,
    };
  }

  /**
   * Clear tokens cho folder
   */
  static async clearTokensForFolder(folderPath: string): Promise<void> {
    try {
      const accumulator =
        (await browserAPI.getStorageValue<any>(
          this.FOLDER_TOKENS_KEY,
          "session"
        )) || {};

      if (accumulator[folderPath]) {
        delete accumulator[folderPath];
        await browserAPI.setStorageValue(
          this.FOLDER_TOKENS_KEY,
          accumulator,
          "session"
        );
      }
    } catch (error) {
      console.error(`[PromptController] ❌ Error clearing tokens:`, error);
    }
  }
}
