// src/background/constants/rules/text-wrap-rules.ts

/**
 * Text Wrap Rules - Các quy tắc về wrapping code và text blocks
 */

export const TEXT_WRAP_RULES = {
  /**
   * Quy tắc đầy đủ cho text wrapping
   */
  FULL: `╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 1: WHAT MUST BE WRAPPED (MANDATORY)
╚═══════════════════════════════════════════════════════════════════
1. <task_progress> content MUST ALWAYS be wrapped in \`\`\`text code blocks
   - NO EXCEPTIONS - Even if it's just 1 task item
   - Format: \`\`\`text
<task_progress>...</task_progress>
\`\`\`

2. ALL code inside <content> tags of <write_to_file> MUST be wrapped in \`\`\`text
   - Format: <content>
\`\`\`text
YOUR_CODE_HERE
\`\`\`
</content>

3. ALL code in <diff> tags (BOTH SEARCH and REPLACE sections) MUST be wrapped in \`\`\`text
   - Format: <<<<<<< SEARCH
\`\`\`text
OLD_CODE
\`\`\`
=======
\`\`\`text
NEW_CODE
\`\`\`
>>>>>>> REPLACE

╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 2: WRAPPER FORMAT (EXACT SYNTAX) - CRITICAL
╚═══════════════════════════════════════════════════════════════════
4. Text block MUST start with EXACTLY: \`\`\`text (lowercase "text", no spaces)
   ❌ FORBIDDEN: \`\`\`typescript, \`\`\`python, \`\`\`javascript, \`\`\`java, \`\`\`cpp, \`\`\`bash, etc.
   ✅ ONLY ALLOWED: \`\`\`text

5. Text block MUST end with exactly: \`\`\` (three backticks, nothing else)

6. NO content allowed before \`\`\`text or after closing \`\`\`

7. Each wrappable item gets its OWN separate \`\`\`text...\`\`\` block

8. 🔥 CRITICAL: NEVER use language-specific code fence markers
   - Even if code is TypeScript/Python/Java/etc., you MUST use \`\`\`text
   - Language detection is NOT your responsibility
   - Parser expects ONLY \`\`\`text for ALL code blocks

╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 3: WHAT SHOULD NOT BE WRAPPED
╚═══════════════════════════════════════════════════════════════════
9. <thinking> tags and explanations should NOT be wrapped
10. XML tool tags themselves (<read_file>, <write_to_file>, etc.) should NOT be wrapped
11. Vietnamese explanatory text should NOT be wrapped
12. Do NOT wrap multiple different elements in one text block

╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 4: STRUCTURE REQUIREMENTS
╚═══════════════════════════════════════════════════════════════════
13. <content></content> tags are MANDATORY inside ALL <write_to_file> operations
14. NEVER omit <content> tags - this will cause parsing errors
15. Code inside <content> MUST be wrapped: <content>\`\`\`text
CODE\`\`\`</content>

╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 5: INDENTATION PRESERVATION (CRITICAL)
╚═══════════════════════════════════════════════════════════════════
16. You MUST preserve EXACT indentation (spaces/tabs) from original code
17. Count spaces carefully - if original uses 2 spaces, keep 2 spaces
18. Do NOT apply auto-formatting (Prettier, ESLint, PEP8, etc.)
19. In <replace_in_file>, SEARCH block MUST match indentation EXACTLY character-by-character

╔═══════════════════════════════════════════════════════════════════
║ RULE GROUP 6: VALIDATION CHECKLIST (BEFORE SENDING RESPONSE)
╚═══════════════════════════════════════════════════════════════════
20. Before sending response, verify:
    ✓ Every <task_progress> is wrapped in \`\`\`text...\`\`\`
    ✓ Every <content> block has \`\`\`text wrapper
    ✓ Every SEARCH/REPLACE section has \`\`\`text wrapper
    ✓ No explanatory text inside \`\`\`text blocks
    ✓ Indentation matches original code exactly

21. If you forget to wrap <task_progress>, the system will reject your response

╔═══════════════════════════════════════════════════════════════════
║ CORRECT FORMAT EXAMPLES
╚═══════════════════════════════════════════════════════════════════

✅ Example 1 - Task Progress (CORRECT):
<read_file>
<path>test.ts</path>
\`\`\`text
<task_progress>
- [ ] Phân tích cấu trúc dự án
- [ ] Kiểm tra file hiện tại
- [ ] Thêm hàm mới
- [ ] Xác nhận kết quả
</task_progress>
\`\`\`
</read_file>

✅ Example 2 - Write To File (CORRECT):
<write_to_file>
<path>src/new-file.ts</path>
<content>
\`\`\`text
export function myFunction() {
  console.log("Hello");  // 2 spaces indent
  return true;
}
\`\`\`
</content>
</write_to_file>

✅ Example 3 - Replace In File (CORRECT):
<replace_in_file>
<path>src/helper.ts</path>
<diff>
<<<<<<< SEARCH
\`\`\`text
function oldFunction() {
  return "old";
}
\`\`\`
=======
\`\`\`text
function newFunction() {
  return "new";
}
\`\`\`
>>>>>>> REPLACE
</diff>
</replace_in_file>

╔═══════════════════════════════════════════════════════════════════
║ FINAL REMINDER (CRITICAL - READ TWICE)
╚═══════════════════════════════════════════════════════════════════
1. If you output <task_progress> without wrapping it in \`\`\`text...\`\`\`, 
   the system will FAIL to parse your response and the user will see an error.
   ALWAYS wrap <task_progress> in \`\`\`text code blocks - NO EXCEPTIONS!

2. 🔥 NEVER use language-specific code fence markers:
   ❌ \`\`\`typescript  ❌ \`\`\`python    ❌ \`\`\`javascript
   ❌ \`\`\`java        ❌ \`\`\`cpp       ❌ \`\`\`bash
   ❌ \`\`\`shell       ❌ \`\`\`go        ❌ \`\`\`rust
   ❌ \`\`\`php         ❌ \`\`\`ruby      ❌ \`\`\`swift
   
   ✅ ONLY USE: \`\`\`text (for ALL code, regardless of language)

3. This rule applies to:
   - <content> blocks in <write_to_file>
   - SEARCH sections in <replace_in_file>
   - REPLACE sections in <replace_in_file>
   - <task_progress> blocks
   - ALL other code blocks

4. If you use \`\`\`typescript or any language marker, the parser will FAIL
   and your response will be rejected.`,

  /**
   * Quy tắc ngắn gọn (dùng trong prompt)
   */
  SHORT: `TEXT WRAPPING RULES:
1. ALWAYS wrap <task_progress> in \`\`\`text...\`\`\`
2. ALWAYS wrap code in <content> with \`\`\`text...\`\`\`
3. ALWAYS wrap SEARCH/REPLACE sections with \`\`\`text...\`\`\`
4. NEVER use language-specific markers (\`\`\`typescript, \`\`\`python, etc.)
5. ONLY use \`\`\`text for ALL code blocks
6. Preserve EXACT indentation from original code`,

  /**
   * Quy tắc cho XML tags
   */
  XML_TAGS: `XML TAGS WRAPPING RULES:
1. XML tool tags (<read_file>, <write_to_file>, etc.) should NOT be wrapped
2. Only content INSIDE these tags needs wrapping
3. Structure: <tag><content>\`\`\`text...code...\`\`\`</content></tag>
4. Never wrap the outer XML tags themselves`,

  /**
   * Quy tắc cho indentation
   */
  INDENTATION: `INDENTATION RULES (CRITICAL):
1. Read and preserve EXACT number of spaces or tabs
2. If original uses 2 spaces, keep 2 spaces (not 4, not tabs)
3. Count spaces carefully - mismatched indentation causes SEARCH failures
4. Do NOT apply auto-formatting (Prettier, ESLint, etc.)
5. In <replace_in_file>, SEARCH block MUST match original indentation EXACTLY`,

  /**
   * Quy tắc cho error prevention
   */
  ERROR_PREVENTION: `COMMON ERRORS TO AVOID:
1. ❌ Missing <content> tags in <write_to_file>
2. ❌ Forgetting to wrap <task_progress>
3. ❌ Using \`\`\`typescript instead of \`\`\`text
4. ❌ Mismatched indentation in SEARCH blocks
5. ❌ Mixing content in \`\`\`text blocks
6. ❌ Not closing \`\`\`text blocks properly`,
};

