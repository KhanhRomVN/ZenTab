// src/background/deepseek/types.ts

export interface DeepSeekConfig {
  maxPolls: number;
  pollInterval: number;
  initialDelay: number;
  maxRetries: number;
  baseDelay: number;
  maxClipboardDelay: number;
}

export const DEFAULT_CONFIG: DeepSeekConfig = {
  maxPolls: 1500,
  pollInterval: 1000,
  initialDelay: 3000,
  maxRetries: 20,
  baseDelay: 200,
  maxClipboardDelay: 2000,
};
