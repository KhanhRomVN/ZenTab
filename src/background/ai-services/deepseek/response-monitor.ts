// src/background/ai-services/deepseek/response-monitor.ts

import { browserAPI } from "../../utils/browser/browser-api";
import { TabStateManager } from "../../core/managers/tab-state";

/**
 * Response Monitor - Theo dõi và xử lý AI responses
 */
export class ResponseMonitor {
  private static activePollingTasks: Map<number, string> = new Map();
  private static tabStateManager = TabStateManager.getInstance();

  // Configuration
  private static readonly CONFIG = {
    maxPolls: 1500,
    pollInterval: 1000,
    initialDelay: 3000,
    maxResponseWait: 180000, // 3 minutes
  };

  /**
   * Start monitoring AI response
   */
  public static async startMonitoring(
    tabId: number,
    requestId: string,
    originalPrompt: string = ""
  ): Promise<void> {
    // Store active task
    this.activePollingTasks.set(tabId, requestId);

    // Start polling
    await this.startResponsePolling(tabId, requestId, originalPrompt);
  }

  /**
   * Stop monitoring cho một tab
   */
  public static stopMonitoring(tabId: number): void {
    this.activePollingTasks.delete(tabId);
  }

  /**
   * Kiểm tra xem đang monitor tab nào không
   */
  public static isMonitoring(tabId: number): boolean {
    return this.activePollingTasks.has(tabId);
  }

  /**
   * Start response polling
   */
  private static async startResponsePolling(
    tabId: number,
    requestId: string,
    originalPrompt: string = ""
  ): Promise<void> {
    const capturedRequestId = requestId;
    let pollCount = 0;
    let responseSent = false;

    const poll = async (): Promise<void> => {
      pollCount++;

      // Kiểm tra xem task có còn active không
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        return;
      }

      if (responseSent) {
        return;
      }

      // Kiểm tra timeout
      if (pollCount > this.CONFIG.maxPolls) {
        console.error(
          `[ResponseMonitor] ⏱️ Timeout waiting for response, requestId: ${capturedRequestId}`
        );
        await this.handleResponseTimeout(tabId, capturedRequestId);
        this.activePollingTasks.delete(tabId);
        return;
      }

      try {
        // Kiểm tra xem AI còn đang generate không
        const isGenerating = await this.isAIStillGenerating(tabId);

        if (!isGenerating) {
          // Kiểm tra button "Continue" trước khi lấy response
          const hasContinueButton = await this.checkContinueButton(tabId);

          if (hasContinueButton) {
            await this.handleContinueButtonDetected(
              tabId,
              capturedRequestId,
              originalPrompt
            );
            responseSent = true;
            this.activePollingTasks.delete(tabId);
            return;
          }

          // AI đã trả lời xong
          await this.handleResponseComplete(
            tabId,
            capturedRequestId,
            originalPrompt
          );
          responseSent = true;
          this.activePollingTasks.delete(tabId);
          return;
        }

        // Tiếp tục polling
        setTimeout(poll, this.CONFIG.pollInterval);
      } catch (error) {
        console.error(`[ResponseMonitor] ❌ Polling error:`, error);
        await this.handlePollingError(tabId, capturedRequestId, error);
        this.activePollingTasks.delete(tabId);
      }
    };

