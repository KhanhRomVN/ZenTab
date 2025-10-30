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
    prompt: string
  ): Promise<boolean> {
    try {
      console.debug("[DeepSeekController] Sending prompt to tab:", tabId);
      console.debug("[DeepSeekController] Prompt content:", prompt);

      const result = await executeScript(
        tabId,
        (text: string) => {
          console.log("=== DeepSeek DOM Debug ===");

          // 🆕 FIXED: Dùng placeholder selector (stable selector)
          const textarea = document.querySelector(
            'textarea[placeholder="Message DeepSeek"]'
          ) as HTMLTextAreaElement;

          console.log("1. Textarea found:", !!textarea);

          if (!textarea) {
            console.error("   ✗ Textarea not found!");

            // Fallback: tìm bất kỳ textarea nào
            const anyTextarea = document.querySelector("textarea");
            console.log("   Fallback textarea found:", !!anyTextarea);

            if (!anyTextarea) {
              console.error("   ✗ No textarea on page at all!");
              return false;
            }

            // Dùng fallback textarea
            const fallbackTextarea = anyTextarea as HTMLTextAreaElement;
            fallbackTextarea.value = text;
            fallbackTextarea.dispatchEvent(
              new Event("input", { bubbles: true })
            );
            fallbackTextarea.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            fallbackTextarea.focus();
            console.log("   ✓ Used fallback textarea");

            // Tìm send button
            setTimeout(() => {
              const buttons = Array.from(document.querySelectorAll("button"));
              const sendButton = buttons.find((btn) => {
                const hasIcon = btn.querySelector("svg");
                const isNotDisabled = !btn.disabled;
                const isVisible = btn.offsetParent !== null;
                return hasIcon && isNotDisabled && isVisible;
              });

              if (sendButton) {
                console.log("   ✓ Send button found (fallback), clicking...");
                sendButton.click();
              } else {
                console.error("   ✗ Send button not found (fallback)");
              }
            }, 300);

            return true;
          }

          // Main path: textarea found
          textarea.value = text;
          console.log("2. Textarea value set:", textarea.value);

          // Trigger events
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.dispatchEvent(new Event("change", { bubbles: true }));
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
          );
          textarea.focus();
          console.log("3. Input events dispatched");

          // Tìm send button sau khi UI update
          setTimeout(() => {
            console.log("4. Looking for send button...");

            // Tìm tất cả buttons có icon
            const buttons = Array.from(document.querySelectorAll("button"));
            console.log("   Total buttons:", buttons.length);

            // Filter: buttons có SVG icon, không disabled, và visible
            const iconButtons = buttons.filter((btn) => {
              const hasIcon = btn.querySelector("svg");
              const isNotDisabled = !btn.disabled;
              const isVisible = btn.offsetParent !== null;
              return hasIcon && isNotDisabled && isVisible;
            });

            console.log("   Icon buttons (not disabled):", iconButtons.length);

            if (iconButtons.length === 0) {
              console.error("   ✗ No icon buttons found!");
              return;
            }

            // Thử tìm button có arrow icon (send icon)
            let sendButton = iconButtons.find((btn) => {
              const svg = btn.querySelector("svg");
              if (!svg) return false;

              // Check for common send icon patterns
              const paths = svg.querySelectorAll("path");
              for (const path of paths) {
                const d = path.getAttribute("d") || "";
                // Arrow icon thường có path data chứa các giá trị này
                if (d.includes("M2") || d.includes("L23") || d.includes("12")) {
                  return true;
                }
              }

              return false;
            });

            // Nếu không tìm thấy send button bằng icon, lấy button cuối cùng
            if (!sendButton && iconButtons.length > 0) {
              sendButton = iconButtons[iconButtons.length - 1];
              console.log("   Using last icon button as fallback");
            }

            if (sendButton) {
              console.log("   ✓ Send button found, clicking...");
              console.log("   Button class:", sendButton.className);
              sendButton.click();
              console.log("   ✓ Send button clicked!");
            } else {
              console.error("   ✗ Send button not found!");

              // Debug: list all buttons
              console.log("   Available buttons:");
              buttons.forEach((btn, index) => {
                console.log(
                  `     [${index}] disabled:${btn.disabled}, ` +
                    `hasIcon:${!!btn.querySelector("svg")}, ` +
                    `visible:${btn.offsetParent !== null}, ` +
                    `class:${btn.className}`
                );
              });
            }
          }, 300);

          return true;
        },
        [prompt]
      );

      console.debug("[DeepSeekController] Script execution result:", result);
      return result ?? false;
    } catch (error) {
      console.error("[DeepSeekController] Failed to send prompt:", error);
      return false;
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
   */
  public static async isGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        // Kiểm tra có stop button không (button với icon hình vuông)
        const stopButton = document.querySelector(
          '.ds-icon-button._7436101 svg path[d*="M2 4.88006"]'
        );
        if (!stopButton) return false;

        const button = stopButton.closest("button");
        return button
          ? !button.classList.contains("ds-icon-button--disabled")
          : false;
      });

      return result ?? false;
    } catch (error) {
      console.error(
        "[DeepSeekController] Failed to check generation status:",
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
