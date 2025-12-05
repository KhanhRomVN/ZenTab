// src/background/constants/selectors/deepseek-selectors.ts

/**
 * DeepSeek CSS Selectors
 */
export const DEEPSEEK_SELECTORS = {
  // Textarea
  TEXTAREA: 'textarea[placeholder="Message DeepSeek"]',

  // Buttons
  SEND_BUTTON: ".ds-icon-button._7436101",
  STOP_BUTTON: '.ds-icon-button._7436101 svg path[d*="M2 4.88006"]',
  NEW_CHAT_BUTTON: '.ds-icon-button._4f3769f[role="button"]',
  NEW_CHAT_BUTTON_ALT: "._5a8ac7a",
  DEEPTHINK_BUTTON: "button.ds-toggle-button",
  SECONDARY_BUTTON: "button.ds-floating-button--secondary",

  // Message Containers
  MESSAGE_CONTAINER: '[class*="message"]',
  ASSISTANT_MESSAGE: '[class*="message"]:not([class*="user"])',
  USER_MESSAGE: '[class*="message"][class*="user"]',

  // Content
  MARKDOWN_CONTENT: ".ds-markdown",
  MARKDOWN_HTML: ".ds-markdown-html",
  CODE_BLOCK: "pre",
  INLINE_CODE: "code:not(pre code)",

  // UI Elements
  CHAT_TITLE: ".afa34042.e37a04e4.e0a1edb7",
  COPY_BUTTON: ".ds-icon-button.db183363",

  // Input Validation
  DISABLED_BUTTON: ".ds-icon-button--disabled",
  ARIA_DISABLED: '[aria-disabled="true"]',

  // Task Progress (trong responses)
  TASK_PROGRESS: "task_progress",
  CHECKBOX: 'input[type="checkbox"]',

  // Lists
  UNORDERED_LIST: "ul",
  ORDERED_LIST: "ol",
  LIST_ITEM: "li",

  // Headings
  HEADINGS: /^h[1-6]$/,

  // Other
  BLOCKQUOTE: "blockquote",
  PARAGRAPH: "p",
  BOLD: "strong, b",
  ITALIC: "em, i",
  LINE_BREAK: "br",
} as const;

/**
 * DeepSeek Icon Path Data
 */
export const DEEPSEEK_ICONS = {
  // Stop icon (AI đang trả lời)
  STOP_ICON: {
    paths: ["M2 4.88006", "C2 3.68015", "2.30557 2.6596"],
    description: "Stop/Regenerate icon (AI đang trả lời)",
  },

  // Send icon (AI sẵn sàng nhận prompt)
  SEND_ICON: {
    paths: ["M8.3125 0.981648", "9.2627 1.4338", "9.97949 2.1086"],
    description: "Send icon (AI sẵn sàng)",
  },

  // New chat icon
  NEW_CHAT_ICON: {
    paths: ["M8 0.599609C3.91309 0.599609", "M7.34473 4.93945V7.34961"],
    description: "New chat icon",
  },
} as const;

/**
 * DeepSeek Class Patterns
 */
export const DEEPSEEK_CLASS_PATTERNS = {
  MESSAGE: /message|chat-message|conversation/,
  USER: /user/,
  ASSISTANT: /assistant/,
  DISABLED: /--disabled|disabled/,
  SELECTED: /--selected|selected/,
} as const;

/**
 * DeepSeek URL Patterns
 */
export const DEEPSEEK_URLS = {
  CHAT: "https://chat.deepseek.com",
  WILDCARD: "https://*.deepseek.com/*",
  ALL: ["https://chat.deepseek.com/*", "https://*.deepseek.com/*"],
} as const;

/**
 * Check if element matches DeepSeek selector
 */
export function isDeepSeekElement(
  element: Element,
  selectorType: keyof typeof DEEPSEEK_SELECTORS
): boolean {
  const selector = DEEPSEEK_SELECTORS[selectorType];

  if (typeof selector === "string") {
    return element.matches(selector);
  }

  if (selector instanceof RegExp) {
    return selector.test(element.tagName.toLowerCase());
  }

  return false;
}

/**
 * Get DeepSeek selector for action
 */
export function getSelectorForAction(action: string): string | null {
  const selectorMap: Record<string, string> = {
    send: DEEPSEEK_SELECTORS.SEND_BUTTON,
    stop: DEEPSEEK_SELECTORS.STOP_BUTTON,
    new_chat: DEEPSEEK_SELECTORS.NEW_CHAT_BUTTON,
    deepthink: DEEPSEEK_SELECTORS.DEEPTHINK_BUTTON,
    textarea: DEEPSEEK_SELECTORS.TEXTAREA,
    copy: DEEPSEEK_SELECTORS.COPY_BUTTON,
  };

  return selectorMap[action] || null;
}
