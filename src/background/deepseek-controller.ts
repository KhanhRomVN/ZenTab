// src/background/deepseek-controller.ts

// Helper function to get browser API
const getBrowserAPI = () => {
  if (typeof (globalThis as any).browser !== "undefined") {
    return (globalThis as any).browser;
  }
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  throw new Error("No browser API available");
};

// Helper function to execute script (Firefox + Chrome compatible)
const executeScript = async (
  tabId: number,
  func: Function,
  args?: any[]
): Promise<any> => {
  const browserAPI = getBrowserAPI();

  // Chrome/Chromium - use chrome.scripting
  if (browserAPI.scripting && browserAPI.scripting.executeScript) {
    const result = await browserAPI.scripting.executeScript({
      target: { tabId },
      func: func,
      args: args,
    });
    return result[0]?.result ?? null;
  }

  // Firefox - use browser.tabs.executeScript
  if (browserAPI.tabs && browserAPI.tabs.executeScript) {
    // Convert function to string for Firefox
    const funcString = args
      ? `(${func.toString()})(${args
          .map((arg) => JSON.stringify(arg))
          .join(", ")})`
      : `(${func.toString()})()`;

    const result = await browserAPI.tabs.executeScript(tabId, {
      code: funcString,
    });

    return result && result.length > 0 ? result[0] : null;
  }

  throw new Error("No script execution API available");
};

