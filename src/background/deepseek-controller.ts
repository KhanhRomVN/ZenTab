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
    console.log(`[DeepSeekController] 🎯 sendPrompt() ENTRY POINT`);
    console.log(`[DeepSeekController] 📊 Raw arguments:`, {
      tabId,
      promptOrSystemPrompt_type: typeof promptOrSystemPrompt,
      promptOrSystemPrompt_length: promptOrSystemPrompt?.length || 0,
      userPromptOrRequestId_type: typeof userPromptOrRequestId,
      userPromptOrRequestId_value: userPromptOrRequestId?.substring(0, 50),
      requestIdOrIsNewTask_type: typeof requestIdOrIsNewTask,
      requestIdOrIsNewTask_value: requestIdOrIsNewTask,
      isNewTask_type: typeof isNewTask,
      isNewTask_value: isNewTask,
    });

    // Delegate to PromptController với đúng arguments
    if (typeof requestIdOrIsNewTask === "string") {
      // Overload 2: (tabId, systemPrompt, userPrompt, requestId, isNewTask?)
      console.log(
        `[DeepSeekController] 🔀 Using Overload 2 (systemPrompt + userPrompt)`
      );
      console.log(`[DeepSeekController] 🔍 Parsed arguments:`, {
        tabId,
        systemPrompt: promptOrSystemPrompt
          ? `${promptOrSystemPrompt.length} chars`
          : "null",
        userPrompt: userPromptOrRequestId?.substring(0, 50),
        requestId: requestIdOrIsNewTask,
        isNewTask,
      });

      console.log(
        `[DeepSeekController] 📞 Calling PromptController.sendPrompt()...`
      );
      const result = await PromptController.sendPrompt(
        tabId,
        promptOrSystemPrompt,
        userPromptOrRequestId,
        requestIdOrIsNewTask,
        isNewTask
      );
      console.log(
        `[DeepSeekController] ✅ PromptController.sendPrompt() returned:`,
        result
      );
      return result;
    } else {
      // Overload 1: (tabId, prompt, requestId, isNewTask?)
      console.log(`[DeepSeekController] 🔀 Using Overload 1 (single prompt)`);
      console.log(`[DeepSeekController] 🔍 Parsed arguments:`, {
        tabId,
        prompt: (promptOrSystemPrompt || "").substring(0, 50),
        requestId: userPromptOrRequestId,
        isNewTask: requestIdOrIsNewTask,
      });

      console.log(
        `[DeepSeekController] 📞 Calling PromptController.sendPrompt()...`
      );
      const result = await PromptController.sendPrompt(
        tabId,
        promptOrSystemPrompt || "",
        userPromptOrRequestId,
        requestIdOrIsNewTask
      );
      console.log(
        `[DeepSeekController] ✅ PromptController.sendPrompt() returned:`,
        result
      );
      return result;
    }
  }

  // Token management operations
  static async clearTokensForFolder(folderPath: string): Promise<void> {
    return PromptController.clearTokensForFolder(folderPath);
  }
}
