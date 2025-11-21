// src/background/deepseek/prompt-controller.ts
import { executeScript, getBrowserAPI } from "../utils/browser-helper";
import { StateController } from "./state-controller";
import { ChatController } from "./chat-controller";
import { DEFAULT_CONFIG, DeepSeekConfig } from "./types";
import { TabStateManager } from "../utils/tab-state-manager";

export class PromptController {
  private static activePollingTasks: Map<number, string> = new Map();
  private static config: DeepSeekConfig = DEFAULT_CONFIG;
  private static tabStateManager = TabStateManager.getInstance();

  private static async validateTab(
    tabId: number
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      const browserAPI = getBrowserAPI();

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

      if (!tab.url?.startsWith("https://chat.deepseek.com")) {
        return {
          isValid: false,
          error: `Tab is not DeepSeek page: ${tab.url}`,
        };
      }

      const tabState = await this.tabStateManager.getTabState(tabId);

      if (!tabState) {
        console.warn(
          `[PromptController] ⚠️ Tab ${tabId} state not found (may have been recovered by cache fallback)`
        );
        return {
          isValid: false,
          error: `Tab ${tabId} state not found in TabStateManager after fallback attempts`,
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
        error:
          error instanceof Error
            ? error.message
            : `Unknown error validating tab ${tabId}`,
      };
    }
  }

  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask: boolean = true
  ): Promise<boolean> {
    try {
      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        console.error(
          `[PromptController] ❌ Tab validation failed: ${validation.error}`
        );

        const browserAPI = getBrowserAPI();
        try {
          const FIXED_CONNECTION_ID = "ws-default-1500";

          const statesResult = await new Promise<any>((resolve, reject) => {
            browserAPI.storage.local.get(["wsStates"], (data: any) => {
              if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
                return;
              }
              resolve(data || {});
            });
          });

          const wsStates = statesResult?.wsStates || {};
          const connectionState = wsStates[FIXED_CONNECTION_ID];

          if (connectionState && connectionState.status === "connected") {
            const errorPayload = {
              wsOutgoingMessage: {
                connectionId: FIXED_CONNECTION_ID,
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

            await browserAPI.storage.local.set(errorPayload);
          } else {
            console.error(
              `[PromptController] ❌ WebSocket not connected (status: ${
                connectionState?.status || "unknown"
              })`
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

      await this.tabStateManager.markTabBusy(tabId, requestId);

      if (isNewTask === true) {
        await ChatController.clickNewChatButton(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const finalPrompt = prompt;

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

              // Step 1: Focus textarea
              textarea.focus();

              // Step 2: Set value
              textarea.value = text;

              // Step 3: Create proper InputEvent with data property
              const inputEvent = new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                data: text,
                inputType: "insertText",
              });
              textarea.dispatchEvent(inputEvent);

              // Step 4: Dispatch change event
              const changeEvent = new Event("change", { bubbles: true });
              textarea.dispatchEvent(changeEvent);

              // Step 5: Trigger React's internal event system
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
                step: "textarea_filled",
                debug: {
                  textareaExists: true,
                  textareaValue: textarea.value.substring(0, 50),
                  textareaDisabled: textarea.disabled,
                  textareaReadOnly: textarea.readOnly,
                  textareaFocused: document.activeElement === textarea,
                },
              };
            },
            [finalPrompt]
          );

          if (result && result.success) {
            break;
          } else {
            console.warn(
              `[PromptController] ⚠️ Textarea fill returned non-success result:`,
              result
            );
          }
        } catch (injectError) {
          console.error(
            `[PromptController] ❌ Textarea fill attempt ${
              4 - retries
            }/3 failed:`,
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
          `[PromptController] ❌ All textarea fill attempts failed - marking tab FREE for cleanup`
        );
        await this.tabStateManager.markTabFree(tabId);
        return false;
      }

      // Wait longer for button to enable (DeepSeek UI needs time to process events)
      await new Promise((resolve) => setTimeout(resolve, 3000));

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
              allButtons: document.querySelectorAll(".ds-icon-button").length,
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
          // Try to trigger button enable by re-focusing textarea and dispatching events
          const textarea = document.querySelector(
            'textarea[placeholder="Message DeepSeek"]'
          ) as HTMLTextAreaElement;

          if (textarea && textarea.value) {
            // Re-focus and trigger events
            textarea.focus();
            textarea.blur();
            textarea.focus();

            // Dispatch multiple events to trigger validation
            const events = [
              new Event("input", { bubbles: true }),
              new Event("change", { bubbles: true }),
              new Event("keyup", { bubbles: true }),
              new Event("keydown", { bubbles: true }),
            ];

            events.forEach((event) => textarea.dispatchEvent(event));

            // Check button state again after short delay
            const checkAfterMs = 500;
            return new Promise((resolve) => {
              setTimeout(() => {
                const stillDisabled = sendButton.classList.contains(
                  "ds-icon-button--disabled"
                );

                if (stillDisabled) {
                  resolve({
                    success: false,
                    reason: "button_still_disabled_after_retry",
                    debug: {
                      buttonExists: true,
                      isDisabled: true,
                      classList: Array.from(sendButton.classList),
                      textareaValue: textarea.value.substring(0, 50),
                      textareaFocused: document.activeElement === textarea,
                    },
                  });
                } else {
                  // Button enabled, click it
                  sendButton.click();
                  resolve({
                    success: true,
                    debug: {
                      buttonExists: true,
                      isDisabled: false,
                      clicked: true,
                      retriedEvents: true,
                    },
                  });
                }
              }, checkAfterMs);
            });
          }

          return {
            success: false,
            reason: "button_disabled",
            debug: {
              buttonExists: true,
              isDisabled: true,
              classList: Array.from(sendButton.classList),
              textareaExists: !!textarea,
              textareaValue: textarea?.value.substring(0, 50) || "N/A",
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
        this.monitorButtonStateUntilComplete(tabId, requestId, clickTimestamp);
      } else {
        console.error(
          `[PromptController] ❌ Send button click failed - marking tab FREE`
        );
        console.error(`[PromptController] 💡 Click result:`, clickResult);
        console.error(
          `[PromptController] 💡 Hint: Button may be disabled due to DeepSeek UI validation or tab is currently processing another request.`
        );
        await this.tabStateManager.markTabFree(tabId);
        return false;
      }

      this.activePollingTasks.set(tabId, requestId);
      this.startResponsePolling(tabId, requestId);

      return true;
    } catch (error) {
      console.error(
        `[PromptController] ❌ CRITICAL EXCEPTION in sendPrompt:`,
        error
      );
      console.error(
        `[PromptController] 📍 Exception occurred at: tabId=${tabId}, requestId=${requestId}`
      );
      console.error(
        `[PromptController] ℹ️ Tab remains in current state (likely FREE if exception before button click)`
      );

      return false;
    }
  }

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
    let responseSent = false;

    const poll = async () => {
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        return;
      }

      if (responseSent) {
        return;
      }

      pollCount++;

      try {
        const isGenerating = await StateController.isGenerating(tabId);

        if (!isGenerating && pollCount >= 3) {
          if (responseSent) {
            console.warn(
              `[PromptController] 🚫 DUPLICATE RESPONSE PREVENTED: ${capturedRequestId}`
            );
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          const rawResponse = await this.getLatestResponseDirectly(tabId);

          if (rawResponse) {
            responseSent = true;
            await this.tabStateManager.markTabFree(tabId);
            this.activePollingTasks.delete(tabId);

            // 🆕 CRITICAL: Lấy folderPath từ wsMessages TRƯỚC KHI link
            let folderPathToLink: string | null = null;
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

                if (matchingMsg && matchingMsg.data?.folderPath) {
                  folderPathToLink = matchingMsg.data.folderPath;
                  break;
                }
              }
            } catch (error) {
              console.error(
                "[PromptController] ❌ Failed to get folderPath from wsMessages:",
                error
              );
            }

            let responseToSend: string = "";

            // 🆕 BUILD OPENAI JSON FORMAT từ raw text
            if (typeof rawResponse === "string") {
              try {
                // Try parse nếu response đã là JSON
                const parsedObject = JSON.parse(rawResponse);

                // Validate structure
                if (
                  parsedObject &&
                  typeof parsedObject === "object" &&
                  parsedObject.choices
                ) {
                  responseToSend = JSON.stringify(parsedObject);
                } else {
                  // JSON nhưng thiếu structure → rebuild
                  console.warn(
                    `[PromptController] ⚠️ JSON missing required fields, rebuilding...`
                  );
                  const builtResponse = this.buildOpenAIResponse(rawResponse);
                  responseToSend = JSON.stringify(builtResponse);
                }
              } catch (parseError) {
                // Raw text → build JSON format
                const builtResponse = this.buildOpenAIResponse(rawResponse);
                responseToSend = JSON.stringify(builtResponse);
              }
            } else if (
              typeof rawResponse === "object" &&
              rawResponse !== null
            ) {
              // Object → stringify
              // 🔧 FIX: Type assertion để tránh TypeScript error
              const responseObj = rawResponse as any;

              if (responseObj.choices) {
                responseToSend = JSON.stringify(responseObj);
              } else {
                // Object thiếu structure → rebuild
                const builtResponse = this.buildOpenAIResponse(
                  JSON.stringify(responseObj)
                );
                responseToSend = JSON.stringify(builtResponse);
              }
            } else {
              // Unknown type → convert to string và build
              console.warn(
                `[PromptController] ⚠️ Unexpected response type: ${typeof rawResponse}`
              );
              const builtResponse = this.buildOpenAIResponse(
                String(rawResponse)
              );
              responseToSend = JSON.stringify(builtResponse);
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

            const currentTimestamp = Date.now();

            // 🆕 CRITICAL: Link tab VỚI folder TRƯỚC KHI gửi response
            if (folderPathToLink) {
              console.log(
                `[PromptController] 🔗 Linking tab ${tabId} to folder BEFORE sending response: ${folderPathToLink}`
              );
              await this.tabStateManager.linkTabToFolder(
                tabId,
                folderPathToLink
              );
            }

            const messagePayload = {
              wsOutgoingMessage: {
                connectionId: targetConnectionId,
                data: {
                  type: "promptResponse",
                  requestId: requestId,
                  tabId: tabId,
                  success: true,
                  response: responseToSend,
                  timestamp: currentTimestamp,
                },
                timestamp: currentTimestamp,
              },
            };

            await browserAPI.storage.local.set(messagePayload);
            this.activePollingTasks.delete(tabId);
          } else {
            console.error(
              "[PromptController] ❌ Failed to fetch response from DeepSeek for requestId:",
              capturedRequestId
            );

            await this.tabStateManager.markTabFree(tabId);

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
          await this.tabStateManager.markTabFree(tabId);

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
        await this.tabStateManager.markTabFree(tabId);

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

        // 🔍 LOG: Exception error trước khi gửi
        const errorMessage =
          error instanceof Error ? error.message : "Unknown polling error";

        await browserAPI.storage.local.set({
          wsOutgoingMessage: {
            connectionId: targetConnectionId,
            data: {
              type: "promptResponse",
              requestId: requestId,
              tabId: tabId,
              success: false,
              error: errorMessage,
            },
            timestamp: Date.now(),
          },
        });
      }
    };
    setTimeout(poll, this.config.initialDelay);
  }

  private static async getLatestResponseDirectly(
    tabId: number
  ): Promise<string | null> {
    try {
      // Step 1: Lấy innerHTML từ page và extract markdown structure
      const extractedContent = await executeScript(tabId, () => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        // Strategy 1: Tìm tất cả ds-markdown containers
        const markdownContainers = Array.from(
          document.querySelectorAll(".ds-markdown")
        );

        if (markdownContainers.length > 0) {
          const lastMarkdown =
            markdownContainers[markdownContainers.length - 1];

          // Tìm parent container chứa toàn bộ message
          let messageContainer: Element = lastMarkdown;
          let parent = lastMarkdown.parentElement;
          let level = 0;

          while (parent && level < 5) {
            const parentClasses = parent.className || "";
            if (
              parentClasses.includes("message") ||
              parentClasses.includes("content") ||
              parentClasses.includes("assistant") ||
              parentClasses.includes("response")
            ) {
              messageContainer = parent;
              break;
            }
            const childMarkdowns = parent.querySelectorAll(".ds-markdown");
            if (
              childMarkdowns.length === 1 &&
              parent.textContent &&
              parent.textContent.length >
                (messageContainer.textContent?.length || 0)
            ) {
              messageContainer = parent;
            }
            parent = parent.parentElement;
            level++;
          }

          const extractMarkdown = (element: Element): string => {
            let result = "";

            const traverse = (node: Node): void => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || "";

                if (
                  text.includes("<task_progress>") ||
                  text.includes("</task_progress>")
                ) {
                  result += text;
                  return;
                }

                result += text;
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                const tag = el.tagName.toLowerCase();
                const className = el.className || "";

                // 🆕 CRITICAL: Xử lý đặc biệt cho ds-markdown-html spans (chứa XML tags)
                if (className.includes("ds-markdown-html")) {
                  const htmlContent = el.textContent || "";

                  // 🆕 CRITICAL: Nếu là closing tag và không có newline trước nó
                  // thì tự động thêm newline
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

                  // 🆕 CRITICAL: Kiểm tra xem list này có phải là task_progress không
                  // Check previous sibling để tìm <task_progress> tag
                  let isTaskProgressList = false;
                  let sibling = el.previousElementSibling;
                  let checkCount = 0;

                  // Check tối đa 3 sibling trước đó
                  while (sibling && checkCount < 3) {
                    const siblingText = sibling.textContent || "";
                    if (
                      siblingText.includes("<task_progress>") ||
                      siblingText.includes("&lt;task_progress&gt;")
                    ) {
                      isTaskProgressList = true;
                      break;
                    }
                    sibling = sibling.previousElementSibling;
                    checkCount++;
                  }

                  items.forEach((item, index) => {
                    if (item.tagName.toLowerCase() === "li") {
                      // 🆕 CRITICAL: Kiểm tra checkbox trong li
                      const checkbox = item.querySelector(
                        'input[type="checkbox"]'
                      ) as HTMLInputElement | null;

                      if (checkbox) {
                        // Task list item với checkbox thực
                        const isChecked = checkbox.checked;
                        result += isChecked ? "- [x] " : "- [ ] ";

                        // Extract text content, skipping the checkbox element
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
                      } else if (isTaskProgressList) {
                        // 🆕 Task progress list WITHOUT checkbox element → force add "- [ ] "
                        result += "- [ ] ";

                        // Extract text content và trim để loại bỏ whitespace thừa
                        const itemText = (item.textContent || "")
                          .replace(/\s+/g, " ")
                          .trim();
                        result += itemText + "\n";
                      } else {
                        // Regular list item (including lists inside <thinking>)
                        if (tag === "ol") {
                          result += `${index + 1}. `;
                        } else {
                          result += "- ";
                        }

                        // 🆕 FIX: Extract content recursively VÀ GIỮ NGUYÊN paragraph structure
                        Array.from(item.childNodes).forEach((child) => {
                          if (child.nodeType === Node.TEXT_NODE) {
                            result += child.textContent || "";
                          } else if (child.nodeType === Node.ELEMENT_NODE) {
                            const childEl = child as Element;
                            const childTag = childEl.tagName.toLowerCase();

                            // Handle <p> inside <li> - keep newline structure
                            if (childTag === "p") {
                              traverse(child);
                              // Remove the automatic "\n\n" that paragraph adds
                              // and replace with single newline for list item
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
                  // Only add newlines if there's actual content
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

                // Add line break for block elements
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

          let markdownText = extractMarkdown(messageContainer);

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

          return { content: markdownText, method: "ds-markdown-parent" };
        }

        // Strategy 2: Fallback - tìm theo class "message"
        const messageContainers = Array.from(
          document.querySelectorAll('[class*="message"]')
        );

        if (messageContainers.length === 0) {
          console.error("[DeepSeek Page] ❌ No message containers found");
          return null;
        }

        const lastContainer = messageContainers[messageContainers.length - 1];
        const textContent = lastContainer.textContent || "";

        if (!textContent) {
          console.error("[DeepSeek Page] ❌ Last message container is empty");
          return null;
        }

        return { content: textContent, method: "fallback-message" };
      });

      if (!extractedContent) {
        console.error(`[PromptController] ❌ No result from page`);
        return null;
      }

      const { content } = extractedContent as {
        content: string;
        method: string;
      };

      // Step 2: Decode HTML entities
      const decodedResult = this.decodeHtmlEntities(content);

      // 🆕 Step 2.5: Validate and fix XML structure
      const xmlFixedResult = this.fixXmlStructure(decodedResult);

      // Clean up excessive newlines (giữ lại tối đa 2 newlines liên tiếp)
      let cleanedResult = xmlFixedResult.replace(/\n{3,}/g, "\n\n").trim();

      // 🆕 Additional cleanup: Fix spacing trong numbered lists
      cleanedResult = cleanedResult.replace(/(\d+\.)\s+\n/g, "$1 ");

      // 🆕 CRITICAL: Ensure proper newlines around ALL XML closing tags
      // Pattern: "text</tag>" → "text\n</tag>" (nếu chưa có newline)
      cleanedResult = cleanedResult.replace(/([^\n])(<\/[a-z_]+>)/g, "$1\n$2");

      // 🆕 CRITICAL: Ensure proper newlines between consecutive closing tags
      // Pattern: "</tag1></tag2>" → "</tag1>\n</tag2>"
      cleanedResult = cleanedResult.replace(
        /(<\/[a-z_]+>)(<\/[a-z_]+>)/g,
        "$1\n$2"
      );

      // Step 3: Try to parse as JSON (if response is JSON)
      try {
        const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let sanitizedJson = jsonMatch[0];
          sanitizedJson = sanitizedJson.replace(
            /(:\s*")([^"]*(?:"(?:[^"\\]|\\.)*")*[^"]*?)("(?:\s*[,}\]]|$))/g,
            (
              _fullMatch: string,
              prefix: string,
              content: string,
              suffix: string
            ): string => {
              const escaped = content
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
              return prefix + escaped + suffix;
            }
          );

          const jsonResponse = JSON.parse(sanitizedJson);
          return JSON.stringify(jsonResponse);
        }
      } catch (parseError) {
        console.warn(
          `[PromptController] ⚠️ JSON parse failed, returning raw text`
        );
      }

      // Return cleaned text
      return cleanedResult;
    } catch (error) {
      console.error(
        `[PromptController] ❌ EXCEPTION in getLatestResponseDirectly:`,
        error
      );
      return null;
    }
  }

  /**
   * Decode HTML entities trong string
   * Chuyển &lt; → <, &gt; → >, &amp; → &, &quot; → ", &#39; → '
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
    let replacementCount = 0;

    for (const [entity, char] of Object.entries(entities)) {
      const countBefore = (
        decoded.match(
          new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
        ) || []
      ).length;
      if (countBefore > 0) {
        replacementCount += countBefore;
      }
      decoded = decoded.split(entity).join(char);
    }

    // Handle numeric entities: &#123; → {
    decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
      String.fromCharCode(parseInt(num, 10))
    );

    // Handle hex entities: &#x7B; → {
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    return decoded;
  }

  /**
   * 🆕 Validate và fix XML structure trong response
   * Fix lỗi: <task_progress> nằm bên trong <read_file> hoặc các tool tags khác
   */
  private static fixXmlStructure(content: string): string {
    let fixed = content;
    fixed = fixed.replace(/(<\/[a-z_]+>)(<[a-z_]+>)/g, "$1\n$2");
    return fixed;
  }

  private static buildOpenAIResponse(content: string): any {
    // Generate unique IDs
    const generateHex = (length: number): string => {
      return Array.from({ length }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
    };

    const responseId = `chatcmpl-${generateHex(16)}`;
    const systemFingerprint = `fp_${generateHex(8)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Estimate tokens (rough approximation)
    const contentLength = content.length;
    const estimatedTokens = Math.ceil(contentLength / 4);

    return {
      id: responseId,
      object: "chat.completion.chunk",
      created: timestamp,
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
      usage: {
        prompt_tokens: 0,
        completion_tokens: estimatedTokens,
        total_tokens: estimatedTokens,
      },
      system_fingerprint: systemFingerprint,
    };
  }
}
