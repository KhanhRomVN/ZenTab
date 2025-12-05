// src/background/constants/selectors/common-selectors.ts

/**
 * Common Selectors - CSS selectors chung cho tất cả AI platforms
 */

export const COMMON_SELECTORS = {
  // Textarea selectors (chung cho tất cả AI platforms)
  textarea: {
    primary: 'textarea, [contenteditable="true"], input[type="text"]',
    placeholder:
      '[placeholder*="message" i], [placeholder*="ask" i], [placeholder*="type" i]',
    chatInput:
      'textarea[class*="input"], textarea[class*="message"], textarea[class*="chat"]',
  },

  // Button selectors
  button: {
    send: 'button[type="submit"], button:has(svg.send), button.send, button[aria-label*="send" i]',
    primary:
      'button.primary, button[class*="primary"], button:has-text("Send")',
    secondary: 'button.secondary, button[class*="secondary"]',
    disabled: 'button[disabled], button[aria-disabled="true"], button.disabled',
  },

  // Loading indicators
  loading: {
    spinner: '.spinner, .loading, .animate-spin, [class*="loading"]',
    progress: 'progress, [role="progressbar"], .progress-bar',
    skeleton: '.skeleton, .shimmer, [class*="skeleton"]',
  },

  // Message containers
  message: {
    container: '[class*="message"], [class*="chat"], [class*="conversation"]',
    user: '[class*="user"], [class*="human"], [data-role="user"]',
    assistant: '[class*="assistant"], [class*="ai"], [data-role="assistant"]',
    system: '[class*="system"], [data-role="system"]',
  },

  // Error messages
  error: {
    container: '.error, .alert-error, [class*="error"], [role="alert"]',
    message: '[class*="error-message"], .error-text, [data-error]',
    icon: '[class*="error-icon"], svg[class*="error"]',
  },

  // Navigation
  navigation: {
    sidebar: 'nav, .sidebar, aside, [role="navigation"]',
    menu: '.menu, [role="menu"], [aria-label*="menu"]',
    item: '.nav-item, [role="menuitem"], [class*="item"]',
  },

  // Modal/dialog
  modal: {
    container: '.modal, .dialog, [role="dialog"], [aria-modal="true"]',
    close: '.close, [aria-label*="close"], button[class*="close"]',
    overlay: '.overlay, .backdrop, [class*="backdrop"]',
  },

  // Form elements
  form: {
    input: 'input, textarea, select, [contenteditable="true"]',
    label: 'label, [class*="label"], [for]',
    group: '.form-group, .field, [class*="form"]',
  },

  // UI components
  ui: {
    card: '.card, .panel, [class*="card"]',
    header: 'header, .header, [class*="header"]',
    footer: 'footer, .footer, [class*="footer"]',
    container: '.container, .wrapper, [class*="container"]',
  },
};

/**
 * Detect platform từ URL hoặc page content
 */
export function detectPlatform(
  url: string,
  pageTitle?: string
): "chatgpt" | "deepseek" | "claude" | "gemini" | "unknown" {
  const urlLower = url.toLowerCase();
  const titleLower = (pageTitle || "").toLowerCase();

  if (
    urlLower.includes("chat.openai.com") ||
    urlLower.includes("chatgpt.com") ||
    titleLower.includes("chatgpt")
  ) {
    return "chatgpt";
  }

  if (
    urlLower.includes("chat.deepseek.com") ||
    titleLower.includes("deepseek")
  ) {
    return "deepseek";
  }

  if (urlLower.includes("claude.ai") || titleLower.includes("claude")) {
    return "claude";
  }

  if (urlLower.includes("gemini.google.com") || titleLower.includes("gemini")) {
    return "gemini";
  }

  return "unknown";
}

/**
 * Get platform-specific selectors
 */
