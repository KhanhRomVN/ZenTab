// src/background/constants/rules/language-rules.ts

/**
 * Language Rules - Quy tắc ngôn ngữ cho AI responses
 */

export const LANGUAGE_RULES = {
  // Main language rule
  VIETNAMESE_REQUIRED: `
CRITICAL LANGUAGE RULE:
- You MUST respond in Vietnamese (Tiếng Việt) for ALL outputs
- All explanations, descriptions, and responses must be in Vietnamese
- Code comments should also be in Vietnamese when possible
- Only use English for:
  * Technical terms that have no Vietnamese equivalent
  * Code snippets, function names, variable names
  * File paths and URLs
  * Error messages from systems/tools
- When showing code examples with comments:
  * Write the comment in Vietnamese
  * Keep the code in its original language (JavaScript, Python, etc.)
- Example of CORRECT format:
  \`\`\`javascript
  // Hàm tính tổng hai số
  function tinhTong(a, b) {
    return a + b;
  }
  \`\`\`
- NEVER respond entirely in English unless explicitly asked
- If user asks in English, still respond in Vietnamese
`,

  // Grammar and style rules
  GRAMMAR_STYLE: `
VIETNAMESE GRAMMAR AND STYLE RULES:
1. Use proper Vietnamese diacritics (dấu)
2. Use "tôi" for first person singular
3. Use "chúng ta" or "chúng tôi" for first person plural when appropriate
4. Use polite language (vui lòng, xin, cảm ơn) when making requests
5. Avoid slang and informal language in technical explanations
6. Use technical terms consistently
7. Format lists clearly with Vietnamese numbering/formatting
`,

  // Technical terminology
  TECHNICAL_TERMS: `
TECHNICAL TERMINOLOGY IN VIETNAMESE:
- API → Giao diện lập trình ứng dụng (API)
- URL → Địa chỉ web (URL)
- HTTP → Giao thức truyền tải siêu văn bản (HTTP)
- JSON → Định dạng trao đổi dữ liệu (JSON)
- Database → Cơ sở dữ liệu
- Function → Hàm
- Variable → Biến
- Array → Mảng
- Object → Đối tượng
- Class → Lớp
- Method → Phương thức
- Property → Thuộc tính
- Parameter → Tham số
- Argument → Đối số
- Return → Trả về
- Error → Lỗi
- Exception → Ngoại lệ
- Loop → Vòng lặp
- Condition → Điều kiện
- String → Chuỗi
- Number → Số
- Boolean → Logic (true/false)
- Null/Undefined → Rỗng/Không xác định
`,

  // Code comment rules
  CODE_COMMENTS: `
CODE COMMENT RULES FOR VIETNAMESE:
1. Write comments in Vietnamese above the code
2. Use single-line comments for simple explanations
3. Use multi-line comments for complex logic
4. Comment format examples:

   // Kiểm tra nếu người dùng đã đăng nhập
   if (user.isLoggedIn) { ... }

   /*
    * Hàm này xử lý việc tính toán tổng số tiền
    * Bao gồm thuế và phí dịch vụ
    */
   function tinhTongTien(items) { ... }

5. For TODO comments:
   // TODO: Cần thêm validation cho email
   // FIXME: Sửa lỗi overflow khi số quá lớn
   // OPTIMIZE: Có thể cache kết quả để tăng performance
`,

  // Error message format
  ERROR_MESSAGES: `
VIETNAMESE ERROR MESSAGE FORMAT:
1. Start with "Lỗi:" for errors
2. Use "Cảnh báo:" for warnings
3. Use "Thông tin:" for informational messages
4. Include context and suggested solutions
5. Example formats:

   Lỗi: Không thể kết nối đến máy chủ.
   Nguyên nhân: Mạng không ổn định hoặc máy chủ đang bảo trì.
   Giải pháp: Kiểm tra kết nối mạng và thử lại sau.

   Cảnh báo: File đã tồn tại và sẽ bị ghi đè.
   Hành động: File cũ sẽ được sao lưu tự động.

   Thông tin: Đã xử lý thành công 15 file.
   Chi tiết: Tổng thời gian xử lý: 2.5 giây.
`,
} as const;

/**
 * Get language rule by type
 */
export function getLanguageRule(ruleType: keyof typeof LANGUAGE_RULES): string {
  return LANGUAGE_RULES[ruleType];
}

/**
 * Get all language rules combined
 */
export function getAllLanguageRules(): string {
  return Object.values(LANGUAGE_RULES).join("\n\n");
}

/**
 * Check if text follows language rules
 */
export function checkLanguageCompliance(text: string): {
  isCompliant: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for excessive English (more than 30% English words in non-code sections)
  const lines = text.split("\n");
  let englishWordCount = 0;
  let totalWordCount = 0;

  for (const line of lines) {
    // Skip code blocks and XML tags
    if (
      line.trim().startsWith("```") ||
      line.includes("<") ||
      line.includes(">")
    ) {
      continue;
    }

    const words = line.split(/\s+/).filter((word) => word.length > 0);
    totalWordCount += words.length;

    // Simple English word detection (could be improved)
    const englishWords = words.filter(
      (word) => /^[a-zA-Z]+$/.test(word) && word.length > 2
    );
    englishWordCount += englishWords.length;
  }

  const englishPercentage =
    totalWordCount > 0 ? (englishWordCount / totalWordCount) * 100 : 0;

  if (englishPercentage > 30) {
    issues.push(`Too much English content (${englishPercentage.toFixed(1)}%)`);
  }

  // Check for missing Vietnamese diacritics in common words
  const commonWords = [
    { without: "toi", with: "tôi" },
    { without: "ban", with: "bạn" },
    { without: "day", with: "đây" },
    { without: "do", with: "đó" },
    { without: "da", with: "đã" },
    { without: "duoc", with: "được" },
  ];

  for (const word of commonWords) {
    if (
      text.toLowerCase().includes(word.without) &&
      !text.includes(word.with)
    ) {
      issues.push(
        `Missing diacritics for "${word.without}" (should be "${word.with}")`
      );
    }
  }

  return {
    isCompliant: issues.length === 0,
    issues,
  };
}
