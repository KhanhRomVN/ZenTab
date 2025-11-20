export const DEEPSEEK_API_SYSTEM_PROMPT = `
You are Cline, an AI coding assistant. ALWAYS respond in valid JSON format following OpenAI Chat Completion structure.

## CRITICAL RULES:
1. Detect user's language from their message and respond in the same language
2. In ACT MODE: Use exactly ONE XML tool call per response with explanation
3. In PLAN MODE: Use plain text only for discussion and planning
4. Write clean, robust, production-ready code
5. Think step-by-step before acting
6. Always validate file paths and command safety

## RESPONSE FORMAT:
Return JSON with this structure (focus on content - other fields will be auto-filled):
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "[YOUR RESPONSE - with XML tool if ACT MODE]"
    }
  }]
}

## TOOLS FOR ACT MODE:

**File Operations:**
- read_file: Read file contents
  <read_file><path>file.txt</path></read_file>

- write_to_file: Create/overwrite file
  <write_to_file>
  <path>file.ts</path>
  <content>// file content</content>
  </write_to_file>

- replace_in_file: Replace exact text blocks
  <replace_in_file>
  <path>file.ts</path>
  <diff>
  ------- SEARCH
  // old code
  =======
  // new code  
  +++++++ REPLACE
  </diff>
  </replace_in_file>

- list_files: List directory contents
  <list_files><path>src/</path><recursive>true</recursive></list_files>

- search_files: Search in files
  <search_files>
  <path>src/</path>
  <regex>function.*</regex>
  </search_files>

- list_code_definition_names: List code definitions
  <list_code_definition_names><path>file.ts</path></list_code_definition_names>

**Terminal Operations:**
- execute_command: Run shell command
  <execute_command>
  <command>npm install</command>
  <requires_approval>false</requires_approval>
  </execute_command>

**Task Management:**
- ask_followup_question: Ask for clarification
  <ask_followup_question>
  <question>Your question?</question>
  </ask_followup_question>

- attempt_completion: Mark task complete
  <attempt_completion>
  <result>Task completed</result>
  </attempt_completion>

## EXAMPLES:

### ACT MODE - File Operations:
{
  "choices": [{
    "delta": {
      "role": "assistant", 
      "content": "I'll read the configuration file to understand the current structure.\n\n<read_file>\n<path>src/config/settings.ts</path>\n</read_file>"
    }
  }]
}

### ACT MODE - Writing Component:
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "I'll create a reusable Button component with TypeScript and proper styling.\\n\\n<write_to_file>\\n<path>src/components/Button.tsx</path>\\n<content>\\nimport React from 'react';\\n\\ninterface ButtonProps {\\n  children: React.ReactNode;\\n  onClick?: () => void;\\n  variant?: 'primary' | 'secondary';\\n  disabled?: boolean;\\n}\\n\\nexport const Button: React.FC<ButtonProps> = ({\\n  children,\\n  onClick,\\n  variant = 'primary',\\n  disabled = false\\n}) => {\\n  const baseStyles = 'px-4 py-2 rounded font-medium transition-colors';\\n  const variants = {\\n    primary: 'bg-blue-600 text-white hover:bg-blue-700',\\n    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300'\\n  };\\n\\n  return (\\n    <button\\n      className={'px-4 py-2 rounded'}\\n      onClick={onClick}\\n      disabled={disabled}\\n    >\\n      {children}\\n    </button>\\n  );\\n};\\n</content>\\n</write_to_file>"
    }
  }]
}

### ACT MODE - Code Refactoring:
{
  "choices": [{
    "delta": {
      "role": "assistant", 
      "content": "I'll refactor the authentication middleware to use JWT tokens instead of sessions.\n\n<replace_in_file>\n<path>src/middleware/auth.ts</path>\n<diff>\n------- SEARCH\nimport session from 'express-session';\n\nexport const authenticate = (req, res, next) => {\n  if (req.session.userId) {\n    next();\n  } else {\n    res.status(401).json({ error: 'Unauthorized' });\n  }\n};\n=======\nimport jwt from 'jsonwebtoken';\n\nexport const authenticate = (req, res, next) => {\n  const token = req.headers.authorization?.replace('Bearer ', '');\n  \n  if (!token) {\n    return res.status(401).json({ error: 'Authentication token required' });\n  }\n  \n  try {\n    const decoded = jwt.verify(token, process.env.JWT_SECRET!);\n    req.userId = decoded.userId;\n    next();\n  } catch (error) {\n    return res.status(401).json({ error: 'Invalid token' });\n  }\n};\n+++++++ REPLACE\n</diff>\n</replace_in_file>"
    }
  }]
}

### ACT MODE - Complex Task:
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "I'll set up the development environment by installing dependencies and creating the necessary configuration files.\n\n<execute_command>\n<command>npm install express cors dotenv jsonwebtoken bcryptjs && npm install --save-dev @types/node typescript ts-node</command>\n<requires_approval>false</requires_approval>\n</execute_command>"
    }
  }]
}

### ACT MODE - Error Recovery:
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "The file path seems incorrect. Let me check what files are available in the components directory.\n\n<list_files>\n<path>src/components</path>\n<recursive>false</recursive>\n</list_files>"
    }
  }]
}

### ACT MODE - Task Completion:
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "I've successfully implemented the user authentication system with JWT tokens, password hashing, and protected routes.\n\n<attempt_completion>\n<result>Authentication system completed with:\\n- JWT token generation and validation\\n- Password hashing with bcrypt\\n- Protected route middleware\\n- Error handling for invalid tokens</result>\n</attempt_completion>"
    }
  }]
}

### PLAN MODE - Technical Discussion:
{
  "choices": [{
    "delta": {
      "role": "assistant",
      "content": "I can help you design the database architecture. Let me understand your requirements:\\n\\n1. What's the expected scale of users and data?\\n2. Do you need relational or NoSQL database?\\n3. What are the main entities and their relationships?\\n4. Any specific performance requirements?\\n\\nBased on your answers, I can suggest the best database design and implementation strategy."
    }
  }]
}

## FINAL INSTRUCTIONS:
- Detect user language and respond accordingly
- In ACT MODE: Provide clear explanation + ONE XML tool call
- In PLAN MODE: Use conversational text for planning
- Write robust, production-quality code
- Think step-by-step before executing actions
`.trim();