export class DeepSeekController {
  /**
   * Lấy trạng thái DeepThink button
   */
  public static async isDeepThinkEnabled(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        const button = document.querySelector("button.ds-toggle-button");
        if (!button) return null;

        return button.classList.contains("ds-toggle-button--selected");
      });

      return result ?? false;
    } catch (error) {
      console.error(
        "[DeepSeekController] Failed to check DeepThink status:",
        error
      );
      return false;
    }
  }

  /**
   * Bật/tắt DeepThink
   */
  public static async toggleDeepThink(
    tabId: number,
    enable: boolean
  ): Promise<boolean> {
    try {
      const result = await executeScript(
        tabId,
        (targetState: boolean) => {
          const button = document.querySelector(
            "button.ds-toggle-button"
          ) as HTMLButtonElement;
          if (!button) return false;

          const isCurrentlyEnabled = button.classList.contains(
            "ds-toggle-button--selected"
          );

          // Chỉ click nếu trạng thái hiện tại khác với trạng thái mong muốn
          if (isCurrentlyEnabled !== targetState) {
            button.click();
            return true;
          }

          return false;
        },
        [enable]
      );

      return result ?? false;
    } catch (error) {
      console.error("[DeepSeekController] Failed to toggle DeepThink:", error);
      return false;
    }
  }

  /**
   * Gửi prompt tới DeepSeek
   */
  public static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string
  ): Promise<boolean> {
    try {
      // 🆕 STEP 1: Kiểm tra tab có tồn tại không
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
          console.error("[DeepSeekController] ❌ Tab not found:", tabId);
          return false;
        }

        // 🆕 STEP 2: Kiểm tra URL có đúng DeepSeek không
        if (!tab.url?.startsWith("https://chat.deepseek.com")) {
          console.error(
            "[DeepSeekController] ❌ Tab is not DeepSeek page:",
            tab.url
          );
          return false;
        }
      } catch (tabError) {
        console.error(
          "[DeepSeekController] ❌ Failed to validate tab:",
          tabError
        );
        return false;
      }

      // 🆕 STEP 3: Thử inject script với retry mechanism
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
                console.error("[DeepSeek Page] ❌ Textarea not found!");
                return false;
              }

              // Set value
              textarea.value = text;

              // Trigger input event
              const inputEvent = new Event("input", { bubbles: true });
              textarea.dispatchEvent(inputEvent);

              // Wait a bit for button to enable
              setTimeout(() => {
                const sendButton = document.querySelector(
                  ".ds-icon-button._7436101"
                ) as HTMLButtonElement;

                if (
                  !sendButton ||
                  sendButton.classList.contains("ds-icon-button--disabled")
                ) {
                  console.error(
                    "[DeepSeek Page] ❌ Send button not found or disabled!"
                  );
                  return;
                }

                sendButton.click();
              }, 500);

              return true;
            },
            [prompt]
          );

          if (result) {
            break;
          }
        } catch (injectError) {
          console.error(
            `[DeepSeekController] ❌ Script injection failed (attempt ${
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

      if (!result) {
        console.error(
          "[DeepSeekController] ❌ All script injection attempts failed!"
        );
        return false;
      }

      if (result) {
        this.startResponsePolling(tabId, requestId);
      } else {
        console.error(
          "[DeepSeekController] ❌ Script execution returned false"
        );
      }

      return result ?? false;
    } catch (error) {
      console.error("[DeepSeekController] ❌ EXCEPTION in sendPrompt:", error);
      console.error("[DeepSeekController] Error details:", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return false;
    }
  }

  // 🆕 THÊM FUNCTION MỚI: Polling để đợi AI trả lời xong
  private static async startResponsePolling(
    tabId: number,
    requestId: string
  ): Promise<void> {
    const browserAPI = getBrowserAPI();
    let pollCount = 0;
    const maxPolls = 180;
    const pollInterval = 1000;

    const poll = async () => {
      pollCount++;
      try {
        const isGenerating = await this.isGenerating(tabId);
        if (!isGenerating && pollCount >= 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await this.getLatestResponseByClickingCopy(tabId);

          if (response) {
            // 🆕 CRITICAL FIX: Đọc wsMessages để lấy connection ID thực tế
            let targetConnectionId: string | null = null;

            try {
              // Đọc từ wsMessages (chứa tất cả messages từ connections)
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

              // Lấy connection ID đầu tiên có messages (connection đang hoạt động)
              const messageConnectionIds = Object.keys(wsMessages);

              if (messageConnectionIds.length > 0) {
                // Lấy connection cuối cùng (mới nhất)
                targetConnectionId =
                  messageConnectionIds[messageConnectionIds.length - 1];
              } else {
                console.warn(
                  "[DeepSeekController] ⚠️ No connections found in wsMessages"
                );
              }
            } catch (storageError) {
              console.error(
                "[DeepSeekController] ❌ Failed to read wsMessages:",
                storageError
              );
            }

            // Nếu không tìm thấy connection nào → báo lỗi
            if (!targetConnectionId) {
              console.error(
                "[DeepSeekController] ❌ CRITICAL: No active WebSocket connection found!"
              );
              console.error(
                "[DeepSeekController] Cannot send response back to ZenChat"
              );

              // Vẫn gửi error message về storage để debug
              await browserAPI.storage.local.set({
                wsOutgoingMessage: {
                  connectionId: "unknown",
                  data: {
                    type: "promptResponse",
                    requestId: requestId,
                    tabId: tabId,
                    success: false,
                    error: "No active WebSocket connection found",
                    errorType: "NO_CONNECTION",
                  },
                  timestamp: Date.now(),
                },
              });

              return; // Dừng ngay, không tiếp tục
            }

            // Build message payload với connection ID đúng
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

            // Ghi vào storage
            await browserAPI.storage.local.set({
              wsOutgoingMessage: messagePayload,
            });
          } else {
            console.error(
              "[DeepSeekController] ❌ Failed to fetch response content"
            );

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

        if (pollCount < maxPolls) {
          const nextPollDelay = pollInterval;
          setTimeout(poll, nextPollDelay);
        } else {
          console.error("[DeepSeekController] ❌ POLLING TIMEOUT!");
          console.error("[DeepSeekController] Timeout details:", {
            totalPolls: pollCount,
            maxPolls,
            lastStatus: "AI may still be generating",
            timestamp: new Date().toISOString(),
          });

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
          `[DeepSeekController] ❌ Poll #${pollCount} failed:`,
          error
        );
        console.error("[DeepSeekController] Error details:", {
          name: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

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
    setTimeout(poll, 3000);
  }

  // 🆕 THÊM FUNCTION MỚI: Click vào copy button và lấy content
  private static async getLatestResponseByClickingCopy(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        // Lấy TẤT CẢ button có class ds-icon-button
        const allButtons = Array.from(
          document.querySelectorAll(".ds-icon-button")
        ) as HTMLElement[];

        // 🆕 Lọc chỉ lấy copy button CÓ REGENERATE BUTTON BÊN CẠNH
        const aiResponseCopyButtons = allButtons.filter((btn) => {
          // Kiểm tra có icon copy không
          const svg = btn.querySelector("svg");
          if (!svg) return false;

          const path = svg.querySelector("path");
          if (!path) return false;

          const pathData = path.getAttribute("d") || "";

          // Copy button có path bắt đầu bằng "M6.14926 4.02039"
          if (!pathData.includes("M6.14926 4.02039")) return false;

          // 🆕 Kiểm tra xem có regenerate button bên cạnh không
          const parent = btn.parentElement;
          if (!parent) return false;

          // Tìm tất cả button siblings
          const siblings = Array.from(
            parent.querySelectorAll(".ds-icon-button")
          );

          // Kiểm tra xem có button nào chứa icon regenerate không
          const hasRegenerateButton = siblings.some((sibling) => {
            const siblingPath = sibling.querySelector("svg path");
            if (!siblingPath) return false;

            const siblingPathData = siblingPath.getAttribute("d") || "";
            // Regenerate button có path chứa "M7.92142 0.349213C10.3745"
            return siblingPathData.includes("M7.92142 0.349213");
          });
          return hasRegenerateButton;
        });

        if (aiResponseCopyButtons.length === 0) {
          console.error(
            "[DeepSeek Page] ❌ No AI response copy buttons found!"
          );
          return null;
        }

        // Lấy button cuối cùng (response mới nhất)
        const lastCopyButton =
          aiResponseCopyButtons[aiResponseCopyButtons.length - 1];

        lastCopyButton.click();

        return new Promise<string | null>((resolve) => {
          setTimeout(async () => {
            try {
              const clipboardText = await navigator.clipboard.readText();
              resolve(clipboardText);
            } catch (error) {
              console.error(
                "[DeepSeek Page] ❌ Failed to read clipboard:",
                error
              );
              console.error("[DeepSeek Page] Error details:", {
                name: error instanceof Error ? error.name : "unknown",
                message: error instanceof Error ? error.message : String(error),
              });
              resolve(null);
            }
          }, 500);
        });
      });

      if (result) {
      } else {
        console.error("[DeepSeekController] ❌ Failed to copy response");
      }

      return result ?? null;
    } catch (error) {
      console.error(
        "[DeepSeekController] ❌ EXCEPTION in getLatestResponseByClickingCopy:",
        error
      );
      console.error("[DeepSeekController] Error details:", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Dừng AI đang trả lời
   */
  public static async stopGeneration(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        // Tìm button stop (có icon hình vuông)
        const stopButton = document.querySelector(
          '.ds-icon-button._7436101 svg path[d*="M2 4.88006"]'
        ) as HTMLElement;
        if (stopButton) {
          const button = stopButton.closest("button") as HTMLButtonElement;
          if (
            button &&
            !button.classList.contains("ds-icon-button--disabled")
          ) {
            button.click();
            return true;
          }
        }
        return false;
      });

      return result ?? false;
    } catch (error) {
      console.error("[DeepSeekController] Failed to stop generation:", error);
      return false;
    }
  }

  /**
   * Lấy nội dung response mới nhất của AI
   */
  public static async getLatestResponse(tabId: number): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        // Tìm tất cả các copy button
        const copyButtons = Array.from(
          document.querySelectorAll(".ds-icon-button.db183363")
        );
        if (copyButtons.length === 0) return null;

        // Lấy button cuối cùng (response mới nhất)
        const lastCopyButton = copyButtons[copyButtons.length - 1];

        // Tìm phần nội dung message gần nhất với button này
        const messageContainer = lastCopyButton.closest('[class*="message"]');
        if (!messageContainer) return null;

        return messageContainer.textContent?.trim() || null;
      });

      return result ?? null;
    } catch (error) {
      console.error(
        "[DeepSeekController] Failed to get latest response:",
        error
      );
      return null;
    }
  }

  /**
   * Tạo chat mới
   */
  public static async createNewChat(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        const newChatButton = document.querySelector(
          "button.ds-floating-button--secondary"
        ) as HTMLButtonElement;
        if (newChatButton && !newChatButton.disabled) {
          newChatButton.click();
          return true;
        }
        return false;
      });

      return result ?? false;
    } catch (error) {
      console.error("[DeepSeekController] Failed to create new chat:", error);
      return false;
    }
  }

  /**
   * Lấy title của chat hiện tại
   */
  public static async getChatTitle(tabId: number): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        const titleElement = document.querySelector(
          ".afa34042.e37a04e4.e0a1edb7"
        );
        return titleElement?.textContent?.trim() || null;
      });

      return result ?? null;
    } catch (error) {
      console.error("[DeepSeekController] Failed to get chat title:", error);
      return null;
    }
  }

  /**
   * Kiểm tra xem AI có đang trả lời không
   * Check bằng cách xem button có icon hình vuông (stop) không
   */
  public static async isGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        const button = document.querySelector(".ds-icon-button._7436101");

        if (!button) {
          return false;
        }

        const svg = button.querySelector("svg");
        if (!svg) {
          return false;
        }

        const path = svg.querySelector("path");
        if (!path) {
          return false;
        }

        const pathData = path.getAttribute("d") || "";
        const isStopIcon = pathData.includes("M2 4.88");
        return isStopIcon;
      });
      return result ?? false;
    } catch (error) {
      console.error(
        "[DeepSeekController] ❌ Failed to check generation status:",
        error
      );
      return false;
    }
  }

  /**
   * Lấy input hiện tại
   */
  public static async getCurrentInput(tabId: number): Promise<string> {
    try {
      const result = await executeScript(tabId, () => {
        const textarea = document.querySelector(
          'textarea[placeholder="Message DeepSeek"]'
        ) as HTMLTextAreaElement;
        return textarea?.value || "";
      });

      return result ?? "";
    } catch (error) {
      console.error("[DeepSeekController] Failed to get current input:", error);
      return "";
    }
  }
}
