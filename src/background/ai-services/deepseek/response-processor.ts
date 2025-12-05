// src/background/ai-services/deepseek/response-processor.ts

/**
 * Response Processor - Xử lý và làm sạch responses từ DeepSeek
 */
export class ResponseProcessor {
  /**
   * Process raw HTML response từ DeepSeek
   */
  public static async processResponse(rawHtml: string): Promise<string> {
    if (!rawHtml) {
      return "";
    }

    // Step 1: Decode HTML entities
    let processed = this.decodeHtmlEntities(rawHtml);

    // Step 2: Fix XML structure
    processed = this.fixXmlStructure(processed);

    // Step 3: Unwrap task progress blocks
    processed = this.unwrapTaskProgress(processed);

    // Step 4: Remove UI artifacts
    processed = this.removeUiArtifacts(processed);

    // Step 5: Clean code fences
    processed = this.cleanCodeFences(processed);

    // Step 6: Normalize whitespace
    processed = this.normalizeWhitespace(processed);

    // Step 7: Validate và fix indentation
    processed = this.fixIndentation(processed);

    return processed.trim();
  }

  /**
   * Decode HTML entities
   */
  private static decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      "&lt;": "<",
      "&gt;": ">",
      "&amp;": "&",
      "&quot;": '"',
      "&#39;": "'",
      "&#x27;": "'",
      "&#x2F;": "/",
      "&#60;": "<",
      "&#62;": ">",
      "&nbsp;": " ",
      "&apos;": "'",
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      const regex = new RegExp(entity, "g");
      decoded = decoded.replace(regex, char);
    }

    // Handle numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
      String.fromCharCode(parseInt(num, 10))
    );

    // Handle hex entities
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    return decoded;
  }

  /**
   * Fix XML structure issues
   */
  private static fixXmlStructure(content: string): string {
    // Fix missing newlines between tags
    let fixed = content.replace(/(<\/[a-z_]+>)(<[a-z_]+>)/g, "$1\n$2");

    // Fix task_progress không nằm trong proper container
    fixed = fixed.replace(
      /(<read_file>[\s\S]*?)(<task_progress>[\s\S]*?<\/task_progress>)([\s\S]*?<\/read_file>)/g,
      "$1```text\n$2\n```\n$3"
    );

    // Ensure proper closing tags
    const tagStack: string[] = [];
    const lines = fixed.split("\n");
    const processedLines: string[] = [];

    for (const line of lines) {
      const openMatch = line.match(/<([a-z_]+)[^>]*>/);
      const closeMatch = line.match(/<\/([a-z_]+)>/);

      if (openMatch && !line.includes("</")) {
        tagStack.push(openMatch[1]);
      }

      if (closeMatch) {
        const expectedTag = tagStack.pop();
        if (expectedTag !== closeMatch[1]) {
          // Auto-fix closing tag
          const fixedLine = line.replace(
            /<\/([a-z_]+)>/,
            `</${expectedTag || closeMatch[1]}>`
          );
          processedLines.push(fixedLine);
          continue;
        }
      }

      processedLines.push(line);
    }

    // Auto-close any remaining open tags
    while (tagStack.length > 0) {
      const tag = tagStack.pop()!;
      processedLines.push(`</${tag}>`);
    }

    return processedLines.join("\n");
  }

  /**
   * Unwrap task progress blocks từ code fences
   */
  private static unwrapTaskProgress(content: string): string {
    const patterns = [
      /```text\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g,
      /```\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g,
      /`{3,}\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*`{3,}/g,
    ];

    let unwrapped = content;
    for (const pattern of patterns) {
      unwrapped = unwrapped.replace(pattern, "$1");
    }

    // Remove UI artifacts around task_progress
    unwrapped = unwrapped.replace(
      /(Copy\s*(?:Download)?\s*\n+)(<[a-z_]+>)/gi,
      "$2"
    );
    unwrapped = unwrapped.replace(/\btext\s*\n+(<[a-z_]+>)/gi, "$1");

    return unwrapped;
  }

  /**
   * Remove UI artifacts (Copy, Download buttons text)
   */
  private static removeUiArtifacts(content: string): string {
    let cleaned = content;

    // Remove copy/download button text
    cleaned = cleaned.replace(/\n*Copy\s*\n*/gi, "\n");
    cleaned = cleaned.replace(/\n*Download\s*\n*/gi, "\n");
    cleaned = cleaned.replace(/\btext\s*\n+/gi, "\n");

    // Remove other UI artifacts
    cleaned = cleaned.replace(/\n*Regenerate\s*\n*/gi, "\n");
    cleaned = cleaned.replace(/\n*Stop\s*generating\s*\n*/gi, "\n");
    cleaned = cleaned.replace(/\n*Send\s*message\s*\n*/gi, "\n");

    // Remove empty divs và spans với class UI
    cleaned = cleaned.replace(
      /<div[^>]*class="[^"]*(copy|download|button|icon)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      ""
    );
    cleaned = cleaned.replace(
      /<span[^>]*class="[^"]*(copy|download|button|icon)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      ""
    );

    return cleaned;
  }

  /**
   * Clean code fences trong các blocks
   */
  private static cleanCodeFences(content: string): string {
    let cleaned = content;

    // Clean SEARCH/REPLACE code fences trong <diff> blocks
    cleaned = this.cleanSearchReplaceCodeFences(cleaned);

    // Clean code fences trong <content> blocks của <write_to_file>
    cleaned = this.cleanContentCodeFences(cleaned);

    // Remove any remaining code block markers around XML tags
    cleaned = cleaned
      .replace(/```\s*\n+(<[a-z_]+>)/gi, "$1")
      .replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");

    return cleaned;
  }

  /**
   * Clean SEARCH/REPLACE code fences
   */
  private static cleanSearchReplaceCodeFences(content: string): string {
    const diffBlockPattern = /<diff>([\s\S]*?)<\/diff>/g;
    const CODE_FENCE = "```";
    const UI_ARTIFACTS = ["text", "copy", "download"];

    return content.replace(diffBlockPattern, (_match, diffContent) => {
      const lines = diffContent.split("\n");
      const searchMarker = "<<<<<<< SEARCH";
      const separatorMarker = "=======";
      const replaceMarker = "> REPLACE";

      // Tìm vị trí các marker
      let searchIdx = -1;
      let separatorIdx = -1;
      let replaceIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(searchMarker)) searchIdx = i;
        if (lines[i].includes(separatorMarker)) separatorIdx = i;
        if (lines[i].includes(replaceMarker)) replaceIdx = i;
      }

      if (searchIdx === -1 || separatorIdx === -1 || replaceIdx === -1) {
        return `<diff>${diffContent}</diff>`;
      }

      const linesToRemove = new Set<number>();

      // Xóa code fence không cần thiết
      this.removeUnnecessaryCodeFences(
        lines,
        linesToRemove,
        searchIdx,
        separatorIdx,
        replaceIdx,
        CODE_FENCE,
        UI_ARTIFACTS
      );

      // Lọc bỏ các dòng cần xóa
      const cleanedLines = lines.filter(
        (_: any, idx: number) => !linesToRemove.has(idx)
      );

      return `<diff>${cleanedLines.join("\n")}</diff>`;
    });
  }

  /**
   * Remove unnecessary code fences
   */
  private static removeUnnecessaryCodeFences(
    lines: string[],
    linesToRemove: Set<number>,
    searchIdx: number,
    separatorIdx: number,
    replaceIdx: number,
    codeFence: string,
    uiArtifacts: string[]
  ): void {
    // Xóa dòng trống sau search marker
    if (searchIdx + 1 < lines.length && lines[searchIdx + 1].trim() === "") {
      linesToRemove.add(searchIdx + 1);
    }

    // Sau search marker: tìm code fence đầu tiên
    for (let i = searchIdx + 1; i < separatorIdx; i++) {
      if (linesToRemove.has(i)) continue;

      const trimmed = lines[i].trim();
      if (trimmed === codeFence) {
        linesToRemove.add(i);
        break;
      }
      const isUIArtifact = uiArtifacts.includes(trimmed.toLowerCase());
      if (trimmed !== "" && !isUIArtifact) {
        break;
      }
    }

    // Xóa dòng trống trước separator
    if (separatorIdx - 1 >= 0 && lines[separatorIdx - 1].trim() === "") {
      linesToRemove.add(separatorIdx - 1);
    }

    // Trước separator: tìm code fence ngược lên
    for (let i = separatorIdx - 1; i > searchIdx; i--) {
      if (linesToRemove.has(i)) continue;

      const trimmed = lines[i].trim();
      if (trimmed === codeFence) {
        linesToRemove.add(i);
        break;
      }
      if (trimmed !== "") {
        break;
      }
    }

    // Xóa dòng trống sau separator
    if (
      separatorIdx + 1 < lines.length &&
      lines[separatorIdx + 1].trim() === ""
    ) {
      linesToRemove.add(separatorIdx + 1);
    }

    // Sau separator: tìm code fence đầu tiên
    for (let i = separatorIdx + 1; i < replaceIdx; i++) {
      if (linesToRemove.has(i)) continue;

      const trimmed = lines[i].trim();
      if (trimmed === codeFence) {
        linesToRemove.add(i);
        break;
      }
      const isUIArtifact = uiArtifacts.includes(trimmed.toLowerCase());
      if (trimmed !== "" && !isUIArtifact) {
        break;
      }
    }

    // Xóa dòng trống trước replace marker
    if (replaceIdx - 1 >= 0 && lines[replaceIdx - 1].trim() === "") {
      linesToRemove.add(replaceIdx - 1);
    }

    // Trước replace marker: tìm code fence ngược lên
    for (let i = replaceIdx - 1; i > separatorIdx; i--) {
      if (linesToRemove.has(i)) continue;

      const trimmed = lines[i].trim();
      if (trimmed === codeFence) {
        linesToRemove.add(i);
        break;
      }
      if (trimmed !== "") {
        break;
      }
    }
  }

  /**
   * Clean content code fences
   */
  private static cleanContentCodeFences(content: string): string {
    const contentBlockPattern = /<content>([\s\S]*?)<\/content>/g;
    const CODE_FENCE = "```";
    const UI_ARTIFACTS = ["text", "copy", "download"];

    return content.replace(contentBlockPattern, (_match, contentBlock) => {
      const lines = contentBlock.split("\n");

      if (lines.length === 0) {
        return `<content>${contentBlock}</content>`;
      }

      const linesToRemove = new Set<number>();

      // Xóa dòng trống đầu tiên
      if (lines[0].trim() === "") {
        linesToRemove.add(0);
      }

      // Tìm và xóa code fence đầu tiên
      for (let i = 0; i < lines.length; i++) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }

        const isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
        if (trimmed !== "" && !isUIArtifact) {
          break;
        }
      }

      // Xóa dòng trống cuối cùng
      const lastIdx = lines.length - 1;
      if (lastIdx >= 0 && lines[lastIdx].trim() === "") {
        linesToRemove.add(lastIdx);
      }

      // Tìm và xóa code fence cuối cùng
      for (let i = lastIdx; i >= 0; i--) {
        if (linesToRemove.has(i)) continue;

        const trimmed = lines[i].trim();
        if (trimmed === CODE_FENCE) {
          linesToRemove.add(i);
          break;
        }

        if (trimmed !== "") {
          break;
        }
      }

      // Lọc bỏ các dòng cần xóa
      const cleanedLines = lines.filter(
        (_: any, idx: number) => !linesToRemove.has(idx)
      );

      return `<content>${cleanedLines.join("\n")}</content>`;
    });
  }

  /**
   * Normalize whitespace
   */
  private static normalizeWhitespace(content: string): string {
    // Giảm multiple newlines thành tối đa 2
    let normalized = content.replace(/\n{3,}/g, "\n\n");

    // Fix spacing trong numbered lists
    normalized = normalized.replace(/(\d+\.)\s+\n/g, "$1 ");

    // Đảm bảo proper newlines around XML closing tags
    normalized = normalized.replace(/([^\n])(<\/[a-z_]+>)/g, "$1\n$2");
    normalized = normalized.replace(/(<\/[a-z_]+>)(<\/[a-z_]+>)/g, "$1\n$2");

    // Remove trailing spaces
    normalized = normalized.replace(/[ \t]+$/gm, "");

    return normalized;
  }

  /**
   * Fix indentation issues
   */
  private static fixIndentation(content: string): string {
    const lines = content.split("\n");
    const fixedLines: string[] = [];

    for (const line of lines) {
      // Preserve indentation cho code blocks
      if (line.trim().startsWith("```")) {
        fixedLines.push(line);
        continue;
      }

      // Kiểm tra và fix mixed indentation
      const hasMixedIndentation = /^(\t+ | + \t)/.test(line);
      if (hasMixedIndentation) {
        // Convert tabs to spaces (2 spaces per tab)
        const fixedLine = line.replace(/\t/g, "  ");
        fixedLines.push(fixedLine);
      } else {
        fixedLines.push(line);
      }
    }

    return fixedLines.join("\n");
  }

  /**
   * Validate response structure
   */
  public static validateResponse(response: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for unclosed tags
    const tagStack: string[] = [];
    const tagRegex = /<(\/?)([a-z_]+)[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(response)) !== null) {
      const isClosing = match[1] === "/";
      const tagName = match[2];

      if (!isClosing) {
        tagStack.push(tagName);
      } else {
        const expectedTag = tagStack.pop();
        if (expectedTag !== tagName) {
          errors.push(
            `Mismatched closing tag: </${tagName}> (expected </${expectedTag}>)`
          );
        }
      }
    }

    if (tagStack.length > 0) {
      errors.push(`Unclosed tags: ${tagStack.join(", ")}`);
    }

    // Check for proper task_progress wrapping
    const taskProgressMatch = response.match(
      /<task_progress>[\s\S]*?<\/task_progress>/
    );
    if (taskProgressMatch) {
      const taskProgressContent = taskProgressMatch[0];
      if (!taskProgressContent.includes("```text")) {
        warnings.push("task_progress should be wrapped in ```text code blocks");
      }
    }

    // Check for proper code fences
    const codeFenceCount = (response.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      warnings.push("Unbalanced code fences detected");
    }

    // Check for UI artifacts
    const uiArtifacts = ["Copy", "Download", "Regenerate", "Stop generating"];
    for (const artifact of uiArtifacts) {
      if (response.includes(artifact)) {
        warnings.push(`UI artifact detected: ${artifact}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
