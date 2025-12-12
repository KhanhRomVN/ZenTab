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
    initialDelay: 1000,
    maxRetries: 3,
    baseDelay: 200,
    generationStartTimeout: 15000, // Timeout để đợi AI bắt đầu generate
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
   * Gửi prompt tới DeepSeek tab
   */
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean,
    conversationId?: string,
    connectionId?: string
  ): Promise<boolean> {
    try {
      // 🔥 Lưu originalPrompt để dùng sau
      const originalPrompt = prompt;

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

      // 🆕 CONVERSATION VALIDATION (Strict Mode)

      if (conversationId) {
        if (isNewTask === true) {
          // First request: Link tab to conversation
          const linkSuccess = await this.tabStateManager.linkTabToConversation(
            tabId,
            conversationId
          );

          // 🆕 Link to folder if exists
          const folderPath = await this.getFolderPathForRequest(requestId);
          if (folderPath) {
            await this.tabStateManager.linkTabToFolder(tabId, folderPath);
          }

          if (!linkSuccess) {
            console.error(
              `[PromptController] ❌ Failed to link tab ${tabId} to conversation ${conversationId}`
            );
            await this.sendErrorResponse(
              tabId,
              requestId,
              "Failed to link tab to conversation",
              "CONVERSATION_LINK_FAILED"
            );
            return false;
          }
          console.log(
            `[PromptController] ✅ First request - Linked tab ${tabId} to conversation ${conversationId}`
          );
        } else {
          // Subsequent request: Validate conversation exists and matches tab
          const linkedTab = await this.tabStateManager.getTabByConversation(
            conversationId
          );

          if (!linkedTab) {
            console.error(
              `[PromptController] ❌ Conversation ${conversationId} not found`
            );
            await this.sendErrorResponse(
              tabId,
              requestId,
              `Conversation không tồn tại. Vui lòng bắt đầu conversation mới.`,
              "CONVERSATION_NOT_FOUND"
            );
            return false;
          }

          if (linkedTab.tabId !== tabId) {
            console.error(
              `[PromptController] ❌ Conversation ${conversationId} is linked to tab ${linkedTab.tabId}, not tab ${tabId}`
            );
            await this.sendErrorResponse(
              tabId,
              requestId,
              `Conversation đã chuyển sang tab khác (Tab ${linkedTab.tabId}). Vui lòng quay lại tab gốc hoặc bắt đầu conversation mới.`,
              "CONVERSATION_TAB_MISMATCH"
            );
            return false;
          }
        }

        // Store conversationId mapping for later retrieval
        const conversationMappingKey = `conversationId_${requestId}`;
        await browserAPI.setStorageValue(
          conversationMappingKey,
          conversationId
        );

        // 🆕 Store connectionId mapping for accurate routing
        if (connectionId) {
          const connectionMappingKey = `connectionId_${requestId}`;
          await browserAPI.setStorageValue(connectionMappingKey, connectionId);

          // Schedule cleanup
          setTimeout(() => {
            const browserAPICleanup = this.getBrowserAPI();
            browserAPICleanup.storage.local.remove([connectionMappingKey]);
          }, 300000);
        }

        // Schedule cleanup after 5 minutes
        setTimeout(() => {
          const browserAPICleanup = this.getBrowserAPI();
          browserAPICleanup.storage.local.remove([conversationMappingKey]);
        }, 300000);
      }

      // Mark tab as busy
      await this.tabStateManager.markTabBusy(tabId, requestId);

      // 🔥 Notify UI: Request started (for optimistic updates)
      try {
        await browserAPI.sendMessage({
          action: "requestStarted",
          tabId: tabId,
          requestId: requestId,
        });
      } catch (error) {
        // Silent fail - UI notification is not critical
      }

      // Create new chat nếu cần
      if (isNewTask === true) {
        await ChatController.clickNewChatButton(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Fill textarea
      const fillSuccess = await this.fillTextarea(tabId, prompt);
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

      // 🆕 Đợi AI thực sự bắt đầu generate
      const generationStarted = await this.waitForGenerationStart(tabId);
      if (!generationStarted) {
        console.error(
          `[PromptController] ❌ AI didn't start generating within ${this.CONFIG.generationStartTimeout}ms. Aborting.`
        );

        // 🔥 Gửi error về Zen
        await this.sendErrorResponse(
          tabId,
          requestId,
          `AI không bắt đầu generate sau ${
            this.CONFIG.generationStartTimeout / 1000
          }s. Vui lòng thử lại hoặc chọn tab khác.`,
          "GENERATION_START_TIMEOUT"
        );

        await this.tabStateManager.markTabFree(tabId);

        // 🔥 Notify UI: Request completed (error case)
        try {
          await browserAPI.sendMessage({
            action: "requestCompleted",
            tabId: tabId,
            requestId: requestId,
          });
        } catch (error) {
          // Silent fail
        }

        return false;
      }

      // 🔥 Gửi WebSocket message báo đã chuyển sang trạng thái đợi response
      console.log(
        `[PromptController] ✅ GENERATION STARTED - tabId: ${tabId}, requestId: ${requestId}`
      );

      // Get folderPath for multi-workspace filtering
      const folderPathForPing = await this.getFolderPathForRequest(requestId);

      // 🆕 PING to Zen
      await this.sendPingToZen(
        tabId,
        requestId,
        conversationId,
        folderPathForPing,
        connectionId
      );

      // Then send generationStarted
      await this.notifyZenGenerationStarted(tabId, requestId);

      // Start response polling

      this.activePollingTasks.set(tabId, requestId);
      this.startResponsePolling(tabId, requestId, originalPrompt);

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
   * Đợi cho đến khi AI thực sự bắt đầu generate (button = stop icon)
   */
  private static async waitForGenerationStart(tabId: number): Promise<boolean> {
    const timeout = this.CONFIG.generationStartTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const isGenerating = await StateController.isGenerating(tabId);

        if (isGenerating) {
          // const elapsedTime = Date.now() - startTime;
          return true;
        }

        // Check mỗi 200ms
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(
          `[PromptController] ❌ Error checking generation status:`,
          error
        );
        // Continue checking despite errors
      }
    }

    console.warn(
      `[PromptController] ⚠️ AI didn't start generating within ${timeout}ms. Proceeding with polling anyway.`
    );
    return false;
  }

  /**
   * 🆕 PING to Zen: Gửi ping khi AI bắt đầu generate
   */
  public static async sendPingToZen(
    tabId: number,
    requestId: string,
    conversationId?: string,
    folderPath?: string | null,
    connectionId?: string
  ): Promise<void> {
    try {
      // Use provided connectionId or get from request
      const connId =
        connectionId || (await this.getConnectionIdForRequest(requestId));

      const pingMessage = {
        connectionId: connId,
        data: {
          type: "conversationPing", // 🔥 Changed from "ping" to avoid conflict with system ping
          conversationId: conversationId,
          tabId: tabId,
          requestId: requestId,
          folderPath: folderPath || null, // 🆕 Add folderPath for multi-workspace filtering
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };

      await browserAPI.setStorageValue("wsOutgoingMessage", pingMessage);
    } catch (error) {
      console.error(`[PromptController] ❌ Failed to send ping:`, error);
    }
  }

  /**
   * 🆕 Handle PONG from Zen
   * Note: Heartbeat start/update logic is handled in storage-change-handler
   */
  public static async handlePongFromZen(
    _tabId: number,
    _conversationId: string,
    _folderPath?: string | null
  ): Promise<void> {
    // Heartbeat logic is handled in storage-change-handler based on requestId
    // First pong (req-*) → startHeartbeat()
    // Heartbeat pong (heartbeat-*) → handlePongReceived()
  }

  /**
   * 🔥 Thông báo cho Zen rằng AI đã bắt đầu generate
   */
  private static async notifyZenGenerationStarted(
    tabId: number,
    requestId: string
  ): Promise<void> {
    try {
      const connectionId = await this.getConnectionIdForRequest(requestId);

      await browserAPI.setStorageValue("wsOutgoingMessage", {
        connectionId: connectionId,
        data: {
          type: "generationStarted",
          requestId: requestId,
          tabId: tabId,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`[PromptController] ❌ Failed to notify Zen:`, error);
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
          console.log(
            `[PromptController] ✅ GENERATION COMPLETE - tabId: ${tabId}, requestId: ${requestId}`
          );
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
      // STEP 1: Lấy raw response từ page (multi-line)
      const rawResponse = await this.getLatestResponseDirectly(tabId);

      // LOG 1: Raw HTML content (multi-line - preserve format)

      if (!rawResponse) {
        await this.sendErrorResponse(tabId, requestId, "No response received");
        await this.tabStateManager.markTabFree(tabId);
        return;
      }

      // STEP 2: Process response (multi-line)
      let processedResponse = this.decodeHtmlEntities(rawResponse);
      processedResponse = this.fixXmlStructure(processedResponse);
      processedResponse = this.unwrapTaskProgress(processedResponse);

      // Remove UI artifacts
      processedResponse = processedResponse
        .replace(/\n*Copy\s*\n*/gi, "\n")
        .replace(/\n*Download\s*\n*/gi, "\n")
        .replace(/\btext\s*\n+/gi, "\n");

      // Clean code fences
      processedResponse = this.cleanSearchReplaceCodeFences(processedResponse);
      processedResponse = this.cleanContentCodeFences(processedResponse);

      // Remove excessive newlines
      processedResponse = processedResponse
        .replace(/```\s*\n+(<[a-z_]+>)/gi, "$1")
        .replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

      // Ensure proper newlines around closing tags
      processedResponse = processedResponse.replace(
        /([^\n])(<\/[a-z_]+>)/g,
        "$1\n$2"
      );
      processedResponse = processedResponse.replace(
        /(<\/[a-z_]+>)(<\/[a-z_]+>)/g,
        "$1\n$2"
      );

      // Clean up excessive newlines (keep max 2)
      processedResponse = processedResponse.replace(/\n{3,}/g, "\n\n").trim();

      // LOG 2: Processed response (multi-line - preserve format)

      // STEP 3: Lấy folderPath từ storage
      const folderPath = await this.getFolderPathForRequest(requestId);

      // STEP 3.5: Lấy conversationId từ storage
      const conversationId = await this.getConversationIdForRequest(requestId);

      // STEP 4: Tính tokens
      const promptTokens = this.calculateTokens(originalPrompt);
      const completionTokens = this.calculateTokens(processedResponse);
      const totalTokens = promptTokens + completionTokens;

      // STEP 5: Lưu tokens nếu có folderPath
      if (folderPath) {
        await this.saveTokensForFolder(
          folderPath,
          promptTokens,
          completionTokens,
          totalTokens
        );
      }

      // STEP 5.5: Mark tab free with conversationId (if exists) or folderPath
      if (conversationId) {
        await this.tabStateManager.markTabFreeWithConversation(
          tabId,
          conversationId
        );
      } else if (folderPath) {
        await this.tabStateManager.markTabFreeWithFolder(tabId, folderPath);
      } else {
        await this.tabStateManager.markTabFree(tabId);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // STEP 6: Build OpenAI response (với processedResponse đã clean)
      const responseObject = this.buildOpenAIResponse(processedResponse, {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });

      // console.log(
      //   `[PromptController] 🔧 BUILT JSON OBJECT for tab ${tabId}:`,
      //   responseObject
      // );

      // STEP 7: Convert JSON to string
      const responseString = JSON.stringify(responseObject);

      // console.log(`[PromptController] 📤 SENDING JSON STRING:`, responseString);

      // STEP 8: Gửi qua WebSocket
      const connectionId = await this.getConnectionIdForRequest(requestId);

      console.log(`[PromptController] 📤 Sending promptResponse:`, {
        requestId,
        tabId,
        folderPath,
        connectionId,
        responseLength: responseString.length,
      });

      const outgoingMessage = {
        connectionId: connectionId,
        data: {
          type: "promptResponse",
          requestId: requestId,
          tabId: tabId,
          success: true,
          response: responseString,
          folderPath: folderPath || null, // 🔥 CRITICAL: Must not be undefined
          connectionId: connectionId, // 🆕 Include connectionId in data for routing
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };

      // 🔍 DEBUG: Verify connectionId is in both wrapper and data
      console.log(`[PromptController] 🔍 VERIFY connectionId in message:`, {
        wrapperConnectionId: outgoingMessage.connectionId,
        dataConnectionId: outgoingMessage.data.connectionId,
        areEqual:
          outgoingMessage.connectionId === outgoingMessage.data.connectionId,
      });

      await browserAPI.setStorageValue("wsOutgoingMessage", outgoingMessage);

      // 🔥 Notify UI: Request completed (for optimistic updates)
      try {
        await browserAPI.sendMessage({
          action: "requestCompleted",
          tabId: tabId,
          requestId: requestId,
        });
      } catch (error) {
        // Silent fail - UI notification is not critical
      }
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
        // Cuộn xuống cuối trang
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        // Tìm tất cả message containers
        const possibleSelectors = [
          '[class*="message"]',
          '[class*="chat-message"]',
          '[class*="conversation"]',
          ".ds-markdown",
        ];

        let allMessages: Element[] = [];
        for (const selector of possibleSelectors) {
          const found = Array.from(document.querySelectorAll(selector));
          if (found.length > 0) {
            allMessages = found;
            break;
          }
        }

        if (allMessages.length === 0) {
          return null;
        }

        // Lọc ra CHỈ CÁC AI RESPONSES
        const aiResponses = allMessages.filter((msg) => {
          const hasMarkdown = msg.querySelector(".ds-markdown") !== null;
          const hasContent = msg.classList && !msg.classList.contains("user");
          return hasMarkdown || hasContent;
        });

        if (aiResponses.length === 0) {
          return null;
        }

        // Lấy AI response CUỐI CÙNG
        const lastAIResponse = aiResponses[aiResponses.length - 1];
        const lastMarkdown =
          lastAIResponse.querySelector(".ds-markdown") || lastAIResponse;

        if (!lastMarkdown) {
          return null;
        }

        // Extract markdown content
        const extractMarkdown = (element: Element): string => {
          let result = "";

          const traverse = (node: Node): void => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent || "";
              const safeText = String(text);

              if (
                safeText.includes("<task_progress>") ||
                safeText.includes("</task_progress>")
              ) {
                result += safeText;
                return;
              }

              result += safeText;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              const tag = el.tagName.toLowerCase();
              const className = String(el.className || "");

              // Xử lý ds-markdown-html spans (chứa XML tags)
              if (className.includes("ds-markdown-html")) {
                const htmlContent = String(el.textContent || "");

                if (htmlContent.startsWith("</") && !result.endsWith("\n")) {
                  result += "\n";
                }

                result += htmlContent;
                return;
              }

              // Handle line breaks
              if (tag === "br") {
                result += "\n";
                return;
              }

              // Handle code blocks
              if (tag === "pre") {
                const codeEl = el.querySelector("code");
                if (codeEl) {
                  const lang =
                    codeEl.className.match(/language-(\w+)/)?.[1] || "";
                  result += "```" + lang + "\n";
                  result += codeEl.textContent || "";
                  result += "\n```\n";
                } else {
                  result += "```\n";
                  result += el.textContent || "";
                  result += "\n```\n";
                }
                return;
              }

              // Handle inline code
              if (
                tag === "code" &&
                el.parentElement?.tagName.toLowerCase() !== "pre"
              ) {
                result += "`" + (el.textContent || "") + "`";
                return;
              }

              // Handle lists
              if (tag === "ul" || tag === "ol") {
                const items = Array.from(el.children);

                items.forEach((item, index) => {
                  if (item.tagName.toLowerCase() === "li") {
                    const checkbox = item.querySelector(
                      'input[type="checkbox"]'
                    ) as HTMLInputElement | null;

                    if (checkbox) {
                      const isChecked = checkbox.checked;
                      result += isChecked ? "- [x] " : "- [ ] ";

                      const textNodes: string[] = [];
                      const extractText = (n: Node): void => {
                        if (n.nodeType === Node.TEXT_NODE) {
                          const text = (n.textContent || "").trim();
                          if (text) {
                            textNodes.push(text);
                          }
                        } else if (n.nodeType === Node.ELEMENT_NODE) {
                          const elem = n as Element;
                          if (elem.tagName.toLowerCase() !== "input") {
                            Array.from(elem.childNodes).forEach(extractText);
                          }
                        }
                      };
                      Array.from(item.childNodes).forEach(extractText);
                      result += textNodes.join("").trim() + "\n";
                    } else {
                      if (tag === "ol") {
                        result += `${index + 1}. `;
                      } else {
                        result += "- ";
                      }

                      Array.from(item.childNodes).forEach((child) => {
                        if (child.nodeType === Node.TEXT_NODE) {
                          result += child.textContent || "";
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                          const childEl = child as Element;
                          const childTag = childEl.tagName.toLowerCase();

                          if (childTag === "p") {
                            traverse(child);
                            if (result.endsWith("\n\n")) {
                              result = result.slice(0, -2);
                            }
                          } else {
                            traverse(child);
                          }
                        }
                      });
                      result += "\n";
                    }
                  }
                });
                return;
              }

              // Handle headings
              if (tag.match(/^h[1-6]$/)) {
                const level = parseInt(tag[1]);
                result += "#".repeat(level) + " ";
                Array.from(el.childNodes).forEach(traverse);
                result += "\n\n";
                return;
              }

              // Handle paragraphs
              if (tag === "p") {
                Array.from(el.childNodes).forEach(traverse);
                if (el.textContent && el.textContent.trim()) {
                  result += "\n\n";
                }
                return;
              }

              // Handle blockquotes
              if (tag === "blockquote") {
                const lines = (el.textContent || "").split("\n");
                lines.forEach((line) => {
                  if (line.trim()) {
                    result += "> " + line + "\n";
                  }
                });
                result += "\n";
                return;
              }

              // Handle bold
              if (tag === "strong" || tag === "b") {
                result += "**";
                Array.from(el.childNodes).forEach(traverse);
                result += "**";
                return;
              }

              // Handle italic
              if (tag === "em" || tag === "i") {
                result += "*";
                Array.from(el.childNodes).forEach(traverse);
                result += "*";
                return;
              }

              // Handle divs and other containers
              Array.from(el.childNodes).forEach(traverse);

              const blockElements = [
                "div",
                "section",
                "article",
                "header",
                "footer",
                "main",
              ];
              if (blockElements.includes(tag)) {
                result += "\n";
              }
            }
          };

          traverse(element);
          return result;
        };

        let markdownText = extractMarkdown(lastMarkdown);

        // Clean up formatting
        markdownText = markdownText
          .replace(/\n+(<\/?\w+>)/g, "\n$1")
          .replace(/ {2,}/g, " ")
          .replace(/(<task_progress>)\s+(-)/g, "$1\n$2")
          .replace(/(-\s*\[\s*[x ]\s*\][^\n]*)\s+(-)/g, "$1\n$2")
          .replace(
            /(-\s*\[\s*[x ]\s*\][^\n<]*?)(<\/(?!path|thinking|read_file|write_file)\w+>)/g,
            "$1\n$2"
          )
          .replace(
            /(<\/task_progress>)(<\/(?:read_file|write_file|execute_command)>)/g,
            "$1$2"
          );

        return markdownText;
      });

      if (!result || typeof result !== "string") {
        return null;
      }

      return result;
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error getting latest response:`,
        error
      );
      return null;
    }
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

    unwrapped = unwrapped.replace(/\btext\s*\n+(<[a-z_]+>)/gi, "$1");
    unwrapped = unwrapped.replace(
      /```\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g,
      "$1"
    );

    unwrapped = unwrapped.replace(/```\s*\n+(<[a-z_]+>)/gi, "$1");
    unwrapped = unwrapped.replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

    return unwrapped;
  }

  /**
   * Clean SEARCH/REPLACE code fences
   */
  private static cleanSearchReplaceCodeFences(content: string): string {
    const diffBlockPattern = /<diff>([\s\S]*?)<\/diff>/g;
    const CODE_FENCE = "```";
    const UI_ARTIFACTS = ["text", "copy", "download"];

    return content.replace(diffBlockPattern, (_match, diffContent) => {
      const lines = diffContent.split("\n");
      const searchMarker = "<<<<<<< SEARCH";
      const separatorMarker = "=======";
      const replaceMarker = "> REPLACE";

      let searchIdx = -1;
      let separatorIdx = -1;
      let replaceIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchMarker)) searchIdx = i;
        if (lines[i].includes(separatorMarker)) separatorIdx = i;
        if (lines[i].includes(replaceMarker)) replaceIdx = i;
      }

      if (searchIdx === -1 || separatorIdx === -1 || replaceIdx === -1) {
        return `<diff>${diffContent}</diff>`;
      }

      const linesToRemove = new Set<number>();

      // Xóa dòng trống sau search marker
      if (searchIdx + 1 < lines.length && lines[searchIdx + 1].trim() === "") {
        linesToRemove.add(searchIdx + 1);
      }

      // Sau search marker: tìm code fence
      for (let i = searchIdx + 1; i < separatorIdx; i++) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }
        const isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
        if (trimmed !== "" && !isUIArtifact) {
          break;
        }
      }

      // Xóa dòng trống trước separator
      if (separatorIdx - 1 >= 0 && lines[separatorIdx - 1].trim() === "") {
        linesToRemove.add(separatorIdx - 1);
      }

      // Trước separator: tìm code fence
      for (let i = separatorIdx - 1; i > searchIdx; i--) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }
        if (trimmed !== "") {
          break;
        }
      }

      // Xóa dòng trống sau separator
      if (
        separatorIdx + 1 < lines.length &&
        lines[separatorIdx + 1].trim() === ""
      ) {
        linesToRemove.add(separatorIdx + 1);
      }

      // Sau separator: tìm code fence
      for (let i = separatorIdx + 1; i < replaceIdx; i++) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }
        const isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
        if (trimmed !== "" && !isUIArtifact) {
          break;
        }
      }

      // Xóa dòng trống trước replace marker
      if (replaceIdx - 1 >= 0 && lines[replaceIdx - 1].trim() === "") {
        linesToRemove.add(replaceIdx - 1);
      }

      // Trước replace marker: tìm code fence
      for (let i = replaceIdx - 1; i > separatorIdx; i--) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }
        if (trimmed !== "") {
          break;
        }
      }

      const cleanedLines = lines.filter(
        (_: string, idx: number) => !linesToRemove.has(idx)
      );

      return `<diff>${cleanedLines.join("\n")}</diff>`;
    });
  }

  /**
   * Clean content code fences
   */
  private static cleanContentCodeFences(content: string): string {
    const contentBlockPattern = /<content>([\s\S]*?)<\/content>/g;
    const CODE_FENCE = "```";
    const UI_ARTIFACTS = ["text", "copy", "download"];

    return content.replace(contentBlockPattern, (_match, contentBlock) => {
      const lines = contentBlock.split("\n");

      if (lines.length === 0) {
        return `<content>${contentBlock}</content>`;
      }

      const linesToRemove = new Set<number>();

      // Xóa dòng trống đầu tiên
      if (lines[0].trim() === "") {
        linesToRemove.add(0);
      }

      // Tìm và xóa code fence đầu tiên
      for (let i = 0; i < lines.length; i++) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }

        const isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
        if (trimmed !== "" && !isUIArtifact) {
          break;
        }
      }

      // Xóa dòng trống cuối cùng
      const lastIdx = lines.length - 1;
      if (lastIdx >= 0 && lines[lastIdx].trim() === "") {
        linesToRemove.add(lastIdx);
      }

      // Tìm và xóa code fence cuối cùng
      for (let i = lastIdx; i >= 0; i--) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }

        if (trimmed !== "") {
          break;
        }
      }

      const cleanedLines = lines.filter(
        (_: string, idx: number) => !linesToRemove.has(idx)
      );

      return `<content>${cleanedLines.join("\n")}</content>`;
    });
  }

  /**
   * Lấy folderPath cho request
   */
  private static async getFolderPathForRequest(
    requestId: string
  ): Promise<string | null> {
    try {
      // 🔥 PRIORITY 1: Check dedicated folderPath storage
      const folderMappingKey = `folderPath_${requestId}`;
      const browserAPI = this.getBrowserAPI();

      const folderResult = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get([folderMappingKey], (data: any) => {
          resolve(data || {});
        });
      });

      const folderPath = folderResult[folderMappingKey] || null;

      if (folderPath !== null) {
        return folderPath;
      }

      const messagesResult = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get(["wsMessages"], (data: any) => {
          resolve(data || {});
        });
      });

      const messages = messagesResult.wsMessages || {};

      for (const [, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;
        const matchingMsg = msgs.find(
          (msg) =>
            msg.data?.requestId === requestId && msg.data?.type === "sendPrompt"
        );

        if (matchingMsg?.data?.folderPath) {
          const fallbackPath = matchingMsg.data.folderPath;
          console.log(
            `[PromptController] 🔍 DEBUG: Found folderPath in wsMessages fallback: ${fallbackPath}`
          );
          return fallbackPath;
        }
      }

      return null;
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error in getFolderPathForRequest:`,
        error
      );
      return null;
    }
  }

  /**
   * Lấy conversationId từ requestId mapping
   */
  private static async getConversationIdForRequest(
    requestId: string
  ): Promise<string | null> {
    try {
      const conversationMappingKey = `conversationId_${requestId}`;
      const browserAPI = this.getBrowserAPI();

      const result = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get([conversationMappingKey], (data: any) => {
          resolve(data || {});
        });
      });

      return result[conversationMappingKey] || null;
    } catch (error) {
      console.error(
        `[PromptController] ❌ Error in getConversationIdForRequest:`,
        error
      );
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
   * Gửi error response
   */
  private static async sendErrorResponse(
    tabId: number,
    requestId: string,
    error: string,
    errorType?: string
  ): Promise<void> {
    try {
      const folderPath = await this.getFolderPathForRequest(requestId);

      const errorObject = {
        type: "promptResponse",
        requestId: requestId,
        tabId: tabId,
        success: false,
        error: error,
        errorType: errorType || "UNKNOWN_ERROR",
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
      // 🔥 PRIORITY 1: Check dedicated connectionId storage
      const connectionMappingKey = `connectionId_${requestId}`;
      const browserAPI = this.getBrowserAPI();

      const connectionResult = await new Promise<any>((resolve) => {
        browserAPI.storage.local.get([connectionMappingKey], (data: any) => {
          resolve(data || {});
        });
      });

      const storedConnectionId = connectionResult[connectionMappingKey];
      if (storedConnectionId) {
        return storedConnectionId;
      }

      const messages = await browserAPI.getStorageValue("wsMessages");
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

  /**
   * Helper để lấy browser API
   */
  private static getBrowserAPI(): any {
    if (typeof (globalThis as any).browser !== "undefined") {
      return (globalThis as any).browser;
    }
    if (typeof chrome !== "undefined") {
      return chrome;
    }
    throw new Error("No browser API available");
  }
}
