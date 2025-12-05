// src/background/ai-services/deepseek/dom/element-detector.ts

import { DEEPSEEK_SELECTORS } from "../../../constants/selectors/deepseek-selectors";
import { browserAPI } from "../../../utils/browser/browser-api";

/**
 * Element Detector - Phát hiện và tương tác với các elements trên DeepSeek
 */
export class ElementDetector {
  // Configuration
  private static readonly CONFIG = {
    maxRetries: 3,
    retryDelay: 500,
    elementTimeout: 3000,
  };

  /**
   * Kiểm tra xem page đã loaded chưa
   */
  public static async isPageLoaded(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        return {
          readyState: document.readyState,
          hasBody: !!document.body,
          title: document.title,
        };
      });

      return (
        result?.readyState === "complete" &&
        result.hasBody &&
        result.title?.toLowerCase().includes("deepseek")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem textarea có tồn tại không
   */
  public static async isTextareaPresent(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(
        tabId,
        (selectors: any) => {
          const textarea = document.querySelector(selectors.textarea);
          return {
            present: !!textarea,
            isTextarea: textarea?.tagName === "TEXTAREA",
            isVisible:
              textarea && getComputedStyle(textarea).display !== "none",
            placeholder: (textarea as HTMLTextAreaElement)?.placeholder || "",
          };
        },
        [DEEPSEEK_SELECTORS]
      );

      return (
        result?.present &&
        result.isTextarea &&
        result.isVisible &&
        result.placeholder.includes("DeepSeek")
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem send button có tồn tại và enabled không
   */
  public static async isSendButtonPresent(tabId: number): Promise<{
    present: boolean;
    enabled: boolean;
    disabledReason?: string;
  }> {
    try {
      const result = await browserAPI.executeScript(
        tabId,
        (selectors: any) => {
          const sendButton = document.querySelector(
            selectors.sendButton
          ) as HTMLButtonElement;

          if (!sendButton) {
            return {
              present: false,
              enabled: false,
              disabledReason: "button_not_found",
            };
          }

          const isDisabled = sendButton.classList.contains(
            "ds-icon-button--disabled"
          );
          const isVisible = getComputedStyle(sendButton).display !== "none";
          const ariaDisabled =
            sendButton.getAttribute("aria-disabled") === "true";

          return {
            present: true,
            enabled: !isDisabled && !ariaDisabled && isVisible,
            disabledReason: isDisabled
              ? "button_disabled_class"
              : ariaDisabled
              ? "aria_disabled"
              : undefined,
            isVisible,
          };
        },
        [DEEPSEEK_SELECTORS]
      );

      return {
        present: result?.present || false,
        enabled: result?.enabled || false,
        disabledReason: result?.disabledReason,
      };
    } catch (error) {
      return {
        present: false,
        enabled: false,
        disabledReason: "error_checking_button",
      };
    }
  }

  /**
   * Kiểm tra xem có new chat button không
   */
  public static async isNewChatButtonPresent(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(
        tabId,
        (selectors: any) => {
          const newChatButton = document.querySelector(selectors.newChatButton);
          return {
            present: !!newChatButton,
            isButton: newChatButton?.tagName === "BUTTON",
            isVisible:
              newChatButton &&
              getComputedStyle(newChatButton).display !== "none",
          };
        },
        [DEEPSEEK_SELECTORS]
      );

      return result?.present && result.isButton && result.isVisible;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem AI có đang generate response không
   */
  public static async isAIGenerating(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Tìm send button và kiểm tra icon stop
        const sendButton = document.querySelector(".ds-icon-button._7436101");
        if (!sendButton) {
          return { isGenerating: false };
        }

        const svg = sendButton.querySelector("svg");
        const path = svg?.querySelector("path");
        const pathData = path?.getAttribute("d") || "";

        // Stop icon có path data đặc biệt
        const isStopIcon =
          pathData.includes("M2 4.88006") && pathData.includes("C2 3.68015");

        return { isGenerating: !!isStopIcon };
      });

      return result?.isGenerating || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem response đã hoàn thành chưa
   */
  public static async isResponseComplete(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Tìm last message container
        const messageContainers =
          document.querySelectorAll('[class*="message"]');
        if (messageContainers.length === 0) {
          return { complete: false };
        }

        const lastContainer = messageContainers[messageContainers.length - 1];

        // Kiểm tra xem container có chứa loading indicator không
        const hasLoading = lastContainer.querySelector(
          ".loading, .spinner, .animate-spin"
        );

        // Kiểm tra xem có continue button không
        const continueButton = document.querySelector(
          'button.ds-basic-button.ds-basic-button--outlined[role="button"]'
        ) as HTMLButtonElement;
        const hasContinueButton =
          continueButton?.textContent?.trim() === "Continue";

        return {
          complete: !hasLoading && !hasContinueButton,
          hasContinueButton,
          hasLoading: !!hasLoading,
        };
      });

      return result?.complete || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem có error message không
   */
  public static async hasErrorMessage(tabId: number): Promise<{
    hasError: boolean;
    errorText?: string;
    errorType?: string;
  }> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Tìm error containers
        const errorContainers = document.querySelectorAll(
          '[class*="error"], [class*="Error"], .error-message, .alert-error'
        );

        if (errorContainers.length === 0) {
          return { hasError: false };
        }

        const firstError = errorContainers[0];
        const errorText = firstError.textContent?.trim() || "";

        // Xác định error type
        let errorType = "unknown";
        if (
          errorText.includes("rate limit") ||
          errorText.includes("too many requests")
        ) {
          errorType = "rate_limit";
        } else if (
          errorText.includes("network") ||
          errorText.includes("connection")
        ) {
          errorType = "network_error";
        } else if (
          errorText.includes("sensitive") ||
          errorText.includes("policy")
        ) {
          errorType = "content_policy";
        }

        return {
          hasError: true,
          errorText,
          errorType,
        };
      });

      return {
        hasError: result?.hasError || false,
        errorText: result?.errorText,
        errorType: result?.errorType,
      };
    } catch (error) {
      return {
        hasError: false,
      };
    }
  }

  /**
   * Đợi element xuất hiện với timeout
   */
  public static async waitForElement(
    tabId: number,
    selector: string,
    timeout: number = this.CONFIG.elementTimeout
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await browserAPI.executeScript(
          tabId,
          (sel: string) => {
            const element = document.querySelector(sel);
            return {
              present: !!element,
              isVisible:
                element && getComputedStyle(element).display !== "none",
            };
          },
          [selector]
        );

        if (result?.present && result.isVisible) {
          return true;
        }
      } catch (error) {
        // Ignore errors and continue polling
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.CONFIG.retryDelay)
      );
    }

    return false;
  }

  /**
   * Lấy text từ textarea
   */
  public static async getTextareaContent(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await browserAPI.executeScript(
        tabId,
        (selectors: any) => {
          const textarea = document.querySelector(
            selectors.textarea
          ) as HTMLTextAreaElement;
          return textarea?.value || null;
        },
        [DEEPSEEK_SELECTORS]
      );

      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Lấy response content từ page
   */
  public static async getResponseContent(
    tabId: number
  ): Promise<string | null> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Cuộn xuống cuối trang
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });

        // Tìm tất cả message containers
        const messageContainers =
          document.querySelectorAll('[class*="message"]');
        if (messageContainers.length === 0) {
          return null;
        }

        // Lấy container cuối cùng
        const lastContainer = messageContainers[messageContainers.length - 1];

        // Ưu tiên markdown content
        const markdown = lastContainer.querySelector(".ds-markdown");
        if (markdown) {
          return markdown.textContent?.trim() || null;
        }

        // Fallback: lấy text từ container
        return lastContainer.textContent?.trim() || null;
      });

      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Kiểm tra xem có login prompt không
   */
  public static async hasLoginPrompt(tabId: number): Promise<boolean> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        // Tìm login-related elements
        const loginElements = document.querySelectorAll(
          'button:contains("Log in"), button:contains("Sign in"), [href*="login"], [href*="signin"]'
        );

        const hasLoginButton = Array.from(loginElements).some((el) => {
          const text = el.textContent?.toLowerCase() || "";
          return text.includes("log in") || text.includes("sign in");
        });

        // Kiểm tra URL có phải login page không
        const isLoginPage =
          window.location.href.includes("/login") ||
          window.location.href.includes("/signin") ||
          window.location.href.includes("auth");

        return {
          hasLoginPrompt: hasLoginButton || isLoginPage,
          isLoginPage,
        };
      });

      return result?.hasLoginPrompt || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kiểm tra xem page có bị blocked không
   */
  public static async isPageBlocked(tabId: number): Promise<{
    isBlocked: boolean;
    blockType?: "cloudflare" | "captcha" | "rate_limit" | "maintenance";
  }> {
    try {
      const result = await browserAPI.executeScript(tabId, () => {
        const pageText = document.body.textContent?.toLowerCase() || "";

        // Check for Cloudflare
        const hasCloudflare =
          pageText.includes("cloudflare") ||
          document.querySelector("#cf-wrapper") !== null;

        // Check for CAPTCHA
        const hasCaptcha =
          pageText.includes("captcha") ||
          document.querySelector("iframe[src*='captcha']") !== null ||
          document.querySelector(".g-recaptcha") !== null;

        // Check for rate limiting
        const hasRateLimit =
          pageText.includes("rate limit") ||
          pageText.includes("too many requests") ||
          pageText.includes("429");

        // Check for maintenance
        const hasMaintenance =
          pageText.includes("maintenance") ||
          pageText.includes("be right back") ||
          pageText.includes("down for maintenance");

        let blockType: any = undefined;
        if (hasCloudflare) blockType = "cloudflare";
        else if (hasCaptcha) blockType = "captcha";
        else if (hasRateLimit) blockType = "rate_limit";
        else if (hasMaintenance) blockType = "maintenance";

        return {
          isBlocked:
            hasCloudflare || hasCaptcha || hasRateLimit || hasMaintenance,
          blockType,
        };
      });

      return {
        isBlocked: result?.isBlocked || false,
        blockType: result?.blockType,
      };
    } catch (error) {
      return {
        isBlocked: false,
      };
    }
  }
}
