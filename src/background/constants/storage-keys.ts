// src/background/constants/storage-keys.ts

/**
 * Storage Keys Constants
 */

// Local Storage Keys
export const LOCAL_STORAGE_KEYS = {
  // WebSocket
  WS_STATES: "wsStates",
  WS_MESSAGES: "wsMessages",
  WS_OUTGOING_MESSAGE: "wsOutgoingMessage",
  WS_INCOMING_REQUEST: "wsIncomingRequest",

  // API Configuration
  API_PROVIDER: "apiProvider",

  // Container Management
  ZEN_TAB_CONTAINERS: "zenTabContainers",
  ZEN_TAB_SELECTED_TABS: "zenTabSelectedTabs",

  // Legacy (for cleanup)
  WS_CONNECTION: "wsConnection",
  WS_CONNECTION_ID: "wsConnectionId",
  WS_PORT: "wsPort",
  WS_URL: "wsUrl",
  LAST_CONNECTED: "lastConnected",
} as const;

// Session Storage Keys
export const SESSION_STORAGE_KEYS = {
  // Tab States
  ZEN_TAB_STATES: "zenTabStates",

  // Token Accumulator
  FOLDER_TOKEN_ACCUMULATOR: "folderTokenAccumulator",

  // Cache
  TAB_STATE_CACHE: "tabStateCache",
  INITIALIZATION_LOCKS: "initializationLocks",
} as const;

// Temporary Storage Keys (auto-cleaned)
export const TEMP_STORAGE_KEYS = {
  // Request deduplication
  PROCESSED_REQUEST_PREFIX: "processed_",
  FORWARDED_REQUEST_PREFIX: "forwarded_",

  // Test responses
  TEST_RESPONSE_PREFIX: "testResponse_",

  // Deduplication
  DEDUPE_PREFIX: "dedupe_",
  CLEANUP_PREFIX: "cleanup_",
  FOLDER_REQUEST_PREFIX: "folder_req_",
  TABS_REQUEST_PREFIX: "tabs_req_",
} as const;

/**
 * Get full storage key
 */
export function getStorageKey(
  type: "local" | "session" | "temp",
  key: string
): string {
  switch (type) {
    case "local":
      return LOCAL_STORAGE_KEYS[key as keyof typeof LOCAL_STORAGE_KEYS] || key;
    case "session":
      return (
        SESSION_STORAGE_KEYS[key as keyof typeof SESSION_STORAGE_KEYS] || key
      );
    case "temp":
      return `temp_${key}`;
    default:
      return key;
  }
}

/**
 * Check if key is legacy
 */
export function isLegacyKey(key: string): boolean {
  const legacyKeys = [
    "wsConnection",
    "wsConnectionId",
    "wsPort",
    "wsUrl",
    "lastConnected",
  ];

  return legacyKeys.includes(key);
}

/**
 * Get all legacy keys
 */
export function getAllLegacyKeys(): string[] {
  return [
    LOCAL_STORAGE_KEYS.WS_CONNECTION,
    LOCAL_STORAGE_KEYS.WS_CONNECTION_ID,
    LOCAL_STORAGE_KEYS.WS_PORT,
    LOCAL_STORAGE_KEYS.WS_URL,
    LOCAL_STORAGE_KEYS.LAST_CONNECTED,
  ];
}

/**
 * Get keys for cleanup
 */
export function getCleanupKeys(): {
  local: string[];
  session: string[];
} {
  return {
    local: [
      LOCAL_STORAGE_KEYS.WS_MESSAGES,
      LOCAL_STORAGE_KEYS.WS_OUTGOING_MESSAGE,
      LOCAL_STORAGE_KEYS.WS_INCOMING_REQUEST,
      ...getAllLegacyKeys(),
    ],
    session: [],
  };
}
