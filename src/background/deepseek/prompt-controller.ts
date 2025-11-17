// src/background/deepseek/prompt-controller.ts
import { executeScript, getBrowserAPI } from "../utils/browser-helper";
import { StateController } from "./state-controller";
import { ChatController } from "./chat-controller";
import { DEFAULT_CONFIG, DeepSeekConfig } from "./types";
import { wrapPromptWithAPIFormat, parseAPIResponse } from "./prompt-template";

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
        console.error(
          "[PromptController] ❌ Failed to validate tab:",
          tabError
        );
        return false;
      }

      const newChatClicked = await ChatController.clickNewChatButton(tabId);

      if (!newChatClicked) {
        console.warn(
          "[PromptController] ⚠️ Failed to create new chat, continuing anyway..."
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const wrappedPrompt = wrapPromptWithAPIFormat(prompt);

      console.log(
        `[PromptController] 📝 Original prompt length: ${prompt.length} chars`
      );
      console.log(
        `[PromptController] 📝 Wrapped prompt length: ${wrappedPrompt.length} chars`
      );
      console.log(
        `[PromptController] 📝 Wrapped prompt preview (first 500 chars):`,
        wrappedPrompt.substring(0, 500)
      );
      console.log(
        `[PromptController] 📝 Wrapped prompt preview (last 200 chars):`,
        wrappedPrompt.substring(wrappedPrompt.length - 200)
      );

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
            console.log(
              `[PromptController] Đưa prompt vào textarea thành công!`
            );
            break;
          } else {
            console.error(
              `[PromptController] ❌ Textarea fill failed:`,
              result?.debug
            );
          }
        } catch (injectError) {
          console.error(
            `[PromptController] ❌ Script injection failed (attempt ${
              4 - retries
            }):`,
            injectError
          );
          retries--;

          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!result || !result.success) {
        console.error(
          "[PromptController] ❌ All script injection attempts failed!"
        );
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
            console.log(
              `[PromptController] ✅ Click button gửi prompt thành công (${new Date(
                clickTimestamp
              ).toISOString()})`
            );

            // Kiểm tra trạng thái button ngay sau khi click
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

                return {
                  found: true,
                  isDisabled: isDisabled,
                  hasStopIcon: hasStopIcon,
                  ariaDisabled: sendButton.getAttribute("aria-disabled"),
                  classList: Array.from(sendButton.classList),
                };
              });

              if (buttonState && buttonState.found) {
                // Phân loại trạng thái dựa trên hasStopIcon
                if (buttonState.hasStopIcon) {
                  console.log(
                    `[PromptController] 📊 Trạng thái button hiện tại: ĐANG TRẢ LỜI RESPONSE`
                  );
                } else {
                  console.log(
                    `[PromptController] 📊 Trạng thái button hiện tại: ĐANG KHÔNG TRẢ LỜI`
                  );
                }
              } else {
                console.warn(
                  `[PromptController] ⚠️ Không thể xác định trạng thái button`
                );
              }
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
            console.error(
              `[PromptController] ❌ Button click failed:`,
              clickResult?.debug
            );
          }
        } catch (clickError) {
          console.error(
            `[PromptController] ❌ Button click failed (attempt ${
              4 - clickRetries
            }):`,
            clickError
          );
          clickRetries--;

          if (clickRetries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!clickSuccess) {
        console.error("[PromptController] ❌ Failed to click send button!");
        return false;
      }

      const oldRequestId = this.activePollingTasks.get(tabId);
      if (oldRequestId) {
        console.warn(
          `[PromptController] ⚠️ Cancelling old polling task for tab ${tabId}, requestId: ${oldRequestId}`
        );
      }

      this.activePollingTasks.set(tabId, requestId);

      this.startResponsePolling(tabId, requestId);

      return true;
    } catch (error) {
      console.error("[PromptController] ❌ EXCEPTION in sendPrompt:", error);
      console.error("[PromptController] Error details:", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
    const maxChecks = 180; // 3 phút (180 * 1s)
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

          // Lấy path để phân biệt Stop icon vs Send icon
          const svg = sendButton.querySelector("svg");
          const path = svg?.querySelector("path");
          const pathData = path?.getAttribute("d") || "";

          // Stop icon path bắt đầu với "M2 4.88006"
          const isStopIconByPath = pathData.includes("M2 4.88006");
          // Send icon path bắt đầu với "M8.3125 0.981648"
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
          console.warn(
            `[PromptController] ⚠️ Button không tìm thấy tại check #${checkCount}`
          );

          if (checkCount < maxChecks) {
            setTimeout(checkState, 1000);
          }
          return;
        }

        // Log chi tiết button state
        console.log(
          `[PromptController] 🔍 Check #${checkCount} - Button state:`,
          {
            hasStopIcon: buttonState.hasStopIcon,
            isDisabled: buttonState.isDisabled,
            isStopIconByPath: buttonState.isStopIconByPath,
            isSendIconByPath: buttonState.isSendIconByPath,
            pathPreview: buttonState.pathData,
          }
        );

        // Phát hiện button tồn tại
        if (buttonState.isStopIconByPath && !buttonState.isDisabled) {
          console.log(
            `[PromptController] ✅ Phát hiện BUTTON TẠM DỪNG (Stop icon) - Đang generating`
          );
          wasGenerating = true;
        } else if (buttonState.isSendIconByPath && !buttonState.isDisabled) {
          console.log(
            `[PromptController] ✅ Phát hiện BUTTON GỬI (Send icon enabled) - Có thể gửi`
          );
        } else if (buttonState.isSendIconByPath && buttonState.isDisabled) {
          console.log(
            `[PromptController] ✅ Phát hiện BUTTON GỬI (Send icon disabled) - Đã trả lời xong`
          );
        }

        // Logic chính: Nếu đã từng generating và giờ button là Send icon disabled
        if (
          wasGenerating &&
          buttonState.isSendIconByPath &&
          buttonState.isDisabled
        ) {
          const responseTime = Date.now() - clickTimestamp;
          const responseTimeSeconds = (responseTime / 1000).toFixed(2);

          console.log(
            `[PromptController] 📊 Trạng thái button hiện tại: ĐANG KHÔNG TRẢ LỜI`
          );
          console.log(
            `[PromptController] ⏱️  Thời gian phản hồi: ${responseTimeSeconds}s (${Math.round(
              responseTime
            )}ms)`
          );

          // Kiểm tra icon copy của AI
          try {
            const copyIconResult = await executeScript(tabId, () => {
              // Tìm tất cả các nhóm icon buttons
              const allIconGroups = document.querySelectorAll(
                ".ds-flex._965abe9._54866f7, .ds-flex._78e0558._0bbda35"
              );

              console.log(
                `[DeepSeek Page] 🔍 Tổng số nhóm icon tìm thấy: ${allIconGroups.length}`
              );

              let aiCopyButton: HTMLElement | null = null;
              let foundGroupIndex = -1;

              // Duyệt qua từng nhóm để tìm NHÓM 5 ICON CUỐI CÙNG (nhóm của AI response mới nhất)
              const groupsArray = Array.from(allIconGroups);
              for (let i = groupsArray.length - 1; i >= 0; i--) {
                const group = groupsArray[i];
                const iconButtons = group.querySelectorAll(
                  ".ds-icon-button.db183363"
                );
                console.log(
                  `[DeepSeek Page] 📊 Nhóm #${i} có ${iconButtons.length} icon`
                );

                // Nhóm của AI có 5 icon
                if (iconButtons.length === 5) {
                  console.log(
                    `[DeepSeek Page] ✅ Phát hiện nhóm 5 icon tại index ${i} (AI)`
                  );

                  // Icon copy là icon đầu tiên trong nhóm 5 icon
                  aiCopyButton = iconButtons[0] as HTMLElement;

                  // Kiểm tra xem có phải icon copy không bằng cách check SVG path
                  const svg = aiCopyButton.querySelector("svg");
                  const path = svg?.querySelector("path");
                  const pathData = path?.getAttribute("d") || "";

                  // Path của icon copy bắt đầu với "M6.14926 4.02039"
                  const isCopyIcon = pathData.includes("M6.14926 4.02039");

                  if (isCopyIcon) {
                    console.log(
                      `[DeepSeek Page] ✅ Xác nhận đây là ICON COPY của AI (nhóm cuối cùng có 5 icon)`
                    );
                    foundGroupIndex = i;
                    break;
                  } else {
                    console.log(
                      `[DeepSeek Page] ⚠️ Icon đầu tiên trong nhóm #${i} không phải icon copy`
                    );
                    aiCopyButton = null;
                  }
                }
              }

              if (!aiCopyButton) {
                return {
                  found: false,
                  error: "Không tìm thấy icon copy của AI",
                };
              }

              console.log(
                `[DeepSeek Page] 🎯 Đã tìm thấy icon copy của AI tại nhóm #${foundGroupIndex}, chuẩn bị click...`
              );

              // Thử click vào icon copy
              try {
                aiCopyButton.click();
                console.log(
                  `[DeepSeek Page] ✅ Đã click vào icon copy thành công`
                );

                return {
                  found: true,
                  clicked: true,
                  groupIndex: foundGroupIndex,
                };
              } catch (clickError) {
                console.error(
                  `[DeepSeek Page] ❌ Lỗi khi click vào icon copy:`,
                  clickError
                );
                return {
                  found: true,
                  clicked: false,
                  error:
                    clickError instanceof Error
                      ? clickError.message
                      : String(clickError),
                };
              }
            });

            if (copyIconResult && copyIconResult.found) {
              console.log(`[PromptController] ✅ Tìm thấy icon copy của AI`);

              if (copyIconResult.clicked) {
                console.log(
                  `[PromptController] ✅ Đã click vào icon copy thành công`
                );

                // Lưu prompt hiện tại để so sánh
                const currentPrompt = prompt;

                // Đợi và kiểm tra clipboard nhiều lần để đảm bảo nội dung đã được copy
                let clipboardSuccess = false;
                let finalClipboardContent = "";
                const maxRetries = 8; // Tăng số lần retry

                for (let retry = 0; retry < maxRetries; retry++) {
                  // Thời gian chờ: 1000ms, 1500ms, 2000ms, 2500ms, 3000ms, 3500ms, 4000ms, 4500ms
                  const waitTime = 10000 + retry * 500; // Bắt đầu từ 1000ms thay vì 500ms
                  await new Promise((resolve) => setTimeout(resolve, waitTime));

                  try {
                    const clipboardContent = await executeScript(
                      tabId,
                      async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          return {
                            success: true,
                            content: text,
                            contentPreview: text.substring(0, 200),
                          };
                        } catch (error) {
                          return {
                            success: false,
                            error:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          };
                        }
                      }
                    );

                    if (clipboardContent && clipboardContent.success) {
                      const clipboardText = clipboardContent.content;

                      // Kiểm tra xem clipboard có khác với prompt không
                      if (
                        clipboardText !== currentPrompt &&
                        clipboardText.length > 0
                      ) {
                        console.log(
                          `[PromptController] ✅ Clipboard đã được cập nhật sau ${
                            retry + 1
                          } lần thử (${waitTime}ms)`
                        );
                        console.log(
                          `[PromptController] 📋 Nội dung clipboard (200 ký tự đầu):`,
                          clipboardContent.contentPreview
                        );
                        clipboardSuccess = true;
                        finalClipboardContent = clipboardText;
                        break;
                      } else {
                        console.log(
                          `[PromptController] ⏳ Lần thử ${
                            retry + 1
                          }/${maxRetries}: Clipboard chưa thay đổi, chờ thêm...`
                        );
                      }
                    } else {
                      console.warn(
                        `[PromptController] ⚠️ Lần thử ${
                          retry + 1
                        }/${maxRetries}: Không thể đọc clipboard:`,
                        clipboardContent?.error
                      );
                    }
                  } catch (clipboardError) {
                    console.error(
                      `[PromptController] ❌ Lỗi khi đọc clipboard (lần thử ${
                        retry + 1
                      }):`,
                      clipboardError
                    );
                  }
                }

                if (!clipboardSuccess) {
                  console.error(
                    `[PromptController] ❌ Không thể đọc được nội dung AI response từ clipboard sau ${maxRetries} lần thử`
                  );
                } else {
                  console.log(
                    `[PromptController] ✅ Đã lấy được nội dung AI response từ clipboard (${finalClipboardContent.length} ký tự)`
                  );
                }
              } else {
                console.error(
                  `[PromptController] ❌ Không thể click vào icon copy:`,
                  copyIconResult.error
                );
              }
            } else {
              console.warn(
                `[PromptController] ⚠️ Không tìm thấy icon copy của AI:`,
                copyIconResult?.error
              );
            }
          } catch (copyCheckError) {
            console.error(
              `[PromptController] ❌ Lỗi khi kiểm tra icon copy:`,
              copyCheckError
            );
          }

          // Hoàn thành monitoring
          return;
        }

        // Tiếp tục check nếu chưa timeout
        if (checkCount < maxChecks) {
          setTimeout(checkState, 1000);
        } else {
          console.error(
            `[PromptController] ⏱️ Timeout monitoring button state sau ${maxChecks}s`
          );
        }
      } catch (error) {
        console.error(
          `[PromptController] ❌ Error monitoring button state at check #${checkCount}:`,
          error
        );

        if (checkCount < maxChecks) {
          setTimeout(checkState, 1000);
        }
      }
    };

    // Bắt đầu check sau 1s
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
    const startTime = Date.now();

    const poll = async () => {
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        console.warn(
          `[PromptController] ⚠️ Polling cancelled - newer request detected. Old: ${capturedRequestId}, New: ${currentActiveRequest}`
        );
        return;
      }

      pollCount++;
      const elapsedTime = Date.now() - startTime;

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
              console.error(
                "[PromptController] ❌ Failed to read wsMessages:",
                storageError
              );
            }

            if (!targetConnectionId) {
              console.error(
                "[PromptController] ❌ No WebSocket connection found for requestId:",
                capturedRequestId
              );
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
          console.error("[PromptController] ❌ POLLING TIMEOUT!");
          console.error(
            "[PromptController] ⏱️  Total time elapsed:",
            Math.round(elapsedTime / 1000),
            "seconds"
          );

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
        console.error(
          `[PromptController] ❌ Poll #${pollCount} failed:`,
          error
        );

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
        console.log(
          `[PromptController] 📦 Raw response length: ${result.length} chars`
        );
        console.log(
          `[PromptController] 📦 Raw response preview (first 200 chars):`,
          result.substring(0, 200)
        );

        const parsed = parseAPIResponse(result);

        if (parsed.success && parsed.content) {
          console.log(
            `[PromptController] ✅ Successfully parsed JSON API response`
          );
          console.log(
            `[PromptController] 📝 Extracted content length: ${parsed.content.length} chars`
          );
          console.log(
            `[PromptController] 📝 Content preview:`,
            parsed.content.substring(0, 200)
          );

          if (parsed.fullResponse) {
            console.log(`[PromptController] 📊 Full API response:`, {
              id: parsed.fullResponse.id,
              model: parsed.fullResponse.model,
              usage: parsed.fullResponse.usage,
              finish_reason: parsed.fullResponse.choices[0]?.finish_reason,
            });
          }

          return parsed.content;
        } else {
          console.error(
            `[PromptController] ❌ Failed to parse JSON response:`,
            parsed.error
          );
          console.error(`[PromptController] 📄 Raw response:`, result);

          console.warn(`[PromptController] ⚠️ Falling back to raw response`);
          return result;
        }
      } else {
        return null;
      }
    } catch (error) {
      console.error("[PromptController] ❌ Fetch process EXCEPTION:", error);
      console.error("[PromptController] Error details:", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }
}
