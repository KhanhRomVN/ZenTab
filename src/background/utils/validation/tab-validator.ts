// src/background/utils/validation/tab-validator.ts

import { browserAPI } from "../browser/browser-api";

/**
 * Tab Validator - Validate tabs và URLs
 */
export class TabValidator {
  /**
   * Validate tab ID
   */
  static async validateTabId(tabId: number): Promise<boolean> {
    try {
      const tab = await browserAPI.getTab(tabId);
      return !!tab;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate DeepSeek tab
   */
  static async validateDeepSeekTab(
    tabId: number
  ): Promise<{ isValid: boolean; url?: string }> {
    try {
      const tab = await browserAPI.getTab(tabId);

      if (!tab || !tab.url) {
        return { isValid: false };
      }

      const isValid = tab.url.startsWith("https://chat.deepseek.com");
      return { isValid, url: tab.url };
    } catch (error) {
      return { isValid: false };
    }
  }

  /**
   * Validate ChatGPT tab
   */
  static async validateChatGPTTab(
    tabId: number
  ): Promise<{ isValid: boolean; url?: string }> {
    try {
      const tab = await browserAPI.getTab(tabId);

      if (!tab || !tab.url) {
        return { isValid: false };
      }

      const isValid =
        tab.url.includes("chatgpt.com") || tab.url.includes("openai.com");
      return { isValid, url: tab.url };
    } catch (error) {
      return { isValid: false };
    }
  }

  /**
   * Validate AI chat tab (DeepSeek hoặc ChatGPT)
   */
  static async validateAIChatTab(tabId: number): Promise<{
    isValid: boolean;
    type: "deepseek" | "chatgpt" | "unknown";
    url?: string;
  }> {
    const deepseekValidation = await this.validateDeepSeekTab(tabId);
    if (deepseekValidation.isValid) {
      return { ...deepseekValidation, type: "deepseek" };
    }

    const chatgptValidation = await this.validateChatGPTTab(tabId);
    if (chatgptValidation.isValid) {
      return { ...chatgptValidation, type: "chatgpt" };
    }

    return { isValid: false, type: "unknown" };
  }

  /**
   * Validate URL pattern
   */
  static validateURL(url: string, patterns: string[]): boolean {
    try {
      const urlObj = new URL(url);

      return patterns.some((pattern) => {
        if (pattern.includes("*")) {
          // Handle wildcard patterns
          const regexPattern = pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*");
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(urlObj.hostname + urlObj.pathname);
        }

        return url.startsWith(pattern);
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract domain từ URL
   */
  static extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check nếu tab có thể execute script
   */
  static async canExecuteScript(tabId: number): Promise<boolean> {
    try {
      // Thử execute một script đơn giản
      await browserAPI.executeScript(tabId, () => true);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check nếu tab đã loaded
   */
  static async isTabLoaded(tabId: number): Promise<boolean> {
    try {
      const tab = await browserAPI.getTab(tabId);
      return tab.status === "complete";
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for tab to load
   */
  static async waitForTabLoad(
    tabId: number,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isTabLoaded(tabId)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return false;
  }

  /**
   * Get tab status summary
   */
  static async getTabStatus(tabId: number): Promise<{
    exists: boolean;
    loaded: boolean;
    canExecute: boolean;
    url?: string;
    title?: string;
  }> {
    try {
      const tab = await browserAPI.getTab(tabId);
      const canExecute = await this.canExecuteScript(tabId);
      const loaded = tab.status === "complete";

      return {
        exists: true,
        loaded,
        canExecute,
        url: tab.url,
        title: tab.title,
      };
    } catch (error) {
      return {
        exists: false,
        loaded: false,
        canExecute: false,
      };
    }
  }
}
