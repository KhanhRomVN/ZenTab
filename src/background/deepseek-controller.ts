// src/background/deepseek-controller.ts
import { ChatController } from "./deepseek/chat-controller";
import { StateController } from "./deepseek/state-controller";
import { PromptController } from "./deepseek/prompt-controller";

/**
 * Facade controller để export các method từ sub-controllers
 */
export class DeepSeekController {
  // Chat operations
  static async clickNewChatButton(tabId: number): Promise<boolean> {
    return ChatController.clickNewChatButton(tabId);
  }

  static async isDeepThinkEnabled(tabId: number): Promise<boolean> {
    return ChatController.isDeepThinkEnabled(tabId);
  }

  static async toggleDeepThink(
    tabId: number,
    enable: boolean
  ): Promise<boolean> {
    return ChatController.toggleDeepThink(tabId, enable);
  }

  static async createNewChat(tabId: number): Promise<boolean> {
    return ChatController.createNewChat(tabId);
  }

  static async getChatTitle(tabId: number): Promise<string | null> {
    return ChatController.getChatTitle(tabId);
  }

  // State operations
  static async isGenerating(tabId: number): Promise<boolean> {
    return StateController.isGenerating(tabId);
  }

  static async stopGeneration(tabId: number): Promise<boolean> {
    return StateController.stopGeneration(tabId);
  }

  static async getCurrentInput(tabId: number): Promise<string> {
    return StateController.getCurrentInput(tabId);
  }

  static async getLatestResponse(tabId: number): Promise<string | null> {
    return StateController.getLatestResponse(tabId);
  }

  // Prompt operations - Overload 1 (backward compatible)
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  // Prompt operations - Overload 2 (systemPrompt + userPrompt)
  static async sendPrompt(
    tabId: number,
    systemPrompt: string | null,
    userPrompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean>;

  // Implementation
  static async sendPrompt(
    tabId: number,
    promptOrSystemPrompt: string | null,
    userPromptOrRequestId: string,
    requestIdOrIsNewTask?: string | boolean,
    isNewTask?: boolean
  ): Promise<boolean> {
    // Delegate to PromptController với đúng arguments
    if (typeof requestIdOrIsNewTask === "string") {
      // Overload 2: (tabId, systemPrompt, userPrompt, requestId, isNewTask?)
      return PromptController.sendPrompt(
        tabId,
        promptOrSystemPrompt,
        userPromptOrRequestId,
        requestIdOrIsNewTask,
        isNewTask
      );
    } else {
      // Overload 1: (tabId, prompt, requestId, isNewTask?)
      return PromptController.sendPrompt(
        tabId,
        promptOrSystemPrompt || "",
        userPromptOrRequestId,
        requestIdOrIsNewTask
      );
    }
  }

  // Token management operations
  static async clearTokensForFolder(folderPath: string): Promise<void> {
    return PromptController.clearTokensForFolder(folderPath);
  }
}
