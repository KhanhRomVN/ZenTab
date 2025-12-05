// src/background/types/messaging/message.types.ts

/**
 * Message Types - Type definitions cho messaging system
 */

export interface BaseMessage {
  id: string;
  type: string;
  timestamp: number;
  sender?: string;
  recipient?: string;
}

export interface WebSocketMessage extends BaseMessage {
  connectionId: string;
  data: any;
  metadata?: {
    retryCount?: number;
    priority?: number;
    timeout?: number;
  };
}

export interface PromptRequestMessage {
  type: "promptRequest";
  requestId: string;
  tabId: number;
  systemPrompt?: string;
  userPrompt: string;
  folderPath?: string;
  isNewTask?: boolean;
  metadata?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
  timestamp: number;
}

export interface PromptResponseMessage {
  type: "promptResponse";
  requestId: string;
  tabId: number;
  success: boolean;
  response?: string;
  error?: string;
  errorType?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  timestamp: number;
}

export interface TabStatusMessage {
  type: "tabStatus";
  tabId: number;
  status: "free" | "busy" | "error";
  requestId?: string;
  timestamp: number;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

export interface ConnectionMessage {
  type: "connection";
  connectionId: string;
  status: "connected" | "disconnected" | "reconnecting";
  timestamp: number;
}

export interface LogMessage {
  type: "log";
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: any;
  timestamp: number;
}

// Union type cho tất cả message types
export type Message =
  | WebSocketMessage
  | PromptRequestMessage
  | PromptResponseMessage
  | TabStatusMessage
  | ErrorMessage
  | ConnectionMessage
  | LogMessage;

/**
 * Message validation functions
 */
export function isValidMessage(message: any): message is Message {
  if (!message || typeof message !== "object") return false;
  if (!message.type || typeof message.type !== "string") return false;
  if (!message.timestamp || typeof message.timestamp !== "number") return false;

  return true;
}

export function isPromptRequest(message: any): message is PromptRequestMessage {
  return isValidMessage(message) && message.type === "promptRequest";
}

export function isPromptResponse(
  message: any
): message is PromptResponseMessage {
  return isValidMessage(message) && message.type === "promptResponse";
}

export function isTabStatus(message: any): message is TabStatusMessage {
  return isValidMessage(message) && message.type === "tabStatus";
}

export function isErrorMessage(message: any): message is ErrorMessage {
  return isValidMessage(message) && message.type === "error";
}

/**
 * Message builder functions
 */
export function buildPromptRequest(
  requestId: string,
  tabId: number,
  userPrompt: string,
  systemPrompt?: string,
  folderPath?: string
): PromptRequestMessage {
  return {
    type: "promptRequest",
    requestId,
    tabId,
    userPrompt,
    systemPrompt,
    folderPath,
    timestamp: Date.now(),
  };
}

export function buildPromptResponseSuccess(
  requestId: string,
  tabId: number,
  response: string,
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
): PromptResponseMessage {
  return {
    type: "promptResponse",
    requestId,
    tabId,
    success: true,
    response,
    usage,
    timestamp: Date.now(),
  };
}

export function buildPromptResponseError(
  requestId: string,
  tabId: number,
  error: string,
  errorType?: string
): PromptResponseMessage {
  return {
    type: "promptResponse",
    requestId,
    tabId,
    success: false,
    error,
    errorType,
    timestamp: Date.now(),
  };
}

export function buildTabStatus(
  tabId: number,
  status: "free" | "busy" | "error",
  requestId?: string
): TabStatusMessage {
  return {
    type: "tabStatus",
    tabId,
    status,
    requestId,
    timestamp: Date.now(),
  };
}

export function buildErrorMessage(
  code: string,
  message: string,
  details?: any
): ErrorMessage {
  return {
    type: "error",
    code,
    message,
    details,
    timestamp: Date.now(),
  };
}

/**
 * Message serialization/deserialization
 */
export function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}

export function deserializeMessage(data: string): Message | null {
  try {
    const parsed = JSON.parse(data);
    if (isValidMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
