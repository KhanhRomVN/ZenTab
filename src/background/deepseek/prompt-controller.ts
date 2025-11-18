// src/background/deepseek/prompt-controller.ts
import { executeScript, getBrowserAPI } from "../utils/browser-helper";
import { StateController } from "./state-controller";
import { ChatController } from "./chat-controller";
import { DEFAULT_CONFIG, DeepSeekConfig } from "./types";
import { wrapPromptWithAPIFormat } from "./prompt-template";
import { TabMonitor } from "../utils/tab-monitor";

export class PromptController {
  private static activePollingTasks: Map<number, string> = new Map();
  private static config: DeepSeekConfig = DEFAULT_CONFIG;
  private static tabMonitor = TabMonitor.getInstance();

  /**
   * Validate tab trước khi gửi prompt
   */
  private static async validateTab(
    tabId: number
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const browserAPI = getBrowserAPI();

      // Kiểm tra tab có tồn tại không
      const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
        browserAPI.tabs.get(tabId, (result: chrome.tabs.Tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(`Invalid tab ID: ${tabId}`));
            return;
          }
          if (!result) {
            reject(new Error(`Tab not found: ${tabId}`));
            return;
          }
          resolve(result);
        });
      });

      // Kiểm tra URL có phải DeepSeek không
      if (!tab.url?.startsWith("https://chat.deepseek.com")) {
        return {
          isValid: false,
          error: `Tab is not DeepSeek page: ${tab.url}`,
        };
      }

      // Kiểm tra tab có thể nhận request không
      if (!this.tabMonitor.canAcceptRequest(tabId)) {
        return {
          isValid: false,
          error: `Tab ${tabId} is not ready for new request (cooling down)`,
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error
            ? error.message
            : `Unknown error validating tab ${tabId}`,
      };
    }
  }

  /**
   * Gửi prompt tới DeepSeek với validation mạnh mẽ
   */
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string
  ): Promise<boolean> {
    try {
      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        console.error(
          `[PromptController] ❌ Tab validation failed: ${validation.error}`
        );

        // 🔧 NEW: Gửi error message về Backend ngay lập tức
        const browserAPI = getBrowserAPI();
        try {
          // Tìm connectionId từ wsMessages
          const messagesResult = await new Promise<any>((resolve, reject) => {
            browserAPI.storage.local.get(["wsMessages"], (data: any) => {
              if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
                return;
              }
              resolve(data || {});
            });
          });

          const wsMessages = messagesResult?.wsMessages || {};
          let targetConnectionId: string | null = null;

          for (const [connId, msgArray] of Object.entries(wsMessages)) {
            const msgs = msgArray as Array<{ timestamp: number; data: any }>;
            const matchingMsg = msgs.find(
              (msg) => msg.data?.requestId === requestId
            );
            if (matchingMsg) {
              targetConnectionId = connId;
              break;
            }
          }

          if (targetConnectionId) {
            await browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: targetConnectionId,
                data: {
                  type: "promptResponse",
                  requestId: requestId,
                  tabId: tabId,
                  success: false,
                  error: validation.error || "Tab validation failed",
                  errorType: "VALIDATION_FAILED",
                },
                timestamp: Date.now(),
              },
            });
            console.log(
              `[PromptController] 📤 Sent validation error to Backend`
            );
          }
        } catch (notifyError) {
          console.error(
            `[PromptController] Failed to notify Backend:`,
            notifyError
          );
        }

        return false;
      }

      // Đánh dấu tab đang bận
      this.tabMonitor.markTabBusy(tabId);

      const newChatClicked = await ChatController.clickNewChatButton(tabId);

      if (!newChatClicked) {
        // Tiếp tục xử lý
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const wrappedPrompt = wrapPromptWithAPIFormat(prompt);

      let retries = 3;
      let result: any = null;

      while (retries > 0 && !result) {
        try {
          result = await executeScript(
            tabId,
            (text: string) => {
              const textarea = document.querySelector(
                'textarea[placeholder="Message DeepSeek"]'
              ) as HTMLTextAreaElement;

              if (!textarea) {
                return {
                  success: false,
                  step: "textarea_not_found",
                  debug: {
                    textareaExists: false,
                    allTextareas: document.querySelectorAll("textarea").length,
                    location: window.location.href,
                  },
                };
              }

              textarea.value = text;

              const inputEvent = new Event("input", { bubbles: true });
              textarea.dispatchEvent(inputEvent);

              const changeEvent = new Event("change", { bubbles: true });
              textarea.dispatchEvent(changeEvent);

              return {
                success: true,
                step: "textarea_filled",
                debug: {
                  textareaExists: true,
                  textareaValue: textarea.value.substring(0, 50),
                  textareaDisabled: textarea.disabled,
                  textareaReadOnly: textarea.readOnly,
                },
              };
            },
            [wrappedPrompt]
          );

          if (result && result.success) {
            break;
          }
        } catch (injectError) {
          retries--;

          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!result || !result.success) {
        this.tabMonitor.markTabFree(tabId);
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      let clickRetries = 3;
      let clickSuccess = false;

      while (clickRetries > 0 && !clickSuccess) {
        try {
          const clickResult = await executeScript(tabId, () => {
            const sendButton = document.querySelector(
              ".ds-icon-button._7436101"
            ) as HTMLButtonElement;

            if (!sendButton) {
              return {
                success: false,
                reason: "button_not_found",
                debug: {
                  buttonExists: false,
                  allButtons:
                    document.querySelectorAll(".ds-icon-button").length,
                  specificButtons: document.querySelectorAll(
                    ".ds-icon-button._7436101"
                  ).length,
                },
              };
            }

            const isDisabled = sendButton.classList.contains(
              "ds-icon-button--disabled"
            );

            if (isDisabled) {
              return {
                success: false,
                reason: "button_disabled",
                debug: {
                  buttonExists: true,
                  isDisabled: true,
                  classList: Array.from(sendButton.classList),
                },
              };
            }

            sendButton.click();

            return {
              success: true,
              debug: {
                buttonExists: true,
                isDisabled: false,
                clicked: true,
              },
            };
          });

          if (clickResult && clickResult.success) {
            const clickTimestamp = Date.now();
            // Kiểm tra trạng thái button ngay sau khi click
            try {
            } catch (stateError) {
              console.error(
                `[PromptController] ⚠️ Không thể kiểm tra button state:`,
                stateError
              );
            }

            // Bắt đầu monitor button state để phát hiện khi AI trả lời xong
            this.monitorButtonStateUntilComplete(
              tabId,
              requestId,
              clickTimestamp
            );

            clickSuccess = true;
            break;
          } else {
            // Click failed, retry
          }
        } catch (clickError) {
          clickRetries--;

          if (clickRetries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!clickSuccess) {
        this.tabMonitor.markTabFree(tabId);
        return false;
      }

      this.activePollingTasks.set(tabId, requestId);

      this.startResponsePolling(tabId, requestId);

      return true;
    } catch (error) {
      this.tabMonitor.markTabFree(tabId);
      console.error(`[PromptController] ❌ Exception in sendPrompt:`, error);
      return false;
    }
  }

  /**
   * Monitor button state liên tục để phát hiện khi AI trả lời xong
   */
  private static async monitorButtonStateUntilComplete(
    tabId: number,
    _requestId: string,
    _clickTimestamp: number
  ): Promise<void> {
    const maxChecks = 180; // 180 checks x 1s = 3 minutes max
    let checkCount = 0;
    let wasGenerating = false;

    const checkState = async () => {
      checkCount++;

      try {
        const buttonState = await executeScript(tabId, () => {
          const sendButton = document.querySelector(
            ".ds-icon-button._7436101"
          ) as HTMLButtonElement;

          if (!sendButton) {
            return { found: false };
          }

          const isDisabled =
            sendButton.classList.contains("ds-icon-button--disabled") ||
            sendButton.getAttribute("aria-disabled") === "true";

          const hasStopIcon = sendButton.classList.contains("bcc55ca1");

          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";

          const isStopIconByPath = pathData.includes("M2 4.88006");
          const isSendIconByPath = pathData.includes("M8.3125 0.981648");

          return {
            found: true,
            isDisabled: isDisabled,
            hasStopIcon: hasStopIcon,
            ariaDisabled: sendButton.getAttribute("aria-disabled"),
            pathData: pathData.substring(0, 50),
            isStopIconByPath: isStopIconByPath,
            isSendIconByPath: isSendIconByPath,
          };
        });

        if (!buttonState || !buttonState.found) {
          if (checkCount < maxChecks) {
            setTimeout(checkState, 1000);
          }
          return;
        }

        if (buttonState.isStopIconByPath && !buttonState.isDisabled) {
          wasGenerating = true;
        }

        if (
          wasGenerating &&
          buttonState.isSendIconByPath &&
          buttonState.isDisabled
        ) {
          return;
        }

        if (checkCount < maxChecks) {
          setTimeout(checkState, 1000);
        }
      } catch (error) {
        if (checkCount < maxChecks) {
          setTimeout(checkState, 1000);
        }
      }
    };

    setTimeout(checkState, 1000);
  }

  /**
   * Polling để đợi AI trả lời xong - CẬP NHẬT: đánh dấu tab free khi hoàn thành
   */
  private static async startResponsePolling(
    tabId: number,
    requestId: string
  ): Promise<void> {
    const capturedRequestId = requestId;
    const isTestRequest = requestId.startsWith("test-");

    const browserAPI = getBrowserAPI();
    let pollCount = 0;

    const poll = async () => {
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        return;
      }

      pollCount++;

      try {
        const isGenerating = await StateController.isGenerating(tabId);

        if (!isGenerating && pollCount >= 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await this.getLatestResponseDirectly(tabId);

          if (response) {
            // Đánh dấu tab free khi nhận được response thành công
            this.tabMonitor.markTabFree(tabId);

            if (isTestRequest) {
              await browserAPI.storage.local.set({
                [`testResponse_${tabId}`]: {
                  requestId: capturedRequestId,
                  response: response,
                  timestamp: Date.now(),
                },
              });

              this.activePollingTasks.delete(tabId);
              return;
            }

            let targetConnectionId: string | null = null;

            try {
              const messagesResult = await new Promise<any>(
                (resolve, reject) => {
                  browserAPI.storage.local.get(["wsMessages"], (data: any) => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve(data || {});
                  });
                }
              );

              const wsMessages = messagesResult?.wsMessages || {};

              for (const [connId, msgArray] of Object.entries(wsMessages)) {
                const msgs = msgArray as Array<{
                  timestamp: number;
                  data: any;
                }>;

                const matchingMsg = msgs.find(
                  (msg) => msg.data?.requestId === capturedRequestId
                );

                if (matchingMsg) {
                  targetConnectionId = connId;
                  break;
                }
              }
            } catch (storageError) {
              console.error(
                "[PromptController] ❌ Failed to find target connection:",
                storageError
              );
            }

            if (!targetConnectionId) {
              console.error(
                "[PromptController] ❌ No target connection found for requestId:",
                capturedRequestId
              );
              this.activePollingTasks.delete(tabId);
              return;
            }

            console.log(
              `[PromptController] ✅ Sending response back via connection: ${targetConnectionId}`
            );

            const currentTimestamp = Date.now();
            const messagePayload = {
              connectionId: targetConnectionId,
              data: {
                type: "promptResponse",
                requestId: requestId,
                tabId: tabId,
                success: true,
                response: response,
                timestamp: currentTimestamp, // 🔧 FIX: Add timestamp to data object
              },
              timestamp: currentTimestamp,
            };

            console.log(
              `[PromptController] 📤 Sending response with timestamp: ${currentTimestamp}`
            );

            await browserAPI.storage.local.set({
              wsOutgoingMessage: messagePayload,
            });

            console.log(
              `[PromptController] 📤 Response sent successfully for requestId: ${capturedRequestId}`
            );

            this.activePollingTasks.delete(tabId);
          } else {
            console.error(
              "[PromptController] ❌ Failed to fetch response from DeepSeek for requestId:",
              capturedRequestId
            );

            // Đánh dấu tab free ngay cả khi không có response
            this.tabMonitor.markTabFree(tabId);

            if (isTestRequest) {
              await browserAPI.storage.local.set({
                [`testResponse_${tabId}`]: {
                  requestId: capturedRequestId,
                  success: false,
                  error: "Failed to fetch response from DeepSeek",
                  timestamp: Date.now(),
                },
              });

              this.activePollingTasks.delete(tabId);
              return;
            }

            let targetConnectionId: string | null = null;

            try {
              const messagesResult = await new Promise<any>(
                (resolve, reject) => {
                  browserAPI.storage.local.get(["wsMessages"], (data: any) => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve(data || {});
                  });
                }
              );

              const wsMessages = messagesResult?.wsMessages || {};

              for (const [connId, msgArray] of Object.entries(wsMessages)) {
                const msgs = msgArray as Array<{
                  timestamp: number;
                  data: any;
                }>;

                const matchingMsg = msgs.find(
                  (msg) => msg.data?.requestId === capturedRequestId
                );

                if (matchingMsg) {
                  targetConnectionId = connId;
                  break;
                }
              }
            } catch (storageError) {
              console.error(
                "[PromptController] ❌ Failed to find target connection for error response:",
                storageError
              );
            }

            if (!targetConnectionId) {
              console.error(
                "[PromptController] ❌ No target connection found for error response, requestId:",
                capturedRequestId
              );
              this.activePollingTasks.delete(tabId);
              return;
            }

            await browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: targetConnectionId,
                data: {
                  type: "promptResponse",
                  requestId: requestId,
                  tabId: tabId,
                  success: false,
                  error: "Failed to fetch response from DeepSeek",
                },
                timestamp: Date.now(),
              },
            });

            this.activePollingTasks.delete(tabId);
          }

          return;
        }

        if (pollCount < this.config.maxPolls) {
          const nextPollDelay = this.config.pollInterval;
          setTimeout(poll, nextPollDelay);
        } else {
          console.error(
            "[PromptController] ⏱️ Timeout waiting for response, requestId:",
            capturedRequestId
          );
          this.activePollingTasks.delete(tabId);
          // Đánh dấu tab free khi timeout
          this.tabMonitor.markTabFree(tabId);

          if (isTestRequest) {
            await browserAPI.storage.local.set({
              [`testResponse_${tabId}`]: {
                requestId: capturedRequestId,
                success: false,
                error: "Response timeout - AI took too long to respond",
                timestamp: Date.now(),
              },
            });
            return;
          }

          let targetConnectionId: string | null = null;

          try {
            const messagesResult = await new Promise<any>((resolve, reject) => {
              browserAPI.storage.local.get(["wsMessages"], (data: any) => {
                if (browserAPI.runtime.lastError) {
                  reject(browserAPI.runtime.lastError);
                  return;
                }
                resolve(data || {});
              });
            });

            const wsMessages = messagesResult?.wsMessages || {};

            for (const [connId, msgArray] of Object.entries(wsMessages)) {
              const msgs = msgArray as Array<{
                timestamp: number;
                data: any;
              }>;

              const matchingMsg = msgs.find(
                (msg) => msg.data?.requestId === capturedRequestId
              );

              if (matchingMsg) {
                targetConnectionId = connId;
                break;
              }
            }
          } catch (storageError) {
            console.error(
              "[PromptController] ❌ Failed to find target connection for timeout response:",
              storageError
            );
          }

          if (!targetConnectionId) {
            console.error(
              "[PromptController] ❌ No target connection found for timeout response, requestId:",
              capturedRequestId
            );
            return;
          }

          await browserAPI.storage.local.set({
            wsOutgoingMessage: {
              connectionId: targetConnectionId,
              data: {
                type: "promptResponse",
                requestId: requestId,
                tabId: tabId,
                success: false,
                error: "Response timeout - AI took too long to respond",
                errorType: "TIMEOUT",
              },
              timestamp: Date.now(),
            },
          });
        }
      } catch (error) {
        console.error(
          "[PromptController] ❌ Exception in polling loop:",
          error
        );

        this.activePollingTasks.delete(tabId);
        // Đánh dấu tab free khi có lỗi
        this.tabMonitor.markTabFree(tabId);

        if (isTestRequest) {
          await browserAPI.storage.local.set({
            [`testResponse_${tabId}`]: {
              requestId: capturedRequestId,
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown polling error",
              timestamp: Date.now(),
            },
          });
          return;
        }

        let targetConnectionId: string | null = null;

        try {
          const messagesResult = await new Promise<any>((resolve, reject) => {
            browserAPI.storage.local.get(["wsMessages"], (data: any) => {
              if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
                return;
              }
              resolve(data || {});
            });
          });

          const wsMessages = messagesResult?.wsMessages || {};

          for (const [connId, msgArray] of Object.entries(wsMessages)) {
            const msgs = msgArray as Array<{
              timestamp: number;
              data: any;
            }>;

            const matchingMsg = msgs.find(
              (msg) => msg.data?.requestId === capturedRequestId
            );

            if (matchingMsg) {
              targetConnectionId = connId;
              break;
            }
          }
        } catch (storageError) {
          console.error(
            "[PromptController] ❌ Failed to find target connection for exception response:",
            storageError
          );
        }

        if (!targetConnectionId) {
          console.error(
            "[PromptController] ❌ No target connection found for exception response, requestId:",
            capturedRequestId
          );
          return;
        }

        await browserAPI.storage.local.set({
          wsOutgoingMessage: {
            connectionId: targetConnectionId,
            data: {
              type: "promptResponse",
              requestId: requestId,
              tabId: tabId,
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown polling error",
            },
            timestamp: Date.now(),
          },
        });
      }
    };
    setTimeout(poll, this.config.initialDelay);
  }

  /**
   * Lấy response trực tiếp từ message container (không cần copy button)
   */
  private static async getLatestResponseDirectly(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        const messageContainers = Array.from(
          document.querySelectorAll('[class*="message"]')
        );

        if (messageContainers.length === 0) {
          console.error("[DeepSeek Page] ❌ No message containers found");
          return null;
        }

        const lastContainer = messageContainers[messageContainers.length - 1];
        const textContent = lastContainer.textContent?.trim();

        if (!textContent) {
          console.error("[DeepSeek Page] ❌ Last message container is empty");
          return null;
        }

        return textContent;
      });

      if (result) {
        // Parse JSON nếu có thể
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonResponse = JSON.parse(jsonMatch[0]);
            console.log("[PromptController] JSON API Response:", jsonResponse);
            return result;
          }
        } catch (parseError) {
          // Không parse được, trả về raw
        }

        return result;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
}
