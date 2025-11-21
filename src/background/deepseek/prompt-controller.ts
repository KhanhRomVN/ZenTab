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
    requestId: string
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
      await ChatController.clickNewChatButton(tabId);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 🆕 FIX: Dùng prompt từ Backend (đã bao gồm system prompt)
      // Không cần wrap nữa vì Backend đã gửi đầy đủ
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
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let sanitizedJson = jsonMatch[0];
            let sanitizationCount = 0;
            sanitizedJson = sanitizedJson.replace(
              /(:\s*")([^"]*(?:"(?:[^"\\]|\\.)*")*[^"]*?)("(?:\s*[,}\]]|$))/g,
              (
                _fullMatch: string,
                prefix: string,
                content: string,
                suffix: string
              ): string => {
                sanitizationCount++;

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
            const stringifiedResponse = JSON.stringify(jsonResponse);

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

        return result;
      } else {
        console.error(`[PromptController] ❌ No result from page`);
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
      return null;
    }
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
