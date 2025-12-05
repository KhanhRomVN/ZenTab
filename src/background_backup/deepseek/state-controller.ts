// src/background/deepseek/state-controller.ts
import { executeScript } from "../utils/browser-helper";

export class StateController {
  /**
   * Kiểm tra xem AI có đang trả lời không
   */
  static async isGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
        const sendButton = document.querySelector(".ds-icon-button._7436101");
        if (!sendButton) {
          return false;
        }

        const svg = sendButton.querySelector("svg");
        if (!svg) {
          return false;
        }

        const path = svg.querySelector("path");
        if (!path) {
          return false;
        }

        const pathData = path.getAttribute("d") || "";

        const isStopIcon =
          pathData.includes("M2 4.88006") &&
          pathData.includes("C2 3.68015") &&
          pathData.includes("2.30557 2.6596");

        const isSendIcon =
          pathData.includes("M8.3125 0.981648") &&
          pathData.includes("9.2627 1.4338") &&
          pathData.includes("9.97949 2.1086");

        if (isStopIcon) {
          return true;
        }

        if (isSendIcon) {
          return false;
        }

        if (pathData.startsWith("M2") && pathData.length > 100) {
          return true;
        } else if (pathData.startsWith("M8") && pathData.length > 50) {
          return false;
        }

        return false;
      });

      const isGenerating = result ?? false;
      return isGenerating;
    } catch (error) {
      return false;
    }
  }

  /**
   * Dừng AI đang trả lời
   */
  static async stopGeneration(tabId: number): Promise<boolean> {
    try {
      const result = await executeScript(tabId, () => {
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
      return false;
    }
  }

  /**
   * Lấy input hiện tại
   */
  static async getCurrentInput(tabId: number): Promise<string> {
    try {
      const result = await executeScript(tabId, () => {
        const textarea = document.querySelector(
          'textarea[placeholder="Message DeepSeek"]'
        ) as HTMLTextAreaElement;
        return textarea?.value || "";
      });

      return result ?? "";
    } catch (error) {
      return "";
    }
  }

  /**
   * Lấy nội dung response mới nhất của AI
   */
  static async getLatestResponse(tabId: number): Promise<string | null> {
    try {
      const result = await executeScript(tabId, () => {
        const copyButtons = Array.from(
          document.querySelectorAll(".ds-icon-button.db183363")
        );
        if (copyButtons.length === 0) return null;

        const lastCopyButton = copyButtons[copyButtons.length - 1];

        const messageContainer = lastCopyButton.closest('[class*="message"]');
        if (!messageContainer) return null;

        return messageContainer.textContent?.trim() || null;
      });

      return result ?? null;
    } catch (error) {
      return null;
    }
  }
}
