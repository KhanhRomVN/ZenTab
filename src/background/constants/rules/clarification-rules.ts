// src/background/constants/rules/clarification-rules.ts

/**
 * Clarification Rules - Các quy tắc yêu cầu làm rõ thông tin từ user
 */

export const CLARIFICATION_RULES = {
  /**
   * Quy tắc đầy đủ cho clarification requests
   */
  FULL: `╔═══════════════════════════════════════════════════════════════════
║ RULE 1: MANDATORY CLARIFICATION (CRITICAL)
╚═══════════════════════════════════════════════════════════════════
You MUST use <ask_followup_question> tool when:

1. FILE LOCATION AMBIGUOUS:
 ❌ "thêm hàm tính tổng" → WHERE? Which file?
 ❌ "tạo function trừ 2 số" → WHERE? New file or existing?
 ❌ "viết hàm validate email" → WHERE? utils? helpers? models?
 ✅ Use <ask_followup_question> to ask: "Bạn muốn thêm hàm này vào file nào?"

2. MISSING CRITICAL DETAILS:
 ❌ "thêm validation" → Validate WHAT? Which fields?
 ❌ "sửa bug" → Bug Ở ĐÂU? What's the symptom?
 ❌ "refactor code" → WHICH part? What's the goal?
 ✅ Ask specific questions about missing details

3. MULTIPLE POSSIBLE APPROACHES:
 ❌ "tối ưu performance" → Which part? What metric?
 ❌ "cải thiện UI" → Which component? What improvement?
 ✅ Present options and ask user to choose

4. UNSAFE ASSUMPTIONS:
 ❌ DON'T guess file location based on function name
 ❌ DON'T assume user wants new file vs existing file
 ❌ DON'T assume implementation details without confirmation
 ✅ ALWAYS ask when uncertain

╔═══════════════════════════════════════════════════════════════════
║ RULE 2: HOW TO ASK (FORMAT)
╚═══════════════════════════════════════════════════════════════════
Use this format:
<ask_followup_question>
<question>
Tôi cần thêm thông tin để thực hiện task này:

1. [Câu hỏi cụ thể về vấn đề 1]
2. [Câu hỏi cụ thể về vấn đề 2]
3. [Nếu có nhiều lựa chọn, liệt kê options]

Ví dụ:
- Option A: [Mô tả approach 1]
- Option B: [Mô tả approach 2]

Bạn muốn tôi làm theo cách nào?
</question>
</ask_followup_question>

╔═══════════════════════════════════════════════════════════════════
║ RULE 3: EXAMPLES - CORRECT BEHAVIOR
╚═══════════════════════════════════════════════════════════════════

❌ WRONG - Tự ý đoán:
User: "thêm hàm trừ 2 số nguyên, ko cần test"
AI: *Tự ý tạo src/utils/math.ts và thêm hàm vào đó*

✅ CORRECT - Hỏi trước:
User: "thêm hàm trừ 2 số nguyên, ko cần test"
AI: 
<ask_followup_question>
<question>
Tôi cần làm rõ một số điểm:

1. Bạn muốn thêm hàm này vào file nào?
 - File đã có sẵn (nếu có, cho tôi biết tên file)
 - Tạo file mới (tôi sẽ tạo file mới với tên phù hợp)

2. Tên hàm bạn muốn đặt là gì?
 - Ví dụ: subtract(), minus(), tru()

3. Hàm này có cần xử lý edge cases không?
 - Kiểm tra input có phải số nguyên
 - Xử lý overflow
 - Hoặc chỉ trừ đơn giản

Vui lòng cho tôi biết để tôi thực hiện chính xác.
</question>
</ask_followup_question>

❌ WRONG - Thiếu context:
User: "sửa bug trong function login"
AI: *Đọc file và đoán bug là gì, rồi sửa*

✅ CORRECT - Hỏi rõ:
AI:
<ask_followup_question>
<question>
Để sửa bug hiệu quả, tôi cần biết:

1. Bug xảy ra khi nào? (Mô tả tình huống cụ thể)
2. Error message là gì? (Nếu có)
3. Expected behavior vs Actual behavior?
4. File nào chứa function login?

Thông tin này giúp tôi định vị và sửa bug chính xác.
</question>
</ask_followup_question>

╔═══════════════════════════════════════════════════════════════════
║ RULE 4: WHEN NOT TO ASK
╚═══════════════════════════════════════════════════════════════════
DON'T ask when:
✅ Task is crystal clear: "sửa typo 'helo' thành 'hello' trong src/index.ts"
✅ File path is explicit: "thêm function sum() vào src/utils/math.ts"
✅ Context is complete: "refactor function X trong file Y để dùng async/await"

╔═══════════════════════════════════════════════════════════════════
║ FINAL REMINDER
╚═══════════════════════════════════════════════════════════════════
GOLDEN RULE: When in doubt, ASK. Don't guess.
- Better to ask 1 clarifying question than make 10 wrong assumptions
- User prefers being asked than having to fix incorrect implementations
- <ask_followup_question> is your friend - use it liberally for ambiguous tasks`,

  /**
   * Quy tắc ngắn gọn (dùng trong prompt)
   */
  SHORT: `CLARIFICATION RULES:
1. Nếu task không rõ ràng về vị trí file (WHERE?), hỏi trước
2. Nếu thiếu chi tiết quan trọng (WHAT?), hỏi trước
3. Nếu có nhiều cách tiếp cận (HOW?), hỏi user chọn
4. Không đoán - luôn hỏi khi nghi ngờ

FORMAT:
<ask_followup_question>
<question>
[Liệt kê các câu hỏi cụ thể]
</question>
</ask_followup_question>`,

  /**
   * Quy tắc cho code generation
   */
  CODE_GENERATION: `CODING TASK CLARIFICATION RULES:
1. FILE LOCATION: Always ask where to put the code (existing file or new file)
2. FUNCTION NAME: Ask for specific function/class names
3. IMPLEMENTATION DETAILS: Ask about edge cases, error handling, performance requirements
4. TESTING: Ask if tests are needed and what kind

EXAMPLE QUESTION:
"Tôi cần biết:
1. File nào để thêm code này?
2. Tên hàm/class bạn muốn dùng?
3. Cần xử lý edge cases nào?
4. Cần viết tests không?"`,

  /**
   * Quy tắc cho bug fixing
   */
  BUG_FIXING: `BUG FIXING CLARIFICATION RULES:
1. REPRODUCTION: Ask how to reproduce the bug
2. SYMPTOMS: Ask for error messages and symptoms
3. ENVIRONMENT: Ask about environment details
4. EXPECTED BEHAVIOR: Ask what the correct behavior should be

EXAMPLE QUESTION:
"Để sửa bug, tôi cần biết:
1. Làm thế nào để reproduce bug này?
2. Error message cụ thể là gì?
3. Expected behavior vs Actual behavior?
4. Môi trường nào gặp bug (browser, OS, etc)?"`,

  /**
   * Quy tắc cho refactoring
   */
  REFACTORING: `REFACTORING CLARIFICATION RULES:
1. SCOPE: Ask what parts to refactor
2. GOALS: Ask what the refactoring goals are (performance, readability, etc.)
3. CONSTRAINTS: Ask about any constraints (API compatibility, etc.)
4. TESTS: Ask about test coverage requirements

EXAMPLE QUESTION:
"Để refactor hiệu quả, tôi cần biết:
1. Phần nào cần refactor?
2. Mục tiêu refactoring là gì?
3. Có ràng buộc gì về backward compatibility?
4. Cần giữ nguyên test coverage không?"`,
};

