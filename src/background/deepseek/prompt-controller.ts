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

  // Language rule - yêu cầu AI trả lời bằng tiếng Việt
  private static readonly LANGUAGE_RULE = `
CRITICAL LANGUAGE RULE:
- You MUST respond in Vietnamese (Tiếng Việt) for ALL outputs
- All explanations, descriptions, and responses must be in Vietnamese
- Code comments should also be in Vietnamese when possible`;

  // Text wrapping rules - quy tắc format XML tags và code blocks
  private static readonly TEXT_WRAP_RULE = `
CRITICAL TEXT BLOCK WRAPPING RULES (20 RULES - STRICTLY ENFORCED):

═══════════════════════════════════════════════════════════════════
RULE GROUP 1: WHAT MUST BE WRAPPED (MANDATORY)
═══════════════════════════════════════════════════════════════════
1. <task_progress> content MUST ALWAYS be wrapped in \`\`\`text code blocks
   - NO EXCEPTIONS - Even if it's just 1 task item
   - Format: \`\`\`text\n<task_progress>...</task_progress>\n\`\`\`

2. ALL code inside <content> tags of <write_to_file> MUST be wrapped in \`\`\`text
   - Format: <content>\n\`\`\`text\nYOUR_CODE_HERE\n\`\`\`\n</content>

3. ALL code in <diff> tags (BOTH SEARCH and REPLACE sections) MUST be wrapped in \`\`\`text
   - Format: <<<<<<< SEARCH\n\`\`\`text\nOLD_CODE\n\`\`\`\n=======\n\`\`\`text\nNEW_CODE\n\`\`\`\n>>>>>>> REPLACE

═══════════════════════════════════════════════════════════════════
RULE GROUP 2: WRAPPER FORMAT (EXACT SYNTAX)
═══════════════════════════════════════════════════════════════════
4. Text block MUST start with exactly: \`\`\`text (lowercase "text", no spaces)
5. Text block MUST end with exactly: \`\`\` (three backticks, nothing else)
6. NO content allowed before \`\`\`text or after closing \`\`\`
7. Each wrappable item gets its OWN separate \`\`\`text...\`\`\` block

═══════════════════════════════════════════════════════════════════
RULE GROUP 3: WHAT SHOULD NOT BE WRAPPED
═══════════════════════════════════════════════════════════════════
8. <thinking> tags and explanations should NOT be wrapped
9. XML tool tags themselves (<read_file>, <write_to_file>, etc.) should NOT be wrapped
10. Vietnamese explanatory text should NOT be wrapped
11. Do NOT wrap multiple different elements in one text block

═══════════════════════════════════════════════════════════════════
RULE GROUP 4: STRUCTURE REQUIREMENTS
═══════════════════════════════════════════════════════════════════
12. <content></content> tags are MANDATORY inside ALL <write_to_file> operations
13. NEVER omit <content> tags - this will cause parsing errors
14. Code inside <content> MUST be wrapped: <content>\`\`\`text\nCODE\`\`\`</content>

═══════════════════════════════════════════════════════════════════
RULE GROUP 5: INDENTATION PRESERVATION (CRITICAL)
═══════════════════════════════════════════════════════════════════
15. You MUST preserve EXACT indentation (spaces/tabs) from original code
16. Count spaces carefully - if original uses 2 spaces, keep 2 spaces
17. Do NOT apply auto-formatting (Prettier, ESLint, PEP8, etc.)
18. In <replace_in_file>, SEARCH block MUST match indentation EXACTLY character-by-character

═══════════════════════════════════════════════════════════════════
RULE GROUP 6: VALIDATION CHECKLIST (BEFORE SENDING RESPONSE)
═══════════════════════════════════════════════════════════════════
19. Before sending response, verify:
    ✓ Every <task_progress> is wrapped in \`\`\`text...\`\`\`
    ✓ Every <content> block has \`\`\`text wrapper
    ✓ Every SEARCH/REPLACE section has \`\`\`text wrapper
    ✓ No explanatory text inside \`\`\`text blocks
    ✓ Indentation matches original code exactly

20. If you forget to wrap <task_progress>, the system will reject your response

═══════════════════════════════════════════════════════════════════
CORRECT FORMAT EXAMPLES
═══════════════════════════════════════════════════════════════════

✅ Example 1 - Task Progress (CORRECT):
<read_file>
<path>test.ts</path>
\`\`\`text
<task_progress>
- [ ] Phân tích cấu trúc dự án
- [ ] Kiểm tra file hiện tại
- [ ] Thêm hàm mới
</task_progress>
\`\`\`
</read_file>

✅ Example 2 - Write To File (CORRECT):
<write_to_file>
<path>src/new-file.ts</path>
<content>
\`\`\`text
export function myFunction() {
  console.log("Hello");  // 2 spaces indent
  return true;
}
\`\`\`
</content>
</write_to_file>

✅ Example 3 - Replace In File (CORRECT):
<replace_in_file>
<path>src/helper.ts</path>
<diff>
<<<<<<< SEARCH
\`\`\`text
function oldFunction() {
  return "old";
}
\`\`\`
=======
\`\`\`text
function newFunction() {
  return "new";
}
\`\`\`
>>>>>>> REPLACE
</diff>
</replace_in_file>

═══════════════════════════════════════════════════════════════════
INCORRECT FORMAT EXAMPLES (WILL BE REJECTED)
═══════════════════════════════════════════════════════════════════

❌ Example 1 - Task Progress NOT wrapped (CRITICAL ERROR):
<read_file>
<path>test.ts</path>
<task_progress>
- [ ] Do something
</task_progress>
</read_file>

❌ Example 2 - Missing <content> tag:
<write_to_file>
<path>test.ts</path>
\`\`\`text
function test() {}
\`\`\`
</write_to_file>

❌ Example 3 - Code not wrapped:
<write_to_file>
<path>test.ts</path>
<content>
function test() {}
</content>
</write_to_file>

❌ Example 4 - Mixing content in text block:
\`\`\`text
Some explanation text here
<task_progress>
- [ ] Task 1
</task_progress>
More text here
\`\`\`

═══════════════════════════════════════════════════════════════════
FINAL REMINDER
═══════════════════════════════════════════════════════════════════
If you output <task_progress> without wrapping it in \`\`\`text...\`\`\`, 
the system will FAIL to parse your response and the user will see an error.
ALWAYS wrap <task_progress> in \`\`\`text code blocks - NO EXCEPTIONS!
═══════════════════════════════════════════════════════════════════

CRITICAL INDENTATION RULES:
- Read and preserve the EXACT number of spaces or tabs at the beginning of each line
- If original code uses 2 spaces for indentation, keep 2 spaces
- If original code uses 4 spaces, keep 4 spaces
- If original code uses tabs, keep tabs
- Do NOT apply auto-formatting (like Prettier, ESLint, or PEP8)
- Do NOT change indentation to match your preferred style
- Example: If you see "  return a + b;" (2 spaces), you MUST write "  return a + b;" (2 spaces)
- When using <replace_in_file>, the SEARCH block MUST match indentation EXACTLY character-by-character
- When using <write_to_file>, preserve the indentation style of existing files in the project

CORRECT FORMAT EXAMPLES:

Example 1 - Task Progress:
<read_file>
<path>test.ts</path>
\`\`\`text
<task_progress>
- [ ] Phân tích cấu trúc dự án
- [ ] Kiểm tra file hiện tại
- [ ] Thêm hàm mới
- [ ] Xác nhận kết quả
</task_progress>
\`\`\`
</read_file>

Example 2 - Replace In File with Code (BOTH old and new code wrapped, preserving 2-space indent):
<replace_in_file>
<path>src/utils/helper.ts</path>
<diff>
<<<<<<< SEARCH
\`\`\`text
function oldFunction() {
  return "old";  // Exactly 2 spaces - MUST match original file
}
\`\`\`
=======
\`\`\`text
function newFunction() {
  return "new";
}
\`\`\`
>>>>>>> REPLACE
</diff>
</replace_in_file>

Example 3 - Write To File with Code (CORRECT - has <content> tag and preserves 2-space indent):
<write_to_file>
<path>src/new-file.ts</path>
<content>
\`\`\`text
export function myFunction() {
  console.log("Hello World");  // Exactly 2 spaces indent
  return true;                 // Exactly 2 spaces indent
}
\`\`\`
</content>
</write_to_file>

INCORRECT FORMAT EXAMPLES:
❌ Example 1 - Missing <content> tag (CRITICAL ERROR):
<write_to_file>
<path>test.ts</path>
\`\`\`text
function test() {
  return true;
}
\`\`\`
</write_to_file>

❌ Example 2 - code without text wrapper:
<write_to_file>
<path>test.ts</path>
<content>
function test() {
  return true;
}
</content>
</write_to_file>

❌ Example 3 - only new code wrapped in replace_in_file:
<replace_in_file>
<path>test.ts</path>
<diff>
<<<<<<< SEARCH
function oldFunction() {
  return "old";
}
=======
\`\`\`text
function newFunction() {
  return "new";
}
\`\`\`
>>>>>>> REPLACE
</diff>
</replace_in_file>

❌ Example 4 - wrapping everything:
\`\`\`text
<thinking>...</thinking>
<write_to_file>...</write_to_file>
\`\`\`

❌ Example 5 - mixing content in text block:
\`\`\`text
Some explanation
function test() {}
More text
\`\`\`

❌ Example 6 - wrong indentation (file uses 2 spaces, but you wrote 4 spaces):
<write_to_file>
<path>test.ts</path>
<content>
\`\`\`text
function test() {
    return true;  // ❌ WRONG: 4 spaces, but file uses 2 spaces
}
\`\`\`
</content>
</write_to_file>

REMEMBER: 
- <task_progress> content MUST be wrapped in \`\`\`text...\`\`\`
- ALL CODE in <replace_in_file> (both SEARCH and REPLACE sections) MUST be wrapped in \`\`\`text...\`\`\`
- ALL CODE in <write_to_file> MUST be wrapped in \`\`\`text...\`\`\` AND placed inside <content></content> tags
- The <content></content> tags are MANDATORY in <write_to_file> - NEVER skip them
- Each code block gets its own separate \`\`\`text...\`\`\` wrapper!
- Structure: <write_to_file><path>...</path><content>\`\`\`text...code...\`\`\`</content></write_to_file>
- CRITICAL: Preserve EXACT indentation (spaces/tabs) from original code - count spaces carefully!
- When using <replace_in_file>, SEARCH block MUST match original indentation character-by-character
- Example: "  return a + b;" (2 spaces) → you MUST write "  return a + b;" (2 spaces), NOT "    return a + b;" (4 spaces)`;

  /**
   * Combine system prompt, user prompt với language và text wrap rules
   */
  private static buildFinalPrompt(
    systemPrompt: string | null | undefined,
    userPrompt: string
  ): string {
    const finalPrompt = systemPrompt
      ? `${systemPrompt}\n\n${this.LANGUAGE_RULE}\n\n${this.TEXT_WRAP_RULE}\n\nUSER REQUEST:\n${userPrompt}`
      : `${this.LANGUAGE_RULE}\n\n${this.TEXT_WRAP_RULE}\n\nUSER REQUEST:\n${userPrompt}`;
    return finalPrompt;
  }

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

  /**
   * Overload 1: Accept pre-combined prompt (for backward compatibility)
   */
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  /**
   * Overload 2: Accept systemPrompt + userPrompt separately (recommended)
   */
  static async sendPrompt(
    tabId: number,
    systemPrompt: string | null,
    userPrompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  /**
   * Gửi prompt tới DeepSeek tab và đợi response
   * @param tabId - ID của tab DeepSeek
   * @param promptOrSystemPrompt - Final prompt HOẶC system prompt (nếu có userPrompt)
   * @param userPromptOrRequestId - User prompt HOẶC requestId (nếu chỉ có 1 prompt)
   * @param requestIdOrIsNewTask - RequestId HOẶC isNewTask flag
   * @param isNewTask - Flag để tạo chat mới (optional)
   */
  static async sendPrompt(
    tabId: number,
    promptOrSystemPrompt: string,
    userPromptOrRequestId: string,
    requestIdOrIsNewTask?: string | boolean,
    isNewTask?: boolean
  ): Promise<boolean> {
    let finalPrompt: string = "";
    let requestId: string = "unknown";
    let isNewTaskFlag: boolean = false;

    try {
      if (typeof requestIdOrIsNewTask === "string") {
        const systemPrompt = promptOrSystemPrompt;
        const userPrompt = userPromptOrRequestId;
        requestId = requestIdOrIsNewTask;
        isNewTaskFlag = isNewTask === true;

        finalPrompt = this.buildFinalPrompt(systemPrompt, userPrompt);
      } else {
        // Overload 1: (tabId, prompt, requestId, isNewTask?)
        finalPrompt = promptOrSystemPrompt;
        requestId = userPromptOrRequestId;
        isNewTaskFlag = requestIdOrIsNewTask === true;
      }

      const validation = await this.validateTab(tabId);
      if (!validation.isValid) {
        console.error(
          `[PromptController] ❌ Tab validation failed: ${validation.error}`
        );

        const browserAPI = getBrowserAPI();
        try {
          // Gửi validation error qua WSManager
          const validationErrorData = {
            type: "promptResponse",
            requestId: requestId,
            tabId: tabId,
            success: false,
            error: validation.error || "Tab validation failed",
            errorType: "VALIDATION_FAILED",
            timestamp: Date.now(),
          };

          const sendMessagePromise = browserAPI.runtime.sendMessage({
            action: "ws.sendResponse",
            requestId: requestId,
            data: validationErrorData,
          });

          if (
            sendMessagePromise &&
            typeof sendMessagePromise.catch === "function"
          ) {
            sendMessagePromise.catch(() => {
              console.error(
                "[PromptController] ❌ Failed to send validation error"
              );
            });
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

      if (isNewTaskFlag === true) {
        await ChatController.clickNewChatButton(tabId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

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

      await new Promise((resolve) => setTimeout(resolve, 1500));

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
        `[PromptController] 📍 Exception occurred at: tabId=${tabId}, requestId=${
          requestId || "unknown"
        }`
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
      pollCount++;

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
            this.activePollingTasks.delete(tabId);

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

              for (const [, msgArray] of Object.entries(wsMessages)) {
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

            if (folderPathToLink) {
              const freeSuccess =
                await this.tabStateManager.markTabFreeWithFolder(
                  tabId,
                  folderPathToLink
                );

              if (!freeSuccess) {
                console.error(
                  `[PromptController] ❌ Failed to mark tab free with folder, aborting response`
                );
                return;
              }
            } else {
              await this.tabStateManager.markTabFree(tabId);
            }

            // ✅ NEW: Force invalidate cache và notify UI
            await new Promise((resolve) => setTimeout(resolve, 100));

            let responseToSend: string = "";

            // BUILD OPENAI JSON FORMAT từ raw text
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
                    `[PromptController] ⚠️ JSON missing required fields (has: ${Object.keys(
                      parsedObject
                    ).join(", ")}), rebuilding...`
                  );
                  const builtResponse = this.buildOpenAIResponse(rawResponse);
                  responseToSend = JSON.stringify(builtResponse);
                }
              } catch (parseError) {
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

            // 🔥 FIX: Gửi response qua wsOutgoingMessage storage
            const responseData = {
              type: "promptResponse",
              requestId: requestId,
              tabId: tabId,
              success: true,
              response: responseToSend,
              timestamp: Date.now(),
            };

            try {
              // Đọc connectionId từ wsMessages để biết gửi cho connection nào
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
              let targetConnectionId: string | null = null;

              // Tìm connectionId từ original sendPrompt message
              for (const [connId, msgArray] of Object.entries(wsMessages)) {
                const msgs = msgArray as Array<{
                  timestamp: number;
                  data: any;
                }>;
                const matchingMsg = msgs.find(
                  (msg) =>
                    msg.data?.requestId === requestId &&
                    msg.data?.type === "sendPrompt"
                );
                if (matchingMsg) {
                  targetConnectionId = connId;
                  break;
                }
              }

              if (!targetConnectionId) {
                console.error(
                  "[PromptController] ❌ Cannot find connectionId for request:",
                  requestId
                );
                return;
              }

              // Gửi response qua wsOutgoingMessage
              await new Promise<void>((resolve, reject) => {
                browserAPI.storage.local.set(
                  {
                    wsOutgoingMessage: {
                      connectionId: targetConnectionId,
                      data: responseData,
                      timestamp: Date.now(),
                    },
                  },
                  () => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve();
                  }
                );
              });
            } catch (sendError) {
              console.error(
                "[PromptController] ❌ Exception sending response:",
                sendError
              );
            }

            // LOG: Extract và log field "content" từ response JSON
            try {
              const parsedResponse = JSON.parse(responseToSend);
              const contentField =
                parsedResponse?.choices?.[0]?.delta?.content || "";

              // Validation: Check nếu content rỗng hoặc quá ngắn
              if (contentField.length < 50) {
                console.error(
                  `[PromptController] ⚠️ WARNING: Content field is suspiciously short (${contentField.length} chars)`
                );
                console.error(
                  `[PromptController] 🔍 Full responseToSend (first 1000 chars):\n${responseToSend.substring(
                    0,
                    1000
                  )}`
                );
              }
            } catch (logError) {
              console.error(
                `[PromptController] ❌ Failed to parse response for logging:`,
                logError
              );
              console.error(
                `[PromptController] 🔍 responseToSend value (first 1000 chars):\n${responseToSend.substring(
                  0,
                  1000
                )}`
              );
            }

            this.activePollingTasks.delete(tabId);
          } else {
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

            // 🔥 FIX: Gửi error response qua wsOutgoingMessage
            const errorData = {
              type: "promptResponse",
              requestId: requestId,
              tabId: tabId,
              success: false,
              error: "Failed to fetch response from DeepSeek",
              timestamp: Date.now(),
            };

            try {
              // Tìm connectionId từ wsMessages
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
              let targetConnectionId: string | null = null;

              for (const [connId, msgArray] of Object.entries(wsMessages)) {
                const msgs = msgArray as Array<{
                  timestamp: number;
                  data: any;
                }>;
                const matchingMsg = msgs.find(
                  (msg) =>
                    msg.data?.requestId === requestId &&
                    msg.data?.type === "sendPrompt"
                );
                if (matchingMsg) {
                  targetConnectionId = connId;
                  break;
                }
              }

              if (targetConnectionId) {
                await new Promise<void>((resolve, reject) => {
                  browserAPI.storage.local.set(
                    {
                      wsOutgoingMessage: {
                        connectionId: targetConnectionId,
                        data: errorData,
                        timestamp: Date.now(),
                      },
                    },
                    () => {
                      if (browserAPI.runtime.lastError) {
                        reject(browserAPI.runtime.lastError);
                        return;
                      }
                      resolve();
                    }
                  );
                });
              }
            } catch (sendError) {
              console.error(
                "[PromptController] ❌ Exception sending error response:",
                sendError
              );
            }

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

          // 🔥 FIX: Gửi timeout error qua wsOutgoingMessage
          const timeoutData = {
            type: "promptResponse",
            requestId: requestId,
            tabId: tabId,
            success: false,
            error: "Response timeout - AI took too long to respond",
            errorType: "TIMEOUT",
            timestamp: Date.now(),
          };

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
            let targetConnectionId: string | null = null;

            for (const [connId, msgArray] of Object.entries(wsMessages)) {
              const msgs = msgArray as Array<{ timestamp: number; data: any }>;
              const matchingMsg = msgs.find(
                (msg) =>
                  msg.data?.requestId === requestId &&
                  msg.data?.type === "sendPrompt"
              );
              if (matchingMsg) {
                targetConnectionId = connId;
                break;
              }
            }

            if (targetConnectionId) {
              await new Promise<void>((resolve, reject) => {
                browserAPI.storage.local.set(
                  {
                    wsOutgoingMessage: {
                      connectionId: targetConnectionId,
                      data: timeoutData,
                      timestamp: Date.now(),
                    },
                  },
                  () => {
                    if (browserAPI.runtime.lastError) {
                      reject(browserAPI.runtime.lastError);
                      return;
                    }
                    resolve();
                  }
                );
              });
            }
          } catch (sendError) {
            console.error(
              "[PromptController] ❌ Exception sending timeout response:",
              sendError
            );
          }
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

        // 🔥 FIX: Gửi exception error qua wsOutgoingMessage
        const errorMessage =
          error instanceof Error ? error.message : "Unknown polling error";

        const exceptionData = {
          type: "promptResponse",
          requestId: requestId,
          tabId: tabId,
          success: false,
          error: errorMessage,
          timestamp: Date.now(),
        };

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
          let targetConnectionId: string | null = null;

          for (const [connId, msgArray] of Object.entries(wsMessages)) {
            const msgs = msgArray as Array<{ timestamp: number; data: any }>;
            const matchingMsg = msgs.find(
              (msg) =>
                msg.data?.requestId === requestId &&
                msg.data?.type === "sendPrompt"
            );
            if (matchingMsg) {
              targetConnectionId = connId;
              break;
            }
          }

          if (targetConnectionId) {
            await new Promise<void>((resolve, reject) => {
              browserAPI.storage.local.set(
                {
                  wsOutgoingMessage: {
                    connectionId: targetConnectionId,
                    data: exceptionData,
                    timestamp: Date.now(),
                  },
                },
                () => {
                  if (browserAPI.runtime.lastError) {
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve();
                }
              );
            });
          }
        } catch (sendError) {
          console.error(
            "[PromptController] ❌ Exception sending exception response:",
            sendError
          );
        }
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

        // Strategy 1: Tìm TẤT CẢ message containers với nhiều selectors
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
          console.error(
            "[DeepSeek Page] ❌ No message containers found with any selector"
          );
          return null;
        }

        // Lọc ra CHỈ CÁC AI RESPONSES (chứa ds-markdown hoặc có content dài)
        const aiResponses = allMessages.filter((msg) => {
          const hasMarkdown = msg.querySelector(".ds-markdown") !== null;
          const hasContent = msg.classList && !msg.classList.contains("user");
          return hasMarkdown || hasContent;
        });

        if (aiResponses.length === 0) {
          console.error("[DeepSeek Page] ❌ No AI responses found");
          return null;
        }

        // Lấy AI response CUỐI CÙNG (response mới nhất)
        const lastAIResponse = aiResponses[aiResponses.length - 1];
        const lastMarkdown =
          lastAIResponse.querySelector(".ds-markdown") || lastAIResponse;

        if (!lastMarkdown) {
          console.error("[DeepSeek Page] ❌ Last AI response missing markdown");
          return null;
        }

        // Tìm parent container chứa toàn bộ message
        let messageContainer: Element = lastMarkdown;
        let parent = lastMarkdown.parentElement;
        let level = 0;

        while (parent && level < 5) {
          // ✅ Safe string conversion
          const parentClasses = String(parent.className || "");

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
          const parentText = parent.textContent || "";
          const containerText = messageContainer.textContent || "";

          if (
            childMarkdowns.length === 1 &&
            parentText.length > containerText.length
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

              // ✅ Ensure text is always string before using .includes()
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
              // ✅ Safe string conversion
              const className = String(el.className || "");

              // CRITICAL: Xử lý đặc biệt cho ds-markdown-html spans (chứa XML tags)
              if (className.includes("ds-markdown-html")) {
                const htmlContent = String(el.textContent || "");

                // CRITICAL: Nếu là closing tag và không có newline trước nó
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

                // CRITICAL: Kiểm tra xem list này có phải là task_progress không
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
                    // CRITICAL: Kiểm tra checkbox trong li
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
                      // Task progress list WITHOUT checkbox element → force add "- [ ] "
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

                      // FIX: Extract content recursively VÀ GIỮ NGUYÊN paragraph structure
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
      });

      if (!extractedContent) {
        console.error(`[PromptController] ❌ No result from page`);
        return null;
      }

      // ✅ Type validation before destructuring
      if (typeof extractedContent !== "object" || extractedContent === null) {
        console.error(
          `[PromptController] ❌ Invalid extractedContent type:`,
          typeof extractedContent
        );
        return null;
      }

      const { content } = extractedContent as {
        content: string;
        method: string;
      };

      // LOG 1: Raw HTML content nhận từ DeepSeek (full content)
      // console.log(
      //   `[PromptController] 📥 RAW RESPONSE FROM DEEPSEEK:\n${content}`
      // );

      // Step 2: Decode HTML entities
      const decodedResult = this.decodeHtmlEntities(content);

      // Step 2.5: Validate and fix XML structure
      const xmlFixedResult = this.fixXmlStructure(decodedResult);

      // Step 2.6: Unwrap task_progress blocks from ```text wrappers
      const unwrappedResult = this.unwrapTaskProgress(xmlFixedResult);

      // Step 2.7: Remove UI artifacts (Copy, Download buttons text)
      let artifactCleanedResult = unwrappedResult
        .replace(/\n*Copy\s*\n*/gi, "\n")
        .replace(/\n*Download\s*\n*/gi, "\n")
        .replace(/\btext\s*\n+/gi, "\n");

      // Step 2.8: Remove any remaining code block markers around XML tags
      artifactCleanedResult = artifactCleanedResult
        .replace(/```\s*\n+(<[a-z_]+>)/gi, "$1")
        .replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

      // Clean up excessive newlines (giữ lại tối đa 2 newlines liên tiếp)
      let cleanedResult = artifactCleanedResult
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // Additional cleanup: Fix spacing trong numbered lists
      cleanedResult = cleanedResult.replace(/(\d+\.)\s+\n/g, "$1 ");

      // CRITICAL: Ensure proper newlines around ALL XML closing tags
      // Pattern: "text</tag>" → "text\n</tag>" (nếu chưa có newline)
      cleanedResult = cleanedResult.replace(/([^\n])(<\/[a-z_]+>)/g, "$1\n$2");

      // CRITICAL: Ensure proper newlines between consecutive closing tags
      // Pattern: "</tag1></tag2>" → "</tag1>\n</tag2>"
      cleanedResult = cleanedResult.replace(
        /(<\/[a-z_]+>)(<\/[a-z_]+>)/g,
        "$1\n$2"
      );

      // Step 2.9: Clean SEARCH/REPLACE code fences in <diff> blocks
      cleanedResult = this.cleanSearchReplaceCodeFences(cleanedResult);

      // Step 2.10: Clean code fences in <content> blocks of <write_to_file>
      cleanedResult = this.cleanContentCodeFences(cleanedResult);

      // LOG 2: Response sau xử lý (full cleaned content)
      // console.log(
      //   `[PromptController] ✅ PROCESSED RESPONSE (CLEAN):\n${cleanedResult}`
      // );

      // Step 3: Try to parse as JSON ONLY if ENTIRE response is JSON (không chứa XML tags)
      try {
        // CRITICAL: Kiểm tra xem có XML tags không (nếu có thì KHÔNG parse JSON)
        const hasXmlTags =
          /<[a-z_]+>/.test(cleanedResult) || /<\/[a-z_]+>/.test(cleanedResult);

        if (hasXmlTags) {
          return cleanedResult;
        }

        // Kiểm tra xem response CÓ BẮT ĐẦU VÀ KẾT THÚC bằng {} không
        const trimmed = cleanedResult.trim();
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
          return cleanedResult;
        }

        // Try parse toàn bộ response
        const jsonResponse = JSON.parse(trimmed);

        // Validate structure
        if (
          jsonResponse &&
          typeof jsonResponse === "object" &&
          jsonResponse.choices
        ) {
          return JSON.stringify(jsonResponse);
        } else {
          return cleanedResult;
        }
      } catch (parseError) {}

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
   * Validate và fix XML structure trong response
   * Fix lỗi: <task_progress> nằm bên trong <read_file> hoặc các tool tags khác
   */
  private static fixXmlStructure(content: string): string {
    let fixed = content;
    fixed = fixed.replace(/(<\/[a-z_]+>)(<[a-z_]+>)/g, "$1\n$2");
    return fixed;
  }

  /**
   * Unwrap <task_progress> blocks nếu chúng bị wrap trong ```text code blocks
   * Pattern: ```text...any text...<task_progress>...</task_progress>...``` → <task_progress>...</task_progress>
   * Xử lý cả trường hợp có "Copy", "Download" hoặc text khác giữa ```text và <task_progress>
   */
  private static unwrapTaskProgress(content: string): string {
    // Pattern 1: Unwrap task_progress từ ```text blocks
    // Loại bỏ hoàn toàn wrapper ```text...``` và các UI artifacts (Copy, Download)
    const textBlockPattern =
      /```text[\s\S]*?(<task_progress>[\s\S]*?<\/task_progress>)[\s\S]*?```/g;

    let unwrapped = content.replace(textBlockPattern, "$1");

    // Pattern 2: Loại bỏ các UI button text (Copy, Download) xuất hiện trước/sau XML tags
    // Xử lý trường hợp: "Copy\nDownload\n\n<tag>..."
    unwrapped = unwrapped.replace(
      /(Copy\s*(?:Download)?\s*\n+)(<[a-z_]+>)/gi,
      "$2"
    );

    // Pattern 3: Loại bỏ "text" keyword đơn lẻ trước XML tags
    unwrapped = unwrapped.replace(/\btext\s*\n+(<[a-z_]+>)/gi, "$1");

    // Pattern 4: Loại bỏ các code block markers còn sót lại xung quanh XML tags
    // Xử lý: ```\n<task_progress>...</task_progress>\n```
    unwrapped = unwrapped.replace(
      /```\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g,
      "$1"
    );

    // Pattern 5: Loại bỏ ``` đơn lẻ trước XML tags
    unwrapped = unwrapped.replace(/```\s*\n+(<[a-z_]+>)/gi, "$1");

    // Pattern 6: Loại bỏ ``` đơn lẻ sau XML closing tags
    unwrapped = unwrapped.replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

    return unwrapped;
  }

  /**
   * Loại bỏ code fence (```) bên ngoài cùng trong SEARCH/REPLACE blocks
   * Giữ nguyên các ``` bên trong nếu code có sử dụng
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

      // Tìm vị trí các marker
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

      // Step 1: Xóa dòng trống NGAY SAU "<<<<<<< SEARCH"
      if (searchIdx + 1 < lines.length && lines[searchIdx + 1].trim() === "") {
        linesToRemove.add(searchIdx + 1);
      }

      // Step 2: Sau "<<<<<<< SEARCH": Tìm CODE_FENCE (bỏ qua UI artifacts và dòng trống)
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

      // Step 3: Xóa dòng trống NGAY TRƯỚC "======="
      if (separatorIdx - 1 >= 0 && lines[separatorIdx - 1].trim() === "") {
        linesToRemove.add(separatorIdx - 1);
      }

      // Step 4: Trước "=======": Tìm ngược lên CODE_FENCE (bỏ qua dòng trống đã mark)
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

      // Step 5: Xóa dòng trống NGAY SAU "======="
      if (
        separatorIdx + 1 < lines.length &&
        lines[separatorIdx + 1].trim() === ""
      ) {
        linesToRemove.add(separatorIdx + 1);
      }

      // Step 6: Sau "=======": Tìm CODE_FENCE (bỏ qua UI artifacts và dòng trống)
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

      // Step 7: Xóa dòng trống NGAY TRƯỚC "> REPLACE"
      if (replaceIdx - 1 >= 0 && lines[replaceIdx - 1].trim() === "") {
        linesToRemove.add(replaceIdx - 1);
      }

      // Step 8: Trước "> REPLACE": Tìm ngược lên CODE_FENCE (bỏ qua dòng trống đã mark)
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

      // Step 9: Xóa CODE_FENCE nếu dòng TRÊN là marker
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (trimmed === CODE_FENCE && i > 0) {
          let prevIdx = i - 1;
          while (prevIdx >= 0 && lines[prevIdx].trim() === "") {
            prevIdx--;
          }

          if (prevIdx >= 0) {
            const prevLine = lines[prevIdx].trim();
            if (prevLine === separatorMarker || prevLine === searchMarker) {
              linesToRemove.add(i);
            }
          }
        }
      }

      // Lọc bỏ các dòng cần xóa
      const cleanedLines = lines.filter(
        (_: string, idx: number) => !linesToRemove.has(idx)
      );

      return `<diff>${cleanedLines.join("\n")}</diff>`;
    });
  }

  /**
   * Loại bỏ code fence (```) bên ngoài cùng trong <content> blocks của <write_to_file>
   * Giữ nguyên các ``` bên trong nếu content có sử dụng
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

      // Step 1: Xóa dòng trống đầu tiên (ngay sau <content>)
      if (lines[0].trim() === "") {
        linesToRemove.add(0);
      }

      // Step 2: Tìm và xóa CODE_FENCE đầu tiên (bỏ qua UI artifacts và dòng trống)
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

      // Step 3: Xóa dòng trống cuối cùng (ngay trước </content>)
      const lastIdx = lines.length - 1;
      if (lastIdx >= 0 && lines[lastIdx].trim() === "") {
        linesToRemove.add(lastIdx);
      }

      // Step 4: Tìm và xóa CODE_FENCE cuối cùng (bỏ qua dòng trống đã đánh dấu)
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

      // Lọc bỏ các dòng cần xóa
      const cleanedLines = lines.filter(
        (_: string, idx: number) => !linesToRemove.has(idx)
      );

      return `<content>${cleanedLines.join("\n")}</content>`;
    });
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

    const responseObject = {
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

    return responseObject;
  }
}
