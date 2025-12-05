// src/background/ai-services/deepseek/chat-controller.ts

import { browserAPI } from "../../utils/browser/browser-api";

/**
 * Chat Controller - Xử lý các thao tác chat với DeepSeek
 */
export class ChatController {
  /**
   * Lấy trạng thái DeepThink button
   */
  static async isDeepThinkEnabled(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const button = document.querySelector("button.ds-toggle-button");
        if (!button) return null;

        return button.classList.contains("ds-toggle-button--selected");
      });

      return result ?? false;
    } catch (error) {
      console.error("[ChatController] ❌ Error checking DeepThink:", error);
      return false;
    }
  }

  /**
   * Bật/tắt DeepThink
   */
  static async toggleDeepThink(
    tabId: number,
    enable: boolean
  ): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(
        tabId,
        (targetState: boolean) => {
          const button = document.querySelector(
            "button.ds-toggle-button"
          ) as HTMLButtonElement;
          if (!button) return false;

          const isCurrentlyEnabled = button.classList.contains(
            "ds-toggle-button--selected"
          );

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
      console.error("[ChatController] ❌ Error toggling DeepThink:", error);
      return false;
    }
  }

  /**
   * Click vào button "New Chat"
   */
  static async clickNewChatButton(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const button1 = document.querySelector(
          '.ds-icon-button._4f3769f[role="button"]'
        ) as HTMLElement;

        if (button1 && !button1.getAttribute("aria-disabled")) {
          button1.click();
          return true;
        }

        const allButtons = Array.from(
          document.querySelectorAll("._5a8ac7a")
        ) as HTMLElement[];

        for (const btn of allButtons) {
          const svg = btn.querySelector("svg");
          const pathD = svg?.querySelector("path")?.getAttribute("d");

          if (
            pathD &&
            pathD.includes("M8 0.599609C3.91309 0.599609") &&
            pathD.includes("M7.34473 4.93945V7.34961")
          ) {
            btn.click();
            return true;
          }
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
      console.error(
        "[ChatController] ❌ Error clicking new chat button:",
        error
      );
      return false;
    }
  }

  /**
   * Tạo chat mới
   */
  static async createNewChat(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
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
      console.error("[ChatController] ❌ Error creating new chat:", error);
      return false;
    }
  }

  /**
   * Lấy title của chat hiện tại
   */
  static async getChatTitle(tabId: number): Promise<string | null> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const titleElement = document.querySelector(
          ".afa34042.e37a04e4.e0a1edb7"
        );
        return titleElement?.textContent?.trim() || null;
      });

      return result ?? null;
    } catch (error) {
      console.error("[ChatController] ❌ Error getting chat title:", error);
      return null;
    }
  }
}