export function getPlatformSelectors(platform: string): Record<string, any> {
  const platformSelectors: Record<string, any> = {
    chatgpt: {
      textarea: 'textarea[placeholder*="Message ChatGPT"]',
      sendButton: 'button[data-testid*="send-button"]',
      newChatButton: 'a[href*="/chat/new"]',
    },
    deepseek: {
      textarea: 'textarea[placeholder*="Message DeepSeek"]',
      sendButton: ".ds-icon-button._7436101",
      newChatButton: 'button[class*="new-chat"]',
    },
    claude: {
      textarea: 'textarea[placeholder*="Message Claude"]',
      sendButton: 'button[aria-label*="Send"]',
      newChatButton: 'button:has-text("New Chat")',
    },
    gemini: {
      textarea: 'textarea[placeholder*="Enter a prompt here"]',
      sendButton: "button.send-button",
      newChatButton: 'button[aria-label*="New chat"]',
    },
  };

  return platformSelectors[platform] || {};
}

/**
 * Validate selectors trên page hiện tại
 */
export async function validateSelectorsOnPage(
  tabId: number,
  selectors: string[]
): Promise<{
  valid: string[];
  invalid: string[];
  counts: Record<string, number>;
}> {
  // Implementation sẽ được thêm sau
  return {
    valid: selectors,
    invalid: [],
    counts: {},
  };
}

/**
 * Find best matching selector cho một element type
 */
export function findBestSelector(
  elementType: "textarea" | "button" | "message" | "error",
  platform?: string
): string {
  const selectors = COMMON_SELECTORS;

  switch (elementType) {
    case "textarea":
      if (platform) {
        const platformSpecific = getPlatformSelectors(platform);
        return platformSpecific.textarea || selectors.textarea.primary;
      }
      return selectors.textarea.primary;

    case "button":
      return selectors.button.send;

    case "message":
      return selectors.message.container;

    case "error":
      return selectors.error.container;

    default:
      return "";
  }
}

/**
 * Check if element có thể tương tác được
 */
export function isElementInteractable(selector: string): boolean {
  // Simple check - không phải disabled selector
  const disabledPatterns = [
    /\[disabled\]/i,
    /\.disabled/i,
    /\[aria-disabled="true"\]/i,
    /:disabled/i,
  ];

  return !disabledPatterns.some((pattern) => pattern.test(selector));
}

/**
 * Get selector priority
 */
export function getSelectorPriority(selector: string): number {
  // Higher priority cho selectors cụ thể hơn
  if (selector.includes("[") && selector.includes("]")) {
    // Attribute selectors
    if (selector.includes("data-testid") || selector.includes("aria-label")) {
      return 1;
    }
    if (selector.includes("placeholder") || selector.includes("type")) {
      return 2;
    }
    return 3;
  }

  if (selector.includes(".")) {
    // Class selectors
    if (selector.startsWith(".")) {
      return 4;
    }
    return 5;
  }

  if (selector.includes("#")) {
    // ID selectors
    return 6;
  }

  // Tag selectors
  return 7;
}

/**
 * Generate alternative selectors
 */
export function generateAlternativeSelectors(baseSelector: string): string[] {
  const alternatives: string[] = [];

  // Thêm variations
  if (baseSelector.includes("textarea")) {
    alternatives.push(
      baseSelector.replace("textarea", 'input[type="text"]'),
      baseSelector.replace("textarea", '[contenteditable="true"]'),
      baseSelector + ", " + baseSelector.replace("textarea", "input")
    );
  }

  if (baseSelector.includes("button")) {
    alternatives.push(
      baseSelector.replace("button", 'a[role="button"]'),
      baseSelector.replace("button", '[role="button"]'),
      baseSelector + ", " + baseSelector.replace("button", "a")
    );
  }

  // Thêm class-based alternatives
  if (baseSelector.includes(".")) {
    const classMatch = baseSelector.match(/\.([\w-]+)/);
    if (classMatch) {
      const className = classMatch[1];
      alternatives.push(`[class*="${className}"]`, `[class~="${className}"]`);
    }
  }

  // Thêm attribute-based alternatives
  if (baseSelector.includes("[")) {
    const attrMatch = baseSelector.match(/\[([^\]]+)\]/);
    if (attrMatch) {
      const attr = attrMatch[1];
      alternatives.push(
        baseSelector.replace(`[${attr}]`, `[${attr} i]`) // case-insensitive
      );
    }
  }

  return [...new Set(alternatives)]; // Remove duplicates
}