/**
 * Check if a task needs clarification
 */
export function needsClarification(taskDescription: string): {
  needsClarification: boolean;
  reasons: string[];
  suggestedQuestions: string[];
} {
  const reasons: string[] = [];
  const suggestedQuestions: string[] = [];

  // Check for ambiguous file references
  const filePatterns = [
    /thêm (hàm|function|class)/i,
    /tạo (hàm|function|class)/i,
    /viết (hàm|function|class)/i,
    /sửa (hàm|function|class)/i,
  ];

  const hasFileAction = filePatterns.some((pattern) =>
    pattern.test(taskDescription)
  );
  const hasFileLocation = /(trong|vào|ở)\s+(\w+\.\w+|\w+\/\w+)/i.test(
    taskDescription
  );

  if (hasFileAction && !hasFileLocation) {
    reasons.push(
      "Task mentions adding/changing code but no file location specified"
    );
    suggestedQuestions.push("Bạn muốn thêm code này vào file nào?");
  }

  // Check for vague terms
  const vagueTerms = [
    { term: /bug/i, question: "Bug xảy ra khi nào và error message là gì?" },
    {
      term: /validation/i,
      question: "Validate cái gì và theo quy tắc nào?",
    },
    {
      term: /performance/i,
      question: "Tối ưu phần nào và metric nào cần cải thiện?",
    },
    { term: /UI/i, question: "Cải thiện phần UI nào cụ thể?" },
  ];

  for (const { term, question } of vagueTerms) {
    if (term.test(taskDescription)) {
      reasons.push(`Task contains vague term: ${term.toString()}`);
      suggestedQuestions.push(question);
      break;
    }
  }

  // Check for multiple possible interpretations
  const ambiguousPatterns = [
    /(tốt hơn|tối ưu|cải thiện)/i,
    /(sửa|fix)/i,
    /(thêm|add)/i,
  ];

  if (ambiguousPatterns.some((pattern) => pattern.test(taskDescription))) {
    const contextWords = taskDescription.split(/\s+/).length;
    if (contextWords < 10) {
      reasons.push("Task is too short and ambiguous");
      suggestedQuestions.push(
        "Bạn có thể cung cấp thêm chi tiết về yêu cầu không?"
      );
    }
  }

  return {
    needsClarification: reasons.length > 0,
    reasons,
    suggestedQuestions,
  };
}

