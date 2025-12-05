// src/background/types/ai-services/deepseek.types.ts

/**
 * DeepSeek Configuration
 */
export interface DeepSeekConfig {
  maxPolls: number;
  pollInterval: number;
  initialDelay: number;
  maxRetries: number;
  baseDelay: number;
  maxClipboardDelay: number;
}

/**
 * DeepSeek Button State
 */
export interface DeepSeekButtonState {
  isBusy: boolean;
  uncertain?: boolean;
  reason?: string;
  debug?: {
    buttonExists: boolean;
    isDisabled: boolean;
    classList: string[];
    pathData?: string;
    isStopIcon?: boolean;
    isSendIcon?: boolean;
  };
}

/**
 * DeepSeek Response Processing Result
 */
export interface DeepSeekResponseResult {
  content: string;
  method: string;
  rawHtml?: string;
  processedHtml?: string;
}

/**
 * DeepSeek Token Calculation Result
 */
export interface TokenCalculationResult {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimationMethod: "gpt-tokenizer" | "word-count" | "character-count";
  confidence: number; // 0-1
}

/**
 * DeepSeek Folder Token Accumulator
 */
export interface FolderTokenAccumulator {
  [folderPath: string]: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    lastUpdated: number;
    requestCount: number;
  };
}

/**
 * DeepSeek Prompt Request
 */
export interface DeepSeekPromptRequest {
  tabId: number;
  systemPrompt?: string | null;
  userPrompt: string;
  requestId: string;
  isNewTask?: boolean;
  folderPath?: string;
  timestamp: number;
}

/**
 * DeepSeek Prompt Response
 */
export interface DeepSeekPromptResponse {
  requestId: string;
  tabId: number;
  success: boolean;
  response?: string;
  error?: string;
  errorType?: string;
  tokens?: TokenCalculationResult;
  timestamp: number;
}

/**
 * DeepSeek DOM Element Info
 */
export interface DeepSeekElementInfo {
  exists: boolean;
  selector: string;
  count: number;
  isVisible: boolean;
  isEnabled: boolean;
  attributes?: Record<string, string>;
  textContent?: string;
}

/**
 * DeepSeek Chat State
 */
export interface DeepSeekChatState {
  isGenerating: boolean;
  hasStopButton: boolean;
  hasSendButton: boolean;
  isNewChatAvailable: boolean;
  isDeepThinkEnabled: boolean;
  currentInput: string;
  messageCount: number;
  lastMessageType?: "user" | "assistant";
}

/**
 * DeepSeek Monitoring State
 */
export interface DeepSeekMonitoringState {
  tabId: number;
  requestId: string;
  startTime: number;
  pollCount: number;
  lastStatusCheck: number;
  isComplete: boolean;
  hasError: boolean;
  error?: string;
}

// Default Configuration
export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  maxPolls: 1500,
  pollInterval: 1000,
  initialDelay: 3000,
  maxRetries: 3,
  baseDelay: 200,
  maxClipboardDelay: 2000,
};

// Response Processing Options
export interface ResponseProcessingOptions {
  decodeHtmlEntities: boolean;
  fixXmlStructure: boolean;
  unwrapTaskProgress: boolean;
  cleanCodeFences: boolean;
  removeUiArtifacts: boolean;
  preserveIndentation: boolean;
}

export const DEFAULT_RESPONSE_PROCESSING_OPTIONS: ResponseProcessingOptions = {
  decodeHtmlEntities: true,
  fixXmlStructure: true,
  unwrapTaskProgress: true,
  cleanCodeFences: true,
  removeUiArtifacts: true,
  preserveIndentation: true,
};

// Validation Results
export interface DeepSeekValidationResult {
  isValid: boolean;
  tabExists: boolean;
  isDeepSeekPage: boolean;
  tabStateValid: boolean;
  canAcceptRequest: boolean;
  errors: string[];
  warnings: string[];
}

// Event Types
export enum DeepSeekEventType {
  PROMPT_SENT = "prompt_sent",
  RESPONSE_RECEIVED = "response_received",
  GENERATION_STARTED = "generation_started",
  GENERATION_STOPPED = "generation_stopped",
  ERROR_OCCURRED = "error_occurred",
  TAB_STATE_CHANGED = "tab_state_changed",
  TOKENS_CALCULATED = "tokens_calculated",
}

export interface DeepSeekEvent {
  type: DeepSeekEventType;
  tabId: number;
  requestId?: string;
  data?: any;
  timestamp: number;
}
