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
  // 🆕 Track active polling tasks per tab
  private static activePollingTasks: Map<number, string> = new Map();

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
   * Click vào button "New Chat" để tạo cuộc trò chuyện mới
   */
  public static async clickNewChatButton(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        console.log("[DeepSeek Page] 🔍 Searching for New Chat button...");

        // TRY 1: Tìm button có class _4f3769f (button có icon + hover effect)
        const button1 = document.querySelector(
          '.ds-icon-button._4f3769f[role="button"]'
        ) as HTMLElement;

        if (button1 && !button1.getAttribute("aria-disabled")) {
          console.log(
            "[DeepSeek Page] ✅ Found New Chat button (type 1), clicking..."
          );
          button1.click();
          return true;
        }

        // TRY 2: Tìm button có class _5a8ac7a (button có text "Trò chuyện mới" hoặc "New Chat")
        const allButtons = Array.from(
          document.querySelectorAll("._5a8ac7a")
        ) as HTMLElement[];

        for (const btn of allButtons) {
          const svg = btn.querySelector("svg");
          const pathD = svg?.querySelector("path")?.getAttribute("d");

          // Verify SVG path để chắc chắn đây là button "New Chat"
          if (
            pathD &&
            pathD.includes("M8 0.599609C3.91309 0.599609") &&
            pathD.includes("M7.34473 4.93945V7.34961")
          ) {
            console.log(
              "[DeepSeek Page] ✅ Found New Chat button (type 2), clicking..."
            );
            btn.click();
            return true;
          }
        }

        console.error("[DeepSeek Page] ❌ New Chat button not found!");
        return false;
      });

      if (result) {
        console.log(
          "[DeepSeekController] ✅ New Chat button clicked successfully"
        );
        // Chờ 1s để page load xong chat mới
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return true;
      } else {
        console.error(
          "[DeepSeekController] ❌ Failed to click New Chat button"
        );
        return false;
      }
    } catch (error) {
      console.error(
        "[DeepSeekController] ❌ Exception while clicking New Chat button:",
        error
      );
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

      // 🆕 STEP 2.5: Click New Chat button để tạo cuộc trò chuyện mới
      console.log(
        "[DeepSeekController] 🔄 Creating new chat before sending prompt..."
      );
      const newChatClicked = await this.clickNewChatButton(tabId);

      if (!newChatClicked) {
        console.warn(
          "[DeepSeekController] ⚠️ Failed to create new chat, continuing anyway..."
        );
      }

      // 🆕 STEP 3: Thử inject script với retry mechanism
      let retries = 3;
      let result: any = null;

      while (retries > 0 && !result) {
        try {
          console.log(
            "[DeepSeekController] 🎯 Attempting to inject script into tab:",
            tabId
          );
          console.log("[DeepSeekController] 📝 Prompt to inject:", {
            length: prompt?.length || 0,
            preview:
              prompt?.substring(0, 100) + (prompt?.length > 100 ? "..." : ""),
          });

          result = await executeScript(
            tabId,
            (text: string) => {
              console.log(
                "[DeepSeek Page] 🔍 Script injected, searching for textarea..."
              );
              const textarea = document.querySelector(
                'textarea[placeholder="Message DeepSeek"]'
              ) as HTMLTextAreaElement;

              if (!textarea) {
                console.error("[DeepSeek Page] ❌ Textarea not found!");
                return false;
              }

              console.log(
                "[DeepSeek Page] ✅ Textarea found, pasting prompt..."
              );
              console.log("[DeepSeek Page] 📝 Prompt length:", text.length);

              // Set value
              textarea.value = text;
              console.log("[DeepSeek Page] ✅ Prompt pasted into textarea");

              // Trigger input event
              const inputEvent = new Event("input", { bubbles: true });
              textarea.dispatchEvent(inputEvent);
              console.log("[DeepSeek Page] ✅ Input event triggered");

              // Wait a bit for button to enable
              setTimeout(() => {
                console.log("[DeepSeek Page] 🔍 Searching for send button...");
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

                console.log(
                  "[DeepSeek Page] ✅ Send button found, clicking..."
                );
                sendButton.click();
                console.log(
                  "[DeepSeek Page] ✅ Send button clicked, prompt submitted!"
                );
              }, 500);

              return true;
            },
            [prompt]
          );

          console.log(
            "[DeepSeekController] 📊 Script execution result:",
            result ? "✅ Success" : "❌ Failed"
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
        // 🆕 Cancel old polling task nếu có
        const oldRequestId = this.activePollingTasks.get(tabId);
        if (oldRequestId) {
          console.warn(
            `[DeepSeekController] ⚠️ Cancelling old polling task for tab ${tabId}, requestId: ${oldRequestId}`
          );
        }

        // 🆕 Track new polling task
        this.activePollingTasks.set(tabId, requestId);

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
    // 🆕 CRITICAL: Capture requestId ngay từ đầu để tránh race condition
    const capturedRequestId = requestId;

    console.log("[DeepSeekController] ⏳ Starting response polling...");
    console.log("[DeepSeekController] 📊 Polling config:", {
      tabId,
      requestId: capturedRequestId,
      maxPolls: 180,
      pollInterval: "1000ms",
      initialDelay: "3000ms",
    });

    const browserAPI = getBrowserAPI();
    let pollCount = 0;
    const maxPolls = 180;
    const pollInterval = 1000;
    const startTime = Date.now();

    const poll = async () => {
      // 🆕 Check nếu có request mới hơn thì dừng polling task cũ
      const currentActiveRequest = this.activePollingTasks.get(tabId);
      if (currentActiveRequest !== capturedRequestId) {
        console.warn(
          `[DeepSeekController] ⚠️ Polling cancelled - newer request detected. Old: ${capturedRequestId}, New: ${currentActiveRequest}`
        );
        return; // Dừng polling
      }

      pollCount++;
      const elapsedTime = Date.now() - startTime;

      console.log(
        `[DeepSeekController] 🔄 Poll #${pollCount}/${maxPolls} (${Math.round(
          elapsedTime / 1000
        )}s elapsed) [RequestID: ${capturedRequestId}]`
      );

      try {
        console.log(
          `[DeepSeekController] 🔍 Checking if AI is still generating... [RequestID: ${capturedRequestId}]`
        );
        const isGenerating = await this.isGenerating(tabId);
        console.log(
          `[DeepSeekController] 📊 Generation status: ${
            isGenerating ? "⏳ Still generating" : "✅ Completed"
          } [RequestID: ${capturedRequestId}]`
        );

        if (!isGenerating && pollCount >= 3) {
          console.log(
            `[DeepSeekController] ✅ AI finished generating, waiting 1s before fetching response... [RequestID: ${capturedRequestId}]`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await this.getLatestResponseByClickingCopy(tabId);

          if (response) {
            // 🆕 CRITICAL FIX: Tìm connection ID dựa trên requestId thực tế
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

              // 🆕 TÌM connection ID dựa trên requestId
              for (const [connId, messages] of Object.entries(wsMessages)) {
                const msgArray = messages as Array<{
                  timestamp: number;
                  data: any;
                }>;

                // Tìm message có requestId khớp
                const matchingMsg = msgArray.find(
                  (msg) => msg.data?.requestId === capturedRequestId
                );

                if (matchingMsg) {
                  targetConnectionId = connId;
                  console.log(
                    `[DeepSeekController] ✅ Found matching connection for requestId: ${capturedRequestId} -> ${connId}`
                  );
                  break;
                }
              }

              if (!targetConnectionId) {
                console.error(
                  `[DeepSeekController] ❌ CRITICAL: No connection found for requestId: ${capturedRequestId}`
                );
                console.error(
                  "[DeepSeekController] Available connections:",
                  Object.keys(wsMessages)
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

            console.log(
              "[DeepSeekController] 📤 Preparing to send response to WebSocket"
            );
            console.log(
              "[DeepSeekController] 🎯 Target connection:",
              targetConnectionId
            );

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

            console.log("[DeepSeekController] 📊 Response payload details:", {
              connectionId: targetConnectionId,
              requestId: requestId,
              tabId: tabId,
              responseLength: response?.length || 0,
              responsePreview:
                response?.substring(0, 200) +
                (response?.length > 200 ? "..." : ""),
              timestamp: new Date(messagePayload.timestamp).toISOString(),
            });

            // Ghi vào storage
            await browserAPI.storage.local.set({
              wsOutgoingMessage: messagePayload,
            });

            console.log(
              "[DeepSeekController] ✅ Response sent to storage for WebSocket delivery"
            );

            // 🆕 Clear active task sau khi hoàn thành
            this.activePollingTasks.delete(tabId);
            console.log(
              `[DeepSeekController] 🗑️ Cleared active polling task for tab ${tabId}`
            );
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
          console.log(
            `[DeepSeekController] ⏭️  Scheduling next poll in ${nextPollDelay}ms...`
          );
          setTimeout(poll, nextPollDelay);
        } else {
          console.error("[DeepSeekController] ❌ POLLING TIMEOUT!");
          console.error(
            "[DeepSeekController] ⏱️  Total time elapsed:",
            Math.round(elapsedTime / 1000),
            "seconds"
          );

          // 🆕 Clear active task khi timeout
          this.activePollingTasks.delete(tabId);
          console.log(
            `[DeepSeekController] 🗑️ Cleared active polling task (timeout) for tab ${tabId}`
          );
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
    console.log("[DeepSeekController] 📋 Starting response copy process...");

    try {
      const result = await executeScript(tabId, () => {
        return (async () => {
          console.log("[DeepSeek Page] 🔍 Searching for copy buttons...");

          // 🆕 CẢI TIẾN 1: Đọc clipboard hiện tại
          let oldClipboardContent = "";
          try {
            if (navigator.clipboard) {
              oldClipboardContent = await navigator.clipboard.readText();
            }
          } catch (e) {
            console.log("[DeepSeek Page] ⚠️ Could not read old clipboard");
          }

          // 🆕 CẢI TIẾN 2: Scroll và chờ
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          });
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 🆕 CẢI TIẾN 3: Tìm copy button bằng class chính xác
          console.log(
            "[DeepSeek Page] 🔍 Looking for copy buttons with class 'db183363'..."
          );

          // Tìm TẤT CẢ copy buttons có class db183363
          const allCopyButtons = Array.from(
            document.querySelectorAll(".ds-icon-button.db183363")
          ) as HTMLElement[];

          console.log(
            `[DeepSeek Page] Found ${allCopyButtons.length} copy buttons with class db183363`
          );

          if (allCopyButtons.length === 0) {
            return { success: false, error: "NO_COPY_BUTTON_FOUND" };
          }

          // 🆕 CẢI TIẾN 4: Lọc copy buttons - CHỈ LẤY button của AI RESPONSE
          // Phân biệt:
          // - Copy button của USER prompt: nằm trong container có 2 buttons (copy + edit)
          // - Copy button của AI response: nằm trong container có 5 buttons (copy, retry, thumbs up, thumbs down, share)

          const aiResponseCopyButtons: HTMLElement[] = [];

          for (const button of allCopyButtons) {
            // Tìm parent container chứa các buttons
            let parent = button.parentElement;
            let depth = 0;
            const maxDepth = 10; // ✅ Giới hạn độ sâu tìm kiếm

            while (parent && parent !== document.body && depth < maxDepth) {
              depth++;

              // Kiểm tra xem parent có phải là container của buttons không
              const childButtons = parent.querySelectorAll(".ds-icon-button");

              // Nếu parent có 5 buttons → đây là AI response copy button
              if (childButtons.length === 5) {
                console.log(
                  "[DeepSeek Page] ✅ Found AI response copy button (in 5-button container)"
                );
                aiResponseCopyButtons.push(button);
                break;
              }

              parent = parent.parentElement;
            }

            // ✅ Log nếu không tìm thấy container phù hợp
            if (depth >= maxDepth) {
              console.warn(
                `[DeepSeek Page] ⚠️ Reached max depth for button without finding 5-button container`
              );
            }
          }

          console.log(
            `[DeepSeek Page] Found ${aiResponseCopyButtons.length} AI response copy buttons`
          );

          if (aiResponseCopyButtons.length === 0) {
            console.warn(
              "[DeepSeek Page] ⚠️ No AI response copy buttons found, falling back to last copy button"
            );
            // Fallback: lấy copy button cuối cùng
            aiResponseCopyButtons.push(
              allCopyButtons[allCopyButtons.length - 1]
            );
          }

          // Sắp xếp theo vị trí (mới nhất ở dưới cùng)
          aiResponseCopyButtons.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectB.bottom - rectA.bottom;
          });

          const lastCopyButton = aiResponseCopyButtons[0];

          if (!lastCopyButton) {
            return { success: false, error: "NO_VALID_COPY_BUTTON" };
          }

          console.log("[DeepSeek Page] 🎯 Selected copy button:", {
            className: lastCopyButton.className,
            position: lastCopyButton.getBoundingClientRect(),
          });

          // 🆕 CẢI TIẾN 5: Click và chờ với retry thông minh
          console.log("[DeepSeek Page] 👆 Clicking copy button...");
          lastCopyButton.click();

          // Chờ clipboard update với exponential backoff
          const maxRetries = 20; // ✅ Tăng từ 15 lên 20
          const baseDelay = 200; // ✅ Giảm từ 300ms xuống 200ms

          for (let i = 0; i < maxRetries; i++) {
            const delay = Math.min(baseDelay * Math.pow(1.3, i), 2000); // ✅ Giới hạn max delay = 2s
            await new Promise((resolve) => setTimeout(resolve, delay));

            try {
              if (!navigator.clipboard) {
                console.error(
                  "[DeepSeek Page] ❌ Clipboard API not available!"
                );
                return { success: false, error: "CLIPBOARD_API_UNAVAILABLE" };
              }

              const clipboardText = await navigator.clipboard.readText();

              // ✅ KIỂM TRA: Response có thay đổi không
              if (clipboardText && clipboardText.trim().length > 0) {
                // Kiểm tra xem clipboard có khác với nội dung cũ không
                if (clipboardText !== oldClipboardContent) {
                  console.log(
                    `[DeepSeek Page] ✅ Successfully copied response (${
                      clipboardText.length
                    } chars) after ${i + 1} attempts`
                  );
                  return { success: true, data: clipboardText };
                } else {
                  console.log(
                    `[DeepSeek Page] ⚠️ Attempt ${
                      i + 1
                    }/${maxRetries}: Clipboard unchanged (still old content)`
                  );
                }
              } else {
                console.log(
                  `[DeepSeek Page] ⚠️ Attempt ${
                    i + 1
                  }/${maxRetries}: Clipboard empty or whitespace only`
                );
              }
            } catch (error) {
              console.error(
                `[DeepSeek Page] ❌ Attempt ${
                  i + 1
                }/${maxRetries}: Clipboard read failed:`,
                error
              );
            }
          }

          console.error(
            `[DeepSeek Page] ❌ CLIPBOARD_TIMEOUT after ${maxRetries} attempts`
          );
          return { success: false, error: "CLIPBOARD_TIMEOUT" };
        })();
      });

      // Xử lý kết quả
      if (result?.success) {
        console.log(
          `[DeepSeekController] ✅ Copy successful, response length: ${
            result.data?.length || 0
          } chars`
        );
        return result.data;
      } else {
        console.error("[DeepSeekController] ❌ Copy failed:", result?.error);
        console.error("[DeepSeekController] Full result object:", result);
        return null;
      }
    } catch (error) {
      console.error("[DeepSeekController] ❌ Copy process EXCEPTION:", error);
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
   * Dựa trên 2 trạng thái của send button:
   * - Đang trả lời: có icon hình vuông (stop) - path "M2 4.88006..."
   * - Rảnh: có icon mũi tên (send) - path "M8.3125 0.981648..."
   */
  public static async isGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        console.log("[DeepSeek Page] 🔍 Checking AI generation status...");

        // Tìm send button chính (có thể có nhiều class, nhưng thường có _7436101)
        const sendButton = document.querySelector(".ds-icon-button._7436101");
        if (!sendButton) {
          console.log("[DeepSeek Page] ❌ Send button not found");
          return false;
        }

        // Tìm SVG và path trong send button
        const svg = sendButton.querySelector("svg");
        if (!svg) {
          console.log("[DeepSeek Page] ❌ SVG not found in send button");
          return false;
        }

        const path = svg.querySelector("path");
        if (!path) {
          console.log("[DeepSeek Page] ❌ Path not found in SVG");
          return false;
        }

        const pathData = path.getAttribute("d") || "";
        console.log(
          `[DeepSeek Page] 📊 Send button path data: ${pathData.substring(
            0,
            50
          )}...`
        );

        // 🆕 XÁC ĐỊNH TRẠNG THÁI DỰA TRÊN PATH DATA CHÍNH XÁC

        // Trạng thái đang trả lời: có icon hình vuông (stop)
        const isStopIcon =
          pathData.includes("M2 4.88006") &&
          pathData.includes("C2 3.68015") &&
          pathData.includes("2.30557 2.6596");

        // Trạng thái rảnh: có icon mũi tên (send)
        const isSendIcon =
          pathData.includes("M8.3125 0.981648") &&
          pathData.includes("9.2627 1.4338") &&
          pathData.includes("9.97949 2.1086");

        console.log(`[DeepSeek Page] 📊 Generation status:`, {
          isStopIcon,
          isSendIcon,
          status: isStopIcon
            ? "🔄 Generating"
            : isSendIcon
            ? "✅ Idle"
            : "❓ Unknown",
        });

        // Nếu tìm thấy stop icon → đang generating
        if (isStopIcon) {
          return true;
        }

        // Nếu tìm thấy send icon → không generating
        if (isSendIcon) {
          return false;
        }

        // 🆕 Fallback: Nếu không xác định được bằng path chính xác, dùng heuristic
        console.warn(
          "[DeepSeek Page] ⚠️ Cannot determine status by exact path, using fallback..."
        );

        // Heuristic: Stop icon thường có path phức tạp hơn, bắt đầu bằng "M2"
        // Send icon thường có path bắt đầu bằng "M8"
        if (pathData.startsWith("M2") && pathData.length > 100) {
          return true; // Có thể là stop icon
        } else if (pathData.startsWith("M8") && pathData.length > 50) {
          return false; // Có thể là send icon
        }

        console.error(
          "[DeepSeek Page] ❌ Cannot determine AI generation status"
        );
        return false;
      });

      const isGenerating = result ?? false;
      console.log(
        `[DeepSeekController] 📊 AI Generation Status: ${
          isGenerating ? "🔄 GENERATING" : "✅ IDLE"
        }`
      );
      return isGenerating;
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
