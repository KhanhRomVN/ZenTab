// src/background/ai-services/deepseek/prompt-builder.ts

import { LANGUAGE_RULES } from "../../constants/rules/language-rules";
import { CLARIFICATION_RULES } from "../../constants/rules/clarification-rules";
import { TEXT_WRAP_RULES } from "../../constants/rules/text-wrap-rules";

/**
 * Prompt Builder - Xây dựng và format prompts
 */
export class PromptBuilder {
  // Language rule - yêu cầu AI trả lời bằng tiếng Việt
  private static readonly LANGUAGE_RULE = LANGUAGE_RULES.VIETNAMESE_REQUIRED;

  // Clarification rules - quy tắc yêu cầu làm rõ thông tin
  private static readonly CLARIFICATION_RULE = CLARIFICATION_RULES.FULL;

  // Text wrapping rules - quy tắc format XML tags và code blocks
  private static readonly TEXT_WRAP_RULE = TEXT_WRAP_RULES.FULL;

  /**
   * Build final prompt với rules
   */
  public static buildFinalPrompt(
    systemPrompt: string | null | undefined,
    userPrompt: string
  ): string {
    // Request đầu tiên: systemPrompt + rules + userPrompt
    if (systemPrompt) {
      return `${systemPrompt}\n\n${this.LANGUAGE_RULE}\n\n${this.CLARIFICATION_RULE}\n\n${this.TEXT_WRAP_RULE}\n\nUSER REQUEST:\n${userPrompt}`;
    }

    // Request thứ 2 trở đi: chỉ userPrompt (đã chứa environment_details, open tabs, etc.)
    return userPrompt;
  }

  /**
   * Build prompt với environment details
   */
  public static buildPromptWithEnvironment(
    userPrompt: string,
    environmentDetails: string,
    openTabs: Array<{ title: string; url: string }>
  ): string {
    const environmentSection = this.buildEnvironmentSection(
      environmentDetails,
      openTabs
    );

    return `${environmentSection}\n\n${userPrompt}`;
  }

  /**
   * Build environment section
   */
  private static buildEnvironmentSection(
    environmentDetails: string,
    openTabs: Array<{ title: string; url: string }>
  ): string {
    let section = "ENVIRONMENT DETAILS:\n";

    // Add environment details
    if (environmentDetails) {
      section += `\n${environmentDetails}\n`;
    }

    // Add open tabs
    if (openTabs && openTabs.length > 0) {
      section += "\nCURRENT OPEN TABS:\n";
      openTabs.forEach((tab, index) => {
        section += `${index + 1}. ${tab.title} (${tab.url})\n`;
      });
    }

    return section;
  }

  /**
   * Format prompt cho specific task type
   */
  public static formatPromptForTask(
    taskType: "code" | "refactor" | "debug" | "analysis",
    userPrompt: string,
    context?: any
  ): string {
    let formattedPrompt = userPrompt;

    switch (taskType) {
      case "code":
        formattedPrompt = this.addCodeTaskInstructions(userPrompt, context);
        break;

      case "refactor":
        formattedPrompt = this.addRefactorTaskInstructions(userPrompt, context);
        break;

      case "debug":
        formattedPrompt = this.addDebugTaskInstructions(userPrompt, context);
        break;

      case "analysis":
        formattedPrompt = this.addAnalysisTaskInstructions(userPrompt, context);
        break;
    }

    return formattedPrompt;
  }

  /**
   * Add code task instructions
   */
  private static addCodeTaskInstructions(
    userPrompt: string,
    context?: any
  ): string {
    let instructions = `CODE TASK INSTRUCTIONS:\n`;
    instructions += `1. Write clean, maintainable code\n`;
    instructions += `2. Include appropriate comments in Vietnamese\n`;
    instructions += `3. Handle edge cases and errors\n`;
    instructions += `4. Follow best practices for the language/framework\n`;

    if (context?.filePath) {
      instructions += `5. This code will be added to: ${context.filePath}\n`;
    }

    return `${instructions}\n\n${userPrompt}`;
  }