    // Bắt đầu polling sau initial delay
    setTimeout(poll, this.CONFIG.initialDelay);
  }

  /**
   * Kiểm tra AI còn đang generate không
   */
  private static async isAIStillGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const sendButton = document.querySelector(".ds-icon-button._7436101");
        if (!sendButton) {
          return { isGenerating: false };
        }

        const svg = sendButton.querySelector("svg");
        const path = svg?.querySelector("path");
        const pathData = path?.getAttribute("d") || "";

        const isStopIcon =
          pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");

        return { isGenerating: !!isStopIcon };
      });

      return result?.isGenerating || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra có button "Continue" không
   */
  private static async checkContinueButton(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const continueButton = document.querySelector(
          'button.ds-basic-button.ds-basic-button--outlined[role="button"]'
        ) as HTMLButtonElement;

        if (!continueButton) {
          return false;
        }

        const buttonText = continueButton.textContent?.trim() || "";
        return buttonText === "Continue";
      });

      return result || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle khi detect button "Continue"
   */
  private static async handleContinueButtonDetected(
    tabId: number,
    requestId: string,
    _originalPrompt: string
  ): Promise<void> {
    console.warn(
      `[ResponseMonitor] ⚠️ Continue button detected for request ${requestId}`
    );

    const errorContent = `❌ **LỖI: Response bị cắt cụt bởi DeepSeek**

**Nguyên nhân:**
DeepSeek đã dừng response và yêu cầu nhấn "Continue" để tiếp tục. Điều này xảy ra khi:
- Response quá dài và vượt quá giới hạn của DeepSeek
- DeepSeek phát hiện nội dung nhạy cảm hoặc vi phạm chính sách
- Có lỗi không mong muốn trong quá trình generate

**Khuyến nghị:**
1. Chia nhỏ task thành các phần nhỏ hơn
2. Yêu cầu response ngắn gọn hơn (tránh generate quá nhiều code một lúc)
3. Kiểm tra lại nội dung prompt có vi phạm chính sách của DeepSeek không

**Thời gian:** ${new Date().toISOString()}
**Request ID:** ${requestId}
**Tab ID:** ${tabId}`;

    await this.sendErrorResponse(
      tabId,
      requestId,
      errorContent,
      "CONTINUE_BUTTON_DETECTED"
    );
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
      // Lấy response từ page
      const rawResponse = await this.getResponseFromPage(tabId);

      if (!rawResponse) {
        await this.sendErrorResponse(
          tabId,
          requestId,
          "No response received from AI",
          "NO_RESPONSE"
        );
        return;
      }

      // Xử lý response
      const processedResponse = await this.processResponse(rawResponse);

      // Lấy folderPath từ storage
      const folderPath = await this.getFolderPathForRequest(requestId);

      // Gửi success response
      await this.sendSuccessResponse(
        tabId,
        requestId,
        processedResponse,
        originalPrompt,
        folderPath
      );
    } catch (error) {
      console.error(
        `[ResponseMonitor] ❌ Error handling response complete:`,
        error
      );
      await this.sendErrorResponse(
        tabId,
        requestId,
        "Error processing response",
        "PROCESSING_ERROR"
      );
    }
  }

  /**
   * Lấy response từ page
   */
  private static async getResponseFromPage(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Cuộn xuống cuối trang
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        // Tìm tất cả message containers
        const messageContainers =
          document.querySelectorAll('[class*="message"]');
        if (messageContainers.length === 0) {
          return null;
        }

        // Lấy container cuối cùng
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
      console.error(
        `[ResponseMonitor] ❌ Error getting response from page:`,
        error
      );
      return null;
    }
  }

  /**
   * Xử lý response
   */
  private static async processResponse(rawResponse: string): Promise<string> {
    // Decode HTML entities
    let processed = this.decodeHtmlEntities(rawResponse);

    // Fix XML structure
    processed = this.fixXmlStructure(processed);

    // Unwrap task progress blocks
    processed = this.unwrapTaskProgress(processed);

    // Remove UI artifacts
    processed = processed
      .replace(/\n*Copy\s*\n*/gi, "\n")
      .replace(/\n*Download\s*\n*/gi, "\n")
      .replace(/\btext\s*\n+/gi, "\n");

    // Clean code fences
    processed = processed
      .replace(/```\s*\n+(<[a-z_]+>)/gi, "$1")
      .replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

    // Clean up excessive newlines
    processed = processed.replace(/\n{3,}/g, "\n\n").trim();

    return processed;
  }

  /**
   * Decode HTML entities
   */
  private static decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      "&lt;": "<",
      "&gt;": ">",
      "&amp;": "&",
      "&quot;": '"',
      "&#39;": "'",
      "&#x27;": "'",
      "&#x2F;": "/",
      "&#60;": "<",
      "&#62;": ">",
      "&nbsp;": " ",
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.split(entity).join(char);
    }

    // Handle numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
      String.fromCharCode(parseInt(num, 10))
    );

    // Handle hex entities
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    return decoded;
  }

  /**
   * Fix XML structure
   */
  private static fixXmlStructure(content: string): string {
    return content.replace(/(<\/[a-z_]+>)(<[a-z_]+>)/g, "$1\n$2");
  }

  /**
   * Unwrap task progress blocks
   */
  private static unwrapTaskProgress(content: string): string {
    const textBlockPattern =
      /```text[\s\S]*?(<task_progress>[\s\S]*?<\/task_progress>)[\s\S]*?```/g;

    let unwrapped = content.replace(textBlockPattern, "$1");
    unwrapped = unwrapped.replace(
      /(Copy\s*(?:Download)?\s*\n+)(<[a-z_]+>)/gi,
      "$2"
    );

    return unwrapped;
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
   * Gửi success response
   */
  private static async sendSuccessResponse(
    tabId: number,
    requestId: string,
    response: string,
    originalPrompt: string,
    folderPath: string | null
  ): Promise<void> {
    try {
      // Tính tokens
      const promptTokens = this.calculateTokens(originalPrompt);
      const completionTokens = this.calculateTokens(response);
      const totalTokens = promptTokens + completionTokens;

      // Tạo response object
      const responseObject = this.buildOpenAIResponse(response, {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });

      // Mark tab as free
      if (folderPath) {
        await this.tabStateManager.markTabFreeWithFolder(tabId, folderPath);
      } else {
        await this.tabStateManager.markTabFree(tabId);
      }

      // Gửi qua WebSocket
      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: await this.getConnectionIdForRequest(requestId),
        data: {
          type: "promptResponse",
          requestId: requestId,
          tabId: tabId,
          success: true,
          response: JSON.stringify(responseObject),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(
        `[ResponseMonitor] ❌ Error sending success response:`,
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
    error: string,
    errorType: string
  ): Promise<void> {
    try {
      // Mark tab as free
      await this.tabStateManager.markTabFree(tabId);

      // Gửi error qua WebSocket
      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: await this.getConnectionIdForRequest(requestId),
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
      console.error(
        `[ResponseMonitor] ❌ Error sending error response:`,
        error
      );
    }
  }

  /**
   * Handle response timeout
   */
  private static async handleResponseTimeout(
    tabId: number,
    requestId: string
  ): Promise<void> {
    await this.sendErrorResponse(
      tabId,
      requestId,
      "Response timeout - AI took too long to respond",
      "TIMEOUT"
    );
  }

  /**
   * Handle polling error
   */
  private static async handlePollingError(
    tabId: number,
    requestId: string,
    error: any
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown polling error";

    await this.sendErrorResponse(
      tabId,
      requestId,
      errorMessage,
      "POLLING_ERROR"
    );
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
   * Tính tokens sử dụng gpt-tokenizer
   */
  private static calculateTokens(text: string): number {
    if (!text) {
      return 0;
    }

    try {
      // Sử dụng gpt-tokenizer
      // Note: Cần import encode từ "gpt-tokenizer"
      const { encode } = require("gpt-tokenizer");
      const tokens = encode(text);
      return tokens.length;
    } catch (error) {
      // Fallback: word-based estimation
      const words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      return Math.ceil(words.length * 0.75);
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
}
