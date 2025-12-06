// src/background/core/types/core/tab-state.types.ts

/**
 * Tab State Data interface
 */
export interface TabStateData {
  status: "free" | "busy" | "sleep";
  requestId: string | null;
  requestCount: number;
  folderPath?: string | null;
}

/**
 * Tab State Info interface (dùng cho UI)
 */
export interface TabStateInfo {
  tabId: number;
  containerName: string;
  title: string;
  url?: string;
  status: "free" | "busy" | "sleep";
  canAccept: boolean;
  requestCount: number;
  folderPath: string | null;
  provider?: "deepseek" | "chatgpt" | "gemini" | "grok";
  cookieStoreId?: string;
}

/**
 * Tab State Cache entry
 */
export interface TabStateCacheEntry {
  state: TabStateData;
  timestamp: number;
}

/**
 * Tab State Storage structure
 */
export interface TabStateStorage {
  [tabId: number]: TabStateData;
}
