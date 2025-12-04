// src/background/chatgpt/chatgpt-controller.ts
import { executeScript } from "../utils/browser-helper";

export class ChatGPTController {
  /**
   * Click vào button "New Chat"
   */
  static async clickNewChatButton(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        // Thử selector 1: button với data-testid
        const button1 = document.querySelector(
          'a[data-testid="create-new-chat-button"]'
        ) as HTMLElement;

        if (button1) {
          button1.click();
          return true;
        }

        // Thử selector 2: button với class __menu-item
        const button2 = document.querySelector(
          'a.__menu-item[href="/"]'
        ) as HTMLElement;

        if (button2) {
          button2.click();
          return true;
        }

        return false;
      });

      if (result) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem AI có đang generate response không
   */
  static async isGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        // Check button "Stop streaming"
        const stopButton = document.querySelector(
          'button[data-testid="stop-button"]'
        );

        if (stopButton) {
          return true;
        }

        // Check button "Send prompt" (khi không generate)
        const sendButton = document.querySelector(
          'button[data-testid="send-button"]'
        );

        // Nếu có send button → không đang generate
        if (sendButton) {
          return false;
        }

        // Fallback: check aria-label
        const composerButton = document.querySelector(
          'button[id="composer-submit-button"]'
        );

        if (composerButton) {
          const ariaLabel = composerButton.getAttribute("aria-label");
          return (
            ariaLabel === "Dừng phát trực tuyến" ||
            ariaLabel === "Stop streaming"
          );
        }

        return false;
      });

      return result ?? false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Dừng generation
   */
  static async stopGeneration(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        const stopButton = document.querySelector(
          'button[data-testid="stop-button"]'
        ) as HTMLButtonElement;

        if (stopButton && !stopButton.disabled) {
          stopButton.click();
          return true;
        }

        return false;
      });

      return result ?? false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lấy input hiện tại trong textarea
   */
  static async getCurrentInput(tabId: number): Promise<string> {
    try {
      const result = await executeScript(tabId, () => {
        // Thử ProseMirror editor
        const proseMirror = document.querySelector(
          ".wcDTda_prosemirror-parent .ProseMirror"
        ) as HTMLElement;

        if (proseMirror) {
          return proseMirror.textContent?.trim() || "";
        }

        // Fallback: textarea ẩn
        const textarea = document.querySelector(
          'textarea[name="prompt-textarea"]'
        ) as HTMLTextAreaElement;

        return textarea?.value || "";
      });

      return result ?? "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Lấy response mới nhất
   */
  static async getLatestResponse(tabId: number): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        // Tìm message container cuối cùng của assistant
        const messages = Array.from(
          document.querySelectorAll('[data-message-author-role="assistant"]')
        );

        if (messages.length === 0) return null;

        const lastMessage = messages[messages.length - 1];

        // Lấy nội dung markdown
        const markdown = lastMessage.querySelector(".markdown");

        return markdown?.textContent?.trim() || null;
      });

      return result ?? null;
    } catch (error) {
      return null;
    }
  }
}
