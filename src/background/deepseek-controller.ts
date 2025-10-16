export class DeepSeekController {
  /**
   * Lấy trạng thái DeepThink button
   */
  public static async isDeepThinkEnabled(tabId: number): Promise<boolean> {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const button = document.querySelector("button.ds-toggle-button");
          if (!button) return null;

          return button.classList.contains("ds-toggle-button--selected");
        },
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (targetState: boolean) => {
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
        args: [enable],
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: (text: string) => {
          // Tìm textarea input
          const scrollArea = document.querySelector(".ds-scroll-area__gutters");
          if (!scrollArea) return false;

          const textarea = scrollArea.parentElement?.querySelector("textarea");
          if (!textarea) return false;

          // Set value
          textarea.value = text;

          // Trigger input event để DeepSeek nhận biết thay đổi
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.dispatchEvent(new Event("change", { bubbles: true }));

          // Đợi một chút để UI update
          setTimeout(() => {
            // Tìm button send
            const sendButton = document.querySelector(
              ".ds-icon-button._7436101:not(.ds-icon-button--disabled)"
            ) as HTMLElement;
            if (sendButton) {
              sendButton.click();
            }
          }, 100);

          return true;
        },
        args: [prompt],
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
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
        },
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
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
        },
      });

      return result[0]?.result ?? null;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const newChatButton = document.querySelector(
            "button.ds-floating-button--secondary"
          ) as HTMLButtonElement;
          if (newChatButton && !newChatButton.disabled) {
            newChatButton.click();
            return true;
          }
          return false;
        },
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const titleElement = document.querySelector(
            ".afa34042.e37a04e4.e0a1edb7"
          );
          return titleElement?.textContent?.trim() || null;
        },
      });

      return result[0]?.result ?? null;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Kiểm tra có stop button không (button với icon hình vuông)
          const stopButton = document.querySelector(
            '.ds-icon-button._7436101 svg path[d*="M2 4.88006"]'
          );
          if (!stopButton) return false;

          const button = stopButton.closest("button");
          return button
            ? !button.classList.contains("ds-icon-button--disabled")
            : false;
        },
      });

      return result[0]?.result ?? false;
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
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const scrollArea = document.querySelector(".ds-scroll-area__gutters");
          if (!scrollArea) return "";

          const textarea = scrollArea.parentElement?.querySelector("textarea");
          return textarea?.value || "";
        },
      });

      return result[0]?.result ?? "";
    } catch (error) {
      console.error("[DeepSeekController] Failed to get current input:", error);
      return "";
    }
  }
}