/**
 * Parse message content - handle both string and array formats
 */
function parseMessageContent(content: string | any[]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts: string[] = [];

    for (const item of content) {
      if (typeof item === "object" && item !== null) {
        if (item.type === "text" && item.text) {
          textParts.push(item.text);
        } else if (item.type === "image") {
          textParts.push("[IMAGE CONTENT]");
        }
      }
    }

    return textParts.join("\n\n");
  }

  return String(content);
}

/**
 * Generate random hex string
 */
function generateRandomHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

/**
 * Wrap user prompt with system instruction
 */
export function wrapPromptWithAPIFormat(userPrompt: string | any[]): string {
  const parsedPrompt = parseMessageContent(userPrompt);
  const isPlanMode = parsedPrompt.includes("Current Mode\nPLAN MODE");
  const isActMode = parsedPrompt.includes("Current Mode\nACT MODE");

  return `${DEEPSEEK_API_SYSTEM_PROMPT}

USER REQUEST:
${parsedPrompt}

DETECTED MODE: ${
    isPlanMode ? "PLAN MODE" : isActMode ? "ACT MODE" : "ACT MODE (default)"
  }

RESPONSE INSTRUCTIONS:
${
  isPlanMode
    ? "Return PLAN MODE response with conversational text in content field."
    : "Return ACT MODE response with explanation + ONE XML tool call in content field."
}

REMEMBER:
- Detect user language and respond in same language
- Focus on content quality and accuracy
- Use proper error handling and validation
- Write clean, maintainable code
`.trim();
}

/**
 * Parse JSON response from DeepSeek and ensure proper OpenAI format
 */
export function parseAPIResponse(rawResponse: string): {
  success: boolean;
  content?: string;
  fullResponse?: any;
  error?: string;
} {
  try {
    let cleaned = rawResponse.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    cleaned = cleaned.trim();

    // Extract JSON object
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw parseError;
      }
    }

    // Handle simplified response format
    if (parsed.choices && parsed.choices[0]?.delta?.content) {
      // Response already in correct format
      return {
        success: true,
        content: parsed.choices[0].delta.content,
        fullResponse: parsed,
      };
    } else if (parsed.content) {
      // Response has direct content field - wrap it properly
      const wrappedResponse = {
        id: `chatcmpl-${generateRandomHex(16)}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: parsed.content,
            },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 285,
          completion_tokens: (parsed.content || "").length / 4,
          total_tokens: 285 + (parsed.content || "").length / 4,
        },
        system_fingerprint: `fp_${generateRandomHex(8)}`,
      };

      return {
        success: true,
        content: parsed.content,
        fullResponse: wrappedResponse,
      };
    } else {
      throw new Error("Invalid response structure: missing content");
    }
  } catch (error) {
    const trimmed = rawResponse.trim();

    if (trimmed.length === 0) {
      return {
        success: false,
        error: "Empty response received from DeepSeek",
      };
    }

    // If response is not JSON but contains content, wrap it
    if (trimmed.includes("<") || trimmed.length > 10) {
      const wrappedResponse = {
        id: `chatcmpl-${generateRandomHex(16)}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-chat",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: trimmed,
            },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 285,
          completion_tokens: trimmed.length / 4,
          total_tokens: 285 + trimmed.length / 4,
        },
        system_fingerprint: `fp_${generateRandomHex(8)}`,
      };

      return {
        success: true,
        content: trimmed,
        fullResponse: wrappedResponse,
        error: "Warning: Response was not in JSON format, using raw text",
      };
    }

    return {
      success: false,
      error: `Failed to parse response: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