/**
 * Validate text wrapping trong một response
 */
export function validateTextWrapping(response: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for unwrapped task_progress
  const taskProgressRegex = /<task_progress>[\s\S]*?<\/task_progress>/g;
  const taskProgressMatches = response.match(taskProgressRegex) || [];

  for (const match of taskProgressMatches) {
    if (!match.includes("```text")) {
      errors.push("task_progress not wrapped in ```text code blocks");
      suggestions.push("Wrap task_progress in ```text...```");
    }
  }

  // Check for unwrapped content in write_to_file
  const writeToFileRegex = /<write_to_file>[\s\S]*?<\/write_to_file>/g;
  const writeToFileMatches = response.match(writeToFileRegex) || [];

  for (const match of writeToFileMatches) {
    if (!match.includes("<content>")) {
      errors.push("write_to_file missing <content> tags");
      suggestions.push("Add <content> tags inside write_to_file");
    } else {
      const contentMatch = match.match(/<content>([\s\S]*?)<\/content>/);
      if (contentMatch && !contentMatch[1].includes("```text")) {
        errors.push("Content in write_to_file not wrapped in ```text");
        suggestions.push("Wrap code in <content>```text...```</content>");
      }
    }
  }

  // Check for language-specific code fences
  const languageFences = [
    /```typescript/g,
    /```python/g,
    /```javascript/g,
    /```java/g,
    /```cpp/g,
    /```bash/g,
    /```shell/g,
    /```go/g,
    /```rust/g,
    /```php/g,
    /```ruby/g,
    /```swift/g,
    /```json/g,
    /```xml/g,
    /```html/g,
    /```css/g,
  ];

  for (const fence of languageFences) {
    if (fence.test(response)) {
      errors.push(`Found language-specific code fence: ${fence.toString()}`);
      suggestions.push("Replace with ```text");
    }
  }

  // Check for proper text fences
  const textFenceCount = (response.match(/```text/g) || []).length;
  const closingFenceCount =
    (response.match(/```/g) || []).length - textFenceCount;

  if (textFenceCount * 2 !== closingFenceCount) {
    warnings.push("Unbalanced code fences detected");
    suggestions.push("Check that every ```text has a matching ```");
  }

  // Check for mixed content in text blocks
  const textBlockRegex = /```text[\s\S]*?```/g;
  const textBlockMatches = response.match(textBlockRegex) || [];

  for (const block of textBlockMatches) {
    if (block.includes("<thinking>") || block.includes("explanation")) {
      warnings.push(
        "Mixed content in ```text block (contains explanatory text)"
      );
      suggestions.push("Keep only code/task_progress in ```text blocks");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Fix text wrapping issues trong response
 */
export function fixTextWrapping(response: string): string {
  let fixed = response;

  // Fix unwrapped task_progress
  const taskProgressRegex = /(<task_progress>[\s\S]*?<\/task_progress>)/g;
  fixed = fixed.replace(taskProgressRegex, "```text\n$1\n```");

  // Fix missing content tags trong write_to_file
  const writeToFileRegex = /<write_to_file>([\s\S]*?)<\/write_to_file>/g;
  fixed = fixed.replace(writeToFileRegex, (match, content) => {
    if (!content.includes("<content>")) {
      return `<write_to_file><content>\`\`\`text${content}\`\`\`</content></write_to_file>`;
    }
    return match;
  });

  // Fix language-specific code fences
  const languageMap: Record<string, string> = {
    typescript: "text",
    python: "text",
    javascript: "text",
    java: "text",
    cpp: "text",
    bash: "text",
    shell: "text",
    go: "text",
    rust: "text",
    php: "text",
    ruby: "text",
    swift: "text",
    json: "text",
    xml: "text",
    html: "text",
    css: "text",
  };

  for (const [lang, replacement] of Object.entries(languageMap)) {
    const pattern = new RegExp(`\`\`\`${lang}`, "g");
    fixed = fixed.replace(pattern, `\`\`\`${replacement}`);
  }

  // Fix unbalanced fences
  const textFenceCount = (fixed.match(/```text/g) || []).length;
  const totalFenceCount = (fixed.match(/```/g) || []).length;
  const expectedClosingCount = textFenceCount * 2;

  if (totalFenceCount < expectedClosingCount) {
    // Add missing closing fences
    const missingCount = expectedClosingCount - totalFenceCount;
    fixed += "\n```".repeat(missingCount);
  }

  return fixed;
}

/**
 * Extract code từ wrapped blocks
 */
export function extractCodeFromBlocks(response: string): {
  taskProgress: string[];
  writeToFileContents: Array<{ path: string; content: string }>;
  searchReplaceBlocks: Array<{ path: string; diff: string }>;
} {
  const taskProgress: string[] = [];
  const writeToFileContents: Array<{ path: string; content: string }> = [];
  const searchReplaceBlocks: Array<{ path: string; diff: string }> = [];

  // Extract task_progress
  const taskProgressRegex =
    /```text\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g;
  let match;
  while ((match = taskProgressRegex.exec(response)) !== null) {
    taskProgress.push(match[1]);
  }

  // Extract write_to_file
  const writeToFileRegex =
    /<write_to_file>\s*<path>([\s\S]*?)<\/path>\s*<content>\s*```text\s*([\s\S]*?)\s*```\s*<\/content>\s*<\/write_to_file>/g;
  while ((match = writeToFileRegex.exec(response)) !== null) {
    writeToFileContents.push({
      path: match[1].trim(),
      content: match[2].trim(),
    });
  }

  // Extract replace_in_file
  const replaceInFileRegex =
    /<replace_in_file>\s*<path>([\s\S]*?)<\/path>\s*<diff>\s*([\s\S]*?)\s*<\/diff>\s*<\/replace_in_file>/g;
  while ((match = replaceInFileRegex.exec(response)) !== null) {
    searchReplaceBlocks.push({
      path: match[1].trim(),
      diff: match[2].trim(),
    });
  }

  return {
    taskProgress,
    writeToFileContents,
    searchReplaceBlocks,
  };
}