  /**
   * Add refactor task instructions
   */
  private static addRefactorTaskInstructions(
    userPrompt: string,
    context?: any
  ): string {
    let instructions = `REFACTOR TASK INSTRUCTIONS:\n`;
    instructions += `1. Improve code structure without changing functionality\n`;
    instructions += `2. Enhance readability and maintainability\n`;
    instructions += `3. Remove code smells and anti-patterns\n`;
    instructions += `4. Preserve all existing functionality\n`;

    if (context?.refactorGoals) {
      instructions += `5. Specific goals: ${context.refactorGoals}\n`;
    }

    return `${instructions}\n\n${userPrompt}`;
  }

  /**
   * Add debug task instructions
   */
  private static addDebugTaskInstructions(
    userPrompt: string,
    context?: any
  ): string {
    let instructions = `DEBUG TASK INSTRUCTIONS:\n`;
    instructions += `1. Identify the root cause of the issue\n`;
    instructions += `2. Provide step-by-step debugging process\n`;
    instructions += `3. Suggest fixes with explanations\n`;
    instructions += `4. Include prevention tips for future\n`;

    if (context?.errorDetails) {
      instructions += `5. Error details: ${context.errorDetails}\n`;
    }

    return `${instructions}\n\n${userPrompt}`;
  }

  /**
   * Add analysis task instructions
   */
  private static addAnalysisTaskInstructions(
    userPrompt: string,
    context?: any
  ): string {
    let instructions = `ANALYSIS TASK INSTRUCTIONS:\n`;
    instructions += `1. Provide comprehensive analysis\n`;
    instructions += `2. Include pros and cons\n`;
    instructions += `3. Suggest alternatives if applicable\n`;
    instructions += `4. Support recommendations with evidence\n`;

    if (context?.analysisCriteria) {
      instructions += `5. Analysis criteria: ${context.analysisCriteria}\n`;
    }

    return `${instructions}\n\n${userPrompt}`;
  }

  /**
   * Validate prompt length và content
   */
  public static validatePrompt(prompt: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    estimatedTokens?: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check length
    if (prompt.length === 0) {
      errors.push("Prompt is empty");
    }

    if (prompt.length > 10000) {
      warnings.push("Prompt is very long, consider splitting it");
    }

    // Check for common issues
    if (prompt.includes("TODO") || prompt.includes("FIXME")) {
      warnings.push("Prompt contains TODO/FIXME markers");
    }

    if (prompt.includes("// TODO") || prompt.includes("# TODO")) {
      warnings.push("Prompt contains code TODO comments");
    }

    // Check for proper formatting
    const hasUnclosedTags = this.checkForUnclosedTags(prompt);
    if (hasUnclosedTags) {
      errors.push("Prompt contains unclosed XML tags");
    }

    // Check for excessive whitespace
    const excessiveNewlines = (prompt.match(/\n{4,}/g) || []).length;
    if (excessiveNewlines > 0) {
      warnings.push("Prompt contains excessive newlines");
    }

    // Estimate tokens (rough estimation)
    const estimatedTokens = this.estimateTokens(prompt);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedTokens,
    };
  }

  /**
   * Check for unclosed tags
   */
  private static checkForUnclosedTags(prompt: string): boolean {
    const tagStack: string[] = [];
    const tagRegex = /<(\/?)([a-z_]+)[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(prompt)) !== null) {
      const isClosing = match[1] === "/";
      const tagName = match[2];

      if (!isClosing) {
        tagStack.push(tagName);
      } else {
        const expectedTag = tagStack.pop();
        if (expectedTag !== tagName) {
          return true;
        }
      }
    }

    return tagStack.length > 0;
  }

  /**
   * Estimate token count
   */
  private static estimateTokens(text: string): number {
    // Rough estimation: ~0.75 tokens per word
    const words = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    return Math.ceil(words.length * 0.75);
  }

  /**
   * Sanitize prompt (remove sensitive data)
   */
  public static sanitizePrompt(prompt: string): string {
    let sanitized = prompt;

    // Remove API keys và tokens
    const sensitivePatterns = [
      /api[_-]?key["']?\s*:\s*["'][^"']+["']/gi,
      /token["']?\s*:\s*["'][^"']+["']/gi,
      /password["']?\s*:\s*["'][^"']+["']/gi,
      /secret["']?\s*:\s*["'][^"']+["']/gi,
      /[a-zA-Z0-9]{32,}/g, // Long strings that might be tokens
    ];

    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }

    // Remove email addresses
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]"
    );

    // Remove IP addresses
    sanitized = sanitized.replace(
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      "[REDACTED_IP]"
    );

    return sanitized;
  }
}
