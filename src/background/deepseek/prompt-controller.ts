// src/background/deepseek/prompt-controller.ts
import { executeScript, getBrowserAPI } from "../utils/browser-helper";
import { StateController } from "./state-controller";
import { ChatController } from "./chat-controller";
import { DEFAULT_CONFIG, DeepSeekConfig } from "./types";
import { wrapPromptWithAPIFormat } from "./prompt-template";

export class PromptController {
  private static activePollingTasks: Map<number, string> = new Map();
  private static config: DeepSeekConfig = DEFAULT_CONFIG;

  /**
   * Gửi prompt tới DeepSeek
   */
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string
  ): Promise<boolean> {
    try {
      const browserAPI = getBrowserAPI();

      let tabExists = false;
      try {
        const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
          browserAPI.tabs.get(tabId, (result: chrome.tabs.Tab) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
              return;
            }
            resolve(result);
          });
        });

        tabExists = !!tab && tab.id === tabId;

        if (!tabExists) {
          console.error("[PromptController] ❌ Tab not found:", tabId);
          return false;
        }

        if (!tab.url?.startsWith("https://chat.deepseek.com")) {
          console.error(
            "[PromptController] ❌ Tab is not DeepSeek page:",
            tab.url
          );
          return false;
        }
      } catch (tabError) {
        return false;
      }

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
        return false;
      }

      this.activePollingTasks.set(tabId, requestId);

      this.startResponsePolling(tabId, requestId);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Monitor button state liên tục để phát hiện khi AI trả lời xong
   */
  private static async monitorButtonStateUntilComplete(
    tabId: number,
    requestId: string,
    clickTimestamp: number
  ): Promise<void> {
    const maxChecks = 180;
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
   * Polling để đợi AI trả lời xong
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
              // Lỗi đọc storage
            }

            if (!targetConnectionId) {
              this.activePollingTasks.delete(tabId);
              return;
            }

            const messagePayload = {
              connectionId: targetConnectionId,
              data: {
                type: "promptResponse",
                requestId: requestId,
                tabId: tabId,
                success: true,
                response: response,
              },
              timestamp: Date.now(),
            };

            await browserAPI.storage.local.set({
              wsOutgoingMessage: messagePayload,
            });

            this.activePollingTasks.delete(tabId);
          } else {
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

            await browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: "primary",
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
          }

          return;
        }

        if (pollCount < this.config.maxPolls) {
          const nextPollDelay = this.config.pollInterval;
          setTimeout(poll, nextPollDelay);
        } else {
          this.activePollingTasks.delete(tabId);

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

          await browserAPI.storage.local.set({
            wsOutgoingMessage: {
              connectionId: "primary",
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
          this.activePollingTasks.delete(tabId);
          return;
        }

        await browserAPI.storage.local.set({
          wsOutgoingMessage: {
            connectionId: "primary",
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
