// src/background/constants/config.ts

/**
 * Application Configuration
 */
export const CONFIG = {
  // WebSocket Configuration
  WEBSOCKET: {
    PING_TIMEOUT: 90000, // 90 seconds
    RECONNECT_DELAY: 5000, // 5 seconds
    MAX_RECONNECT_ATTEMPTS: 5,
    HEALTH_CHECK_INTERVAL: 10000, // 10 seconds
  },

  // Tab State Configuration
  TAB_STATE: {
    CACHE_TTL: 10000, // 10 seconds
    MAX_CACHE_SIZE: 100,
    INIT_TIMEOUT: 10000, // 10 seconds
    RECOVERY_INTERVAL: 10000, // 10 seconds
    POLL_INTERVAL: 1000, // 1 second
    MAX_POLLS: 1500, // 25 minutes
  },

  // Prompt Configuration
  PROMPT: {
    MAX_RETRIES: 3,
    BASE_DELAY: 200,
    INITIAL_DELAY: 3000, // 3 seconds
    MAX_CLIPBOARD_DELAY: 2000, // 2 seconds
  },

  // Storage Configuration
  STORAGE: {
    MUTEX_TIMEOUT: 5000, // 5 seconds
    CLEANUP_INTERVAL: 300000, // 5 minutes
    MESSAGE_TTL: 180000, // 3 minutes
  },

  // UI Configuration
  UI: {
    UPDATE_THROTTLE: 2000, // 2 seconds
    BROADCAST_THROTTLE: 2000, // 2 seconds
    NOTIFICATION_TIMEOUT: 5000, // 5 seconds
  },

  // AI Service Configuration
  AI_SERVICE: {
    DEEPSEEK: {
      SELECTORS: {
        TEXTAREA: 'textarea[placeholder="Message DeepSeek"]',
        SEND_BUTTON: ".ds-icon-button._7436101",
        STOP_BUTTON: '.ds-icon-button._7436101 svg path[d*="M2 4.88006"]',
        NEW_CHAT_BUTTON: '.ds-icon-button._4f3769f[role="button"]',
        DEEPTHINK_BUTTON: "button.ds-toggle-button",
        MESSAGE_CONTAINER: '[class*="message"]',
        MARKDOWN_CONTENT: ".ds-markdown",
      },
      URL_PATTERNS: ["https://chat.deepseek.com/*", "https://*.deepseek.com/*"],
    },
    CHATGPT: {
      SELECTORS: {
        TEXTAREA: 'textarea[name="prompt-textarea"]',
        SEND_BUTTON: 'button[data-testid="send-button"]',
        STOP_BUTTON: 'button[data-testid="stop-button"]',
        NEW_CHAT_BUTTON: 'a[data-testid="create-new-chat-button"]',
        MESSAGE_CONTAINER: '[data-message-author-role="assistant"]',
        MARKDOWN_CONTENT: ".markdown",
      },
      URL_PATTERNS: [
        "https://chatgpt.com/*",
        "https://*.chatgpt.com/*",
        "https://*.openai.com/*",
      ],
    },
  },

  // Token Configuration
  TOKEN: {
    ESTIMATION_RATIO: 0.75, // tokens per word
    FOLDER_ACCUMULATOR_KEY: "folderTokenAccumulator",
  },

  // Performance Configuration
  PERFORMANCE: {
    BATCH_SIZE: 5,
    CONCURRENCY_LIMIT: 3,
    TIMEOUT_DEFAULT: 10000, // 10 seconds
  },
};

/**
 * Feature Flags
 */
export const FEATURE_FLAGS = {
  ENABLE_TOKEN_TRACKING: true,
  ENABLE_AUTO_RECOVERY: true,
  ENABLE_WEBSOCKET: true,
  ENABLE_TAB_BROADCASTING: true,
  ENABLE_FOLDER_LINKING: true,
};

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  TAB_NOT_FOUND: "Tab not found",
  TAB_NOT_DEEPSEEK: "Tab is not a DeepSeek page",
  TAB_NOT_CHATGPT: "Tab is not a ChatGPT page",
  TAB_BUSY: "Tab is currently busy",
  TAB_SLEEP: "Tab is in sleep mode",
  WEBSOCKET_NOT_CONNECTED: "WebSocket not connected",
  API_PROVIDER_NOT_SET: "API Provider not configured",
  PROMPT_TOO_LONG: "Prompt is too long",
  RESPONSE_TIMEOUT: "Response timeout",
  NETWORK_ERROR: "Network error",
  STORAGE_ERROR: "Storage error",
  PERMISSION_DENIED: "Permission denied",
};

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  PROMPT_SENT: "Prompt sent successfully",
  RESPONSE_RECEIVED: "Response received",
  TAB_MARKED_FREE: "Tab marked as free",
  TAB_MARKED_BUSY: "Tab marked as busy",
  WEBSOCKET_CONNECTED: "WebSocket connected",
  WEBSOCKET_DISCONNECTED: "WebSocket disconnected",
  FOLDER_LINKED: "Folder linked successfully",
  FOLDER_UNLINKED: "Folder unlinked successfully",
};

/**
 * Log Levels
 */
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

/**
 * Current log level
 */
export const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;
