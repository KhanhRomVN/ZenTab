// src/background/ai-services/deepseek/controller.ts

import { ChatController } from "./chat-controller";
import { StateController } from "./state-controller";
import { PromptController } from "./prompt-controller";

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

  // Prompt operations
  static async sendPrompt(
    tabId: number,
    prompt: string,
    requestId: string,
    isNewTask?: boolean
  ): Promise<boolean> {
    return PromptController.sendPrompt(tabId, prompt, requestId, isNewTask);
  }

  // Token management operations
  static async clearTokensForFolder(folderPath: string): Promise<void> {
    return PromptController.clearTokensForFolder(folderPath);
  }
}
