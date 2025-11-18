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
      // 🆕 THÊM: Log thông tin request
      console.log(`[PromptController] 📥 Received sendPrompt request:`, {
        tabId,
        requestId,
        promptLength: prompt.length,
      });

      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        console.error(
          `[PromptController] ❌ Tab validation failed: ${validation.error}`
        );

        // 🔧 IMPROVED: Gửi error message về Backend với logging tốt hơn
        const browserAPI = getBrowserAPI();
        try {
          // 🆕 FIX: Get tất cả connections và tìm connection ID duy nhất (port 1500)
          const connectionsResult = await new Promise<any>(
            (resolve, reject) => {
              browserAPI.storage.local.get(["wsConnections"], (data: any) => {
                if (browserAPI.runtime.lastError) {
                  reject(browserAPI.runtime.lastError);
                  return;
                }
                resolve(data || {});
              });
            }
          );

          const connections = connectionsResult?.wsConnections || [];
          const targetConnection = connections.find(
            (conn: any) => conn.port === 1500
          );

          if (targetConnection) {
            const errorPayload = {
              wsOutgoingMessage: {
                connectionId: targetConnection.id,
                data: {
                  type: "promptResponse",
                  requestId: requestId,
                  tabId: tabId,
                  success: false,
                  error: validation.error || "Tab validation failed",
                  errorType: "VALIDATION_FAILED",
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              },
            };

            console.log(
              `[PromptController] 📤 Sending validation error to Backend:`,
              errorPayload
            );

            await browserAPI.storage.local.set(errorPayload);

            console.log(
              `[PromptController] ✅ Validation error sent successfully`
            );
          } else {
            console.error(
              `[PromptController] ❌ No WebSocket connection found (port 1500)`
            );
          }
        } catch (notifyError) {
          console.error(
            `[PromptController] ❌ Failed to notify Backend:`,
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
    let responseSent = false; // 🆕 THÊM: Flag để track đã gửi response chưa

    const poll = async () => {
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        return;
      }

      // 🆕 THÊM: Kiểm tra nếu đã gửi response thì dừng polling
      if (responseSent) {
        console.log(
          `[PromptController] 🛑 Polling stopped - response already sent: ${capturedRequestId}`
        );
        return;
      }

      pollCount++;

      try {
        const isGenerating = await StateController.isGenerating(tabId);

        if (!isGenerating && pollCount >= 3) {
          // 🆕 THÊM: Kiểm tra duplicate trước khi gửi response
          if (responseSent) {
            console.warn(
              `[PromptController] 🚫 DUPLICATE RESPONSE PREVENTED: ${capturedRequestId}`
            );
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await this.getLatestResponseDirectly(tabId);

          if (response) {
            // 🆕 ĐÁNH DẤU: Đã gửi response
            responseSent = true;

            // 🆕 CRITICAL FIX: Đánh dấu tab free TRƯỚC KHI gửi response
            this.tabMonitor.markTabFree(tabId);

            // 🆕 THÊM: Cleanup active polling task ngay lập tức
            this.activePollingTasks.delete(tabId);

            console.log(
              `[PromptController] ✅ Tab ${tabId} marked FREE and polling stopped for: ${capturedRequestId}`
            );

            // 🔧 CRITICAL FIX V3: KHÔNG stringify response - gửi object trực tiếp
            console.log(
              `[PromptController] 🔍 Raw response type: ${typeof response}`
            );
            console.log(
              `[PromptController] 📏 Raw response length: ${
                response?.length || 0
              }`
            );
            console.log(
              `[PromptController] 📝 Raw response preview (first 300 chars):`,
              response?.substring(0, 300)
            );

            let responseToSend: any = null;

            // Step 1: Parse response to object if it's a string
            if (typeof response === "string") {
              console.log(
                `[PromptController] 🔧 Response is string, attempting to parse...`
              );
              try {
                const parsedObject = JSON.parse(response);
                console.log(
                  `[PromptController] ✅ Successfully parsed response to object`
                );
                console.log(
                  `[PromptController] 📊 Parsed object keys:`,
                  Object.keys(parsedObject)
                );

                // Validate structure
                if (
                  parsedObject &&
                  typeof parsedObject === "object" &&
                  parsedObject.choices
                ) {
                  console.log(
                    `[PromptController] ✅ Response has valid OpenAI structure`
                  );
                  console.log(
                    `[PromptController] 🎯 CRITICAL: Sending OBJECT directly (NOT stringified)`
                  );
                  // 🔧 CRITICAL: GỬI OBJECT TRỰC TIẾP, KHÔNG stringify
                  responseToSend = parsedObject;
                } else {
                  console.warn(
                    `[PromptController] ⚠️ Response object missing 'choices' field`
                  );
                  console.warn(
                    `[PromptController] 🔧 Falling back to string response`
                  );
                  responseToSend = response; // Giữ nguyên string
                }
              } catch (parseError) {
                console.error(
                  `[PromptController] ❌ Failed to parse response:`,
                  parseError
                );
                console.error(
                  `[PromptController] 📝 Problematic response:`,
                  response.substring(0, 500)
                );
                console.warn(
                  `[PromptController] 🔧 Sending raw string as fallback`
                );
                // Response không phải JSON, gửi raw string
                responseToSend = response;
              }
            } else if (typeof response === "object") {
              console.log(`[PromptController] 🔧 Response is already object`);
              console.log(
                `[PromptController] 🎯 CRITICAL: Sending OBJECT directly (already parsed)`
              );
              // 🔧 CRITICAL: Response đã là object, gửi trực tiếp
              responseToSend = response;
            } else {
              console.warn(
                `[PromptController] ⚠️ Unexpected response type: ${typeof response}`
              );
              console.warn(`[PromptController] 🔧 Converting to string`);
              responseToSend = String(response);
            }

            console.log(
              `[PromptController] 📤 Final response type to send: ${typeof responseToSend}`
            );
            if (typeof responseToSend === "object") {
              console.log(
                `[PromptController] 📤 Final response keys:`,
                Object.keys(responseToSend)
              );
              console.log(
                `[PromptController] 📤 Final response.choices[0].delta.content length:`,
                responseToSend?.choices?.[0]?.delta?.content?.length || 0
              );
            } else {
              console.log(
                `[PromptController] 📤 Final response length:`,
                responseToSend?.length || 0
              );
              console.log(
                `[PromptController] 📤 Final response preview (first 300 chars):`,
                String(responseToSend).substring(0, 300)
              );
            }

            if (isTestRequest) {
              await browserAPI.storage.local.set({
                [`testResponse_${tabId}`]: {
                  requestId: capturedRequestId,
                  response: responseToSend,
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

            // 🔧 CRITICAL FIX: Gửi response theo đúng type (object hoặc string)
            console.log(`[PromptController] 🔧 Preparing message payload...`);
            console.log(
              `[PromptController] 📊 Response to send type: ${typeof responseToSend}`
            );

            const messagePayload = {
              wsOutgoingMessage: {
                connectionId: targetConnectionId,
                data: {
                  type: "promptResponse",
                  requestId: requestId,
                  tabId: tabId,
                  success: true,
                  response: responseToSend, // 🔧 CRITICAL: Gửi trực tiếp (object hoặc string)
                  timestamp: currentTimestamp,
                },
                timestamp: currentTimestamp,
              },
            };

            console.log(
              `[PromptController] 📤 Sending response with timestamp: ${currentTimestamp}`
            );
            console.log(
              `[PromptController] 📤 Message payload.data.response type: ${typeof messagePayload
                .wsOutgoingMessage.data.response}`
            );

            if (
              typeof messagePayload.wsOutgoingMessage.data.response === "object"
            ) {
              console.log(
                `[PromptController] 📤 Response is OBJECT - will be auto-stringified by storage.local.set`
              );
              console.log(
                `[PromptController] 📤 Response object keys:`,
                Object.keys(messagePayload.wsOutgoingMessage.data.response)
              );
            } else {
              console.log(
                `[PromptController] 📤 Response is STRING - length:`,
                messagePayload.wsOutgoingMessage.data.response?.length || 0
              );
              console.log(
                `[PromptController] 📤 Response preview (first 200 chars):`,
                String(
                  messagePayload.wsOutgoingMessage.data.response
                ).substring(0, 200)
              );
            }

            console.log(
              `[PromptController] 🔧 About to call storage.local.set...`
            );

            await browserAPI.storage.local.set(messagePayload);

            console.log(
              `[PromptController] ✅ storage.local.set completed successfully`
            );

            console.log(
              `[PromptController] ✅ Response sent successfully for requestId: ${capturedRequestId}`
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
      console.log(
        `\n[PromptController] 🔍 ===== EXTRACTING RESPONSE START =====`
      );
      console.log(`[PromptController] Target tab: ${tabId}`);

      const result = await executeScript(tabId, () => {
        console.log("[DeepSeek Page] 🔍 Extracting response from page...");

        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        const messageContainers = Array.from(
          document.querySelectorAll('[class*="message"]')
        );

        console.log(
          `[DeepSeek Page] 📊 Found ${messageContainers.length} message containers`
        );

        if (messageContainers.length === 0) {
          console.error("[DeepSeek Page] ❌ No message containers found");
          return null;
        }

        const lastContainer = messageContainers[messageContainers.length - 1];
        const textContent = lastContainer.textContent?.trim();

        console.log(
          `[DeepSeek Page] 📏 Last message content length: ${
            textContent?.length || 0
          }`
        );
        console.log(
          `[DeepSeek Page] 📝 Last message preview (first 300 chars): ${textContent?.substring(
            0,
            300
          )}`
        );

        if (!textContent) {
          console.error("[DeepSeek Page] ❌ Last message container is empty");
          return null;
        }

        return textContent;
      });

      console.log(`[PromptController] 📥 Received result from page`);
      console.log(`[PromptController] 📊 Result type: ${typeof result}`);
      console.log(
        `[PromptController] 📏 Result length: ${result?.length || 0}`
      );

      if (result) {
        console.log(`[PromptController] 📝 Raw result (first 500 chars):`);
        console.log(result.substring(0, 500));

        // Parse JSON nếu có thể
        try {
          console.log(
            `[PromptController] 🔧 Attempting to extract JSON from result...`
          );

          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log(`[PromptController] ✅ JSON pattern found`);
            console.log(
              `[PromptController] 📏 JSON match length: ${jsonMatch[0].length}`
            );
            console.log(
              `[PromptController] 📝 JSON match preview (first 500 chars):`
            );
            console.log(jsonMatch[0].substring(0, 500));

            // 🔧 FIX: Sanitize JSON string trước khi parse
            let sanitizedJson = jsonMatch[0];

            console.log(`[PromptController] 🔧 Starting JSON sanitization...`);

            // 🆕 CRITICAL FIX: Improved regex để handle nested quotes
            // Match pattern: "field": "value with possible "quotes" inside"
            let sanitizationCount = 0;
            sanitizedJson = sanitizedJson.replace(
              /(:\s*")([^"]*(?:"(?:[^"\\]|\\.)*")*[^"]*?)("(?:\s*[,}\]]|$))/g,
              (
                fullMatch: string,
                prefix: string,
                content: string,
                suffix: string
              ): string => {
                sanitizationCount++;

                console.log(
                  `[PromptController] 🔍 Sanitization ${sanitizationCount}:`
                );
                console.log(`  - Original content length: ${content.length}`);
                console.log(
                  `  - Original content preview: ${content.substring(0, 100)}`
                );

                // Escape các ký tự đặc biệt trong content
                const escaped = content
                  .replace(/\\/g, "\\\\") // Escape backslashes TRƯỚC
                  .replace(/"/g, '\\"') // Escape double quotes
                  .replace(/\n/g, "\\n") // Escape newlines
                  .replace(/\r/g, "\\r") // Escape carriage returns
                  .replace(/\t/g, "\\t"); // Escape tabs

                console.log(`  - Escaped content length: ${escaped.length}`);
                console.log(
                  `  - Escaped content preview: ${escaped.substring(0, 100)}`
                );

                return prefix + escaped + suffix;
              }
            );

            console.log(
              `[PromptController] ✅ Sanitization complete: ${sanitizationCount} replacements`
            );
            console.log(
              `[PromptController] 📝 Sanitized JSON preview (first 500 chars):`
            );
            console.log(sanitizedJson.substring(0, 500));

            console.log(
              `[PromptController] 🔧 Attempting to parse sanitized JSON...`
            );
            const jsonResponse = JSON.parse(sanitizedJson);

            console.log(`[PromptController] ✅ JSON parsed successfully!`);
            console.log(
              `[PromptController] 📊 Parsed response keys:`,
              Object.keys(jsonResponse)
            );

            if (jsonResponse.choices) {
              console.log(
                `[PromptController] 📊 Choices count: ${jsonResponse.choices.length}`
              );
              if (jsonResponse.choices[0]) {
                console.log(
                  `[PromptController] 📊 First choice keys:`,
                  Object.keys(jsonResponse.choices[0])
                );
                if (jsonResponse.choices[0].delta) {
                  console.log(
                    `[PromptController] 📊 Delta keys:`,
                    Object.keys(jsonResponse.choices[0].delta)
                  );
                  console.log(
                    `[PromptController] 📏 Content length: ${
                      jsonResponse.choices[0].delta.content?.length || 0
                    }`
                  );
                }
              }
            }

            // 🔧 CRITICAL FIX: Return stringified JSON thay vì plain text
            const stringifiedResponse = JSON.stringify(jsonResponse);
            console.log(
              `[PromptController] 📤 Returning stringified JSON (length: ${stringifiedResponse.length})`
            );
            console.log(
              `[PromptController] 📝 Stringified preview (first 300 chars):`
            );
            console.log(stringifiedResponse.substring(0, 300));
            console.log(
              `[PromptController] ===== EXTRACTING RESPONSE END (SUCCESS) =====\n`
            );

            return stringifiedResponse;
          } else {
            console.warn(
              `[PromptController] ⚠️ No JSON pattern found in result`
            );
          }
        } catch (parseError) {
          console.error(`[PromptController] ❌ JSON PARSING FAILED:`);
          console.error(`  - Error:`, parseError);
          console.error(
            `  - Error message:`,
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          );
          console.error(
            `  - Raw result (first 1000 chars):`,
            result.substring(0, 1000)
          );

          // 🆕 THÊM: Try to identify the exact location of parse error
          if (parseError instanceof Error && parseError.message) {
            const errorMsg = parseError.message;
            const posMatch =
              errorMsg.match(/position (\d+)/i) ||
              errorMsg.match(/column (\d+)/i);
            if (posMatch) {
              const errorPos = parseInt(posMatch[1]);
              console.error(`  - Error at position ${errorPos}:`);
              console.error(
                `  - Context (50 chars before): ${result.substring(
                  Math.max(0, errorPos - 50),
                  errorPos
                )}`
              );
              console.error(`  - Problem char: '${result.charAt(errorPos)}'`);
              console.error(
                `  - Context (50 chars after): ${result.substring(
                  errorPos,
                  errorPos + 50
                )}`
              );
            }
          }
        }

        console.log(
          `[PromptController] 📤 Returning raw result (no JSON found/parsed)`
        );
        console.log(
          `[PromptController] ===== EXTRACTING RESPONSE END (RAW) =====\n`
        );
        return result;
      } else {
        console.error(`[PromptController] ❌ No result from page`);
        console.log(
          `[PromptController] ===== EXTRACTING RESPONSE END (NULL) =====\n`
        );
        return null;
      }
    } catch (error) {
      console.error(
        `[PromptController] ❌ EXCEPTION in getLatestResponseDirectly:`
      );
      console.error(`  - Error:`, error);
      console.error(
        `  - Error type:`,
        error instanceof Error ? error.constructor.name : typeof error
      );
      console.error(
        `  - Error message:`,
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        `  - Stack trace:`,
        error instanceof Error ? error.stack : "N/A"
      );
      console.log(
        `[PromptController] ===== EXTRACTING RESPONSE END (EXCEPTION) =====\n`
      );
      return null;
    }
  }
}