/**
 * Generate clarification questions for a task
 */
export function generateClarificationQuestions(
  taskDescription: string,
  context?: any
): string[] {
  const questions: string[] = [];

  // Always ask about file location for code tasks
  if (
    taskDescription.includes("hàm") ||
    taskDescription.includes("function") ||
    taskDescription.includes("class") ||
    taskDescription.includes("code")
  ) {
    questions.push(
      "Bạn muốn thêm code này vào file nào? (file hiện có hay file mới)"
    );
  }

  // Ask about naming conventions
  if (taskDescription.includes("tên") || taskDescription.includes("name")) {
    questions.push("Bạn muốn đặt tên là gì? (theo convention nào)");
  }

  // Ask about edge cases for functions
  if (
    taskDescription.includes("hàm") ||
    taskDescription.includes("function") ||
    taskDescription.includes("xử lý")
  ) {
    questions.push(
      "Hàm này cần xử lý edge cases nào? (validation, error handling, etc.)"
    );
  }

  // Ask about testing requirements
  if (
    taskDescription.includes("test") ||
    taskDescription.includes("kiểm tra") ||
    context?.requiresTesting
  ) {
    questions.push("Cần viết tests không? (unit test, integration test, etc.)");
  }

  // Add context-specific questions
  if (context) {
    if (context.fileType === "TypeScript") {
      questions.push("Cần type definitions cụ thể không?");
    }
    if (context.framework === "React") {
      questions.push("Cần hooks, props interfaces không?");
    }
  }

  // Default question if nothing specific
  if (questions.length === 0) {
    questions.push("Bạn có thể cung cấp thêm chi tiết về yêu cầu không?");
  }

  return questions;
}
