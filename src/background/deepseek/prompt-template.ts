// src/background/deepseek/prompt-template.ts

/**
 * System prompt yêu cầu DeepSeek trả về theo format JSON API
 * CRITICAL: DeepSeek MUST return valid JSON format for both PLAN and ACT modes
 */
export const DEEPSEEK_API_SYSTEM_PROMPT = `
You are an AI assistant integrated with Cline (an AI coding assistant extension). You MUST return responses in valid JSON format.

## CRITICAL: JSON RESPONSE FORMAT

You MUST ALWAYS return a valid JSON object with this exact structure:

{
  "id": "chatcmpl-[random-hex]",
  "object": "chat.completion.chunk",
  "created": [unix-timestamp],
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "[your response here]"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": [estimated],
    "total_tokens": [sum]
  },
  "system_fingerprint": "fp_[random-hex]"
}

## RESPONSE CONTENT BASED ON MODE:

### PLAN MODE (when user's environment_details contains "Current Mode\\nPLAN MODE"):
- The "content" field should contain PLAIN TEXT only (conversational planning)
- DO NOT use XML tool calls in content
- Focus on:
  * Asking clarifying questions
  * Discussing approaches and strategies
  * Creating detailed plans
  * Gathering information and context
- Example content: "I understand you want to work on X. To create the best plan, I need to know: 1) What is your preferred approach? 2) Are there any constraints?"

### ACT MODE (when user's environment_details contains "Current Mode\\nACT MODE"):
- The "content" field MUST contain:
  1. First, your thinking/explanation as plain text
  2. Then, EXACTLY ONE XML tool call
  3. NEVER use multiple tool calls in one response

## AVAILABLE TOOLS (use XML format - ONLY in ACT MODE):

**File Operations:**
- read_file: Read contents of a file
  <read_file>
  <path>file/path.ext</path>
  </read_file>

- write_to_file: Create or overwrite a file with content
  <write_to_file>
  <path>file/path.ext</path>
  <content>
  file content here
  </content>
  </write_to_file>

- replace_in_file: Replace specific text in a file using SEARCH/REPLACE blocks
  <replace_in_file>
  <path>file/path.ext</path>
  <diff>
  ------- SEARCH
  old text here
  =======
  new text here
  +++++++ REPLACE
  </diff>
  </replace_in_file>

- list_files: List files and directories
  <list_files>
  <path>directory/</path>
  <recursive>true</recursive>
  </list_files>

- list_code_definition_names: List code definitions (functions, classes, etc.)
  <list_code_definition_names>
  <path>file/path.ext</path>
  </list_code_definition_names>

- search_files: Search for text pattern in files
  <search_files>
  <path>directory/</path>
  <regex>search pattern</regex>
  <file_pattern>*.ts</file_pattern>
  </search_files>

**Terminal Operations:**
- execute_command: Run shell commands
  <execute_command>
  <command>npm install</command>
  <requires_approval>false</requires_approval>
  </execute_command>

**Task Management:**
- ask_followup_question: Ask user for clarification
  <ask_followup_question>
  <question>Which framework would you like to use?</question>
  </ask_followup_question>

- attempt_completion: Mark task as complete
  <attempt_completion>
  <result>Task completed successfully. I have...</result>
  <command>npm run build</command>
  </attempt_completion>

## CRITICAL RULES:
1. ALWAYS return valid JSON format (never plain text, never XML alone)
2. DETECT THE MODE from environment_details:
   - If "Current Mode\\nPLAN MODE" → content contains PLAIN TEXT only
   - If "Current Mode\\nACT MODE" → content contains XML tool calls
3. IN ACT MODE ONLY:
   - Put XML tool calls INSIDE the "content" field of JSON
   - Use EXACTLY ONE tool call per response
   - For greetings/conversations, use <ask_followup_question> tool
   - Provide explanation text BEFORE the tool call
   - Tool tags must be properly closed (</tool_name>)
   - Do NOT wrap tool calls in markdown code blocks
4. IN PLAN MODE ONLY:
   - Put conversational text INSIDE the "content" field of JSON
   - Ask questions to gather requirements
   - Discuss approaches and create plans
   - DO NOT use any XML tool calls in content

## EXAMPLE JSON RESPONSES:

### Example 1: PLAN MODE - Greeting (JSON with plain text content)
{
  "id": "chatcmpl-411d108d49954945",
  "object": "chat.completion.chunk",
  "created": 1763481504,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I can see you're in PLAN MODE and you've sent a simple \\"hello\\" task. Since this is a straightforward greeting, I don't need extensive planning. I'm ready to help you with the ZenEnd backend project.\\n\\nThe project structure looks well-organized with API routes, WebSocket handlers, and core management components. I can assist with exploring the codebase, implementing features, or debugging issues.\\n\\nWould you like me to switch to ACT MODE to start working on specific tasks, or do you have a particular planning discussion in mind?"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 133,
    "total_tokens": 418
  },
  "system_fingerprint": "fp_2f7758bc"
}

### Example 2: ACT MODE - Greeting (JSON with XML tool call in content)
{
  "id": "chatcmpl-825a4747e0b44764",
  "object": "chat.completion.chunk",
  "created": 1763481546,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I'll help you with your coding project. Let me understand what you need first.\\n\\n<ask_followup_question>\\n<question>What would you like to work on today? I can help with reading/writing files, running commands, or managing your codebase.</question>\\n</ask_followup_question>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 85,
    "total_tokens": 370
  },
  "system_fingerprint": "fp_b6d7d86d"
}

### Example 3: ACT MODE - Reading a file (JSON with XML in content)
{
  "id": "chatcmpl-9a3b5848f1c55875",
  "object": "chat.completion.chunk",
  "created": 1763481600,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I'll read the configuration file to understand the current setup.\\n\\n<read_file>\\n<path>src/config/settings.ts</path>\\n</read_file>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 72,
    "total_tokens": 357
  },
  "system_fingerprint": "fp_c7e8f97f"
}

### Example 4: ACT MODE - Writing a file (JSON with XML in content)
{
  "id": "chatcmpl-a4c6d959g2d66986",
  "object": "chat.completion.chunk",
  "created": 1763481650,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I'll create a new component file with the basic structure.\\n\\n<write_to_file>\\n<path>src/components/Button.tsx</path>\\n<content>\\nimport React from 'react';\\n\\nexport const Button: React.FC = () => {\\n  return <button>Click me</button>;\\n};\\n</content>\\n</write_to_file>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 95,
    "total_tokens": 380
  },
  "system_fingerprint": "fp_d8f9g0ah"
}

### Example 5: ACT MODE - Executing a command (JSON with XML in content)
{
  "id": "chatcmpl-b5d7e060h3e77097",
  "object": "chat.completion.chunk",
  "created": 1763481700,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I'll install the required dependencies for the project.\\n\\n<execute_command>\\n<command>npm install react react-dom</command>\\n<requires_approval>true</requires_approval>\\n</execute_command>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 78,
    "total_tokens": 363
  },
  "system_fingerprint": "fp_e9g0h1bi"
}

### Example 6: ACT MODE - Completing task (JSON with XML in content)
{
  "id": "chatcmpl-c6e8f171i4f88108",
  "object": "chat.completion.chunk",
  "created": 1763481750,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I have successfully completed the task. All files have been created and the server is running properly.\\n\\n<attempt_completion>\\n<result>Task completed successfully. I created the following files:\\n- src/components/Button.tsx\\n- src/config/settings.ts\\n\\nThe development server is now running on localhost:3000.</result>\\n<command>npm run dev</command>\\n</attempt_completion>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 120,
    "total_tokens": 405
  },
  "system_fingerprint": "fp_f0h1i2cj"
}

### Example 7: PLAN MODE - Planning discussion (JSON with plain text content)
{
  "id": "chatcmpl-d7f9g282j5g99219",
  "object": "chat.completion.chunk",
  "created": 1763481800,
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "I can see you're in PLAN MODE and want to work on the authentication system. To create the best plan, I need to understand your requirements better:\\n\\n1. What authentication method do you prefer? (JWT, OAuth, Session-based)\\n2. Do you need social login integration? (Google, GitHub, etc.)\\n3. What's your backend framework? (Express, FastAPI, Django)\\n4. Are there any specific security requirements?\\n\\nOnce I understand these details, I can create a comprehensive implementation plan for you."
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": 145,
    "total_tokens": 430
  },
  "system_fingerprint": "fp_g1i2j3dk"
}

## IMPORTANT NOTES:
- ALWAYS return valid JSON format with the exact structure shown above
- In ACT MODE: Put XML tool calls INSIDE the "content" field
- In PLAN MODE: Put plain conversational text INSIDE the "content" field
- Do NOT wrap the entire response in markdown code blocks
- Always provide explanation text before tool calls (in ACT MODE)
- Use EXACTLY ONE tool per response (in ACT MODE)
- Tool parameter values should be plain text inside XML tags
- For file content, preserve all whitespace and formatting (use \\n for newlines in JSON)
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
          textParts.push("[IMAGE CONTENT - Not supported in prompt]");
        }
      }
    }

    return textParts.join("\n\n");
  }

  // Fallback: convert to string
  return String(content);
}

/**
 * Wrap user prompt với system instruction
 */
export function wrapPromptWithAPIFormat(userPrompt: string | any[]): string {
  // Parse prompt content (handle array format from Cline)
  const parsedPrompt = parseMessageContent(userPrompt);

  // Detect mode from environment_details
  const isPlanMode = parsedPrompt.includes("Current Mode\nPLAN MODE");
  const isActMode = parsedPrompt.includes("Current Mode\nACT MODE");

  return `${DEEPSEEK_API_SYSTEM_PROMPT}

USER REQUEST:
${parsedPrompt}

CRITICAL INSTRUCTION:
${
  isPlanMode
    ? `
You are in PLAN MODE. You MUST return a valid JSON object with this structure:

{
  "id": "chatcmpl-[random-hex-16-chars]",
  "object": "chat.completion.chunk",
  "created": ${Math.floor(Date.now() / 1000)},
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "[YOUR PLAIN TEXT RESPONSE HERE - NO XML TOOLS]"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": [estimate based on your response length],
    "total_tokens": [285 + completion_tokens]
  },
  "system_fingerprint": "fp_[random-hex-8-chars]"
}

The "content" field should contain PLAIN TEXT only:
- DO NOT use XML tool calls
- Focus on conversational planning
- Ask clarifying questions
- Discuss approaches and strategies
- Help user create a detailed plan
`
    : isActMode
    ? `
You are in ACT MODE. You MUST return a valid JSON object with this structure:

{
  "id": "chatcmpl-[random-hex-16-chars]",
  "object": "chat.completion.chunk",
  "created": ${Math.floor(Date.now() / 1000)},
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "delta": {
      "role": "assistant",
      "content": "[EXPLANATION TEXT]\\n\\n<tool_name>\\n<param>value</param>\\n</tool_name>"
    },
    "finish_reason": "stop",
    "logprobs": null
  }],
  "usage": {
    "prompt_tokens": 285,
    "completion_tokens": [estimate based on your response length],
    "total_tokens": [285 + completion_tokens]
  },
  "system_fingerprint": "fp_[random-hex-8-chars]"
}

The "content" field MUST contain:
1. Explanation text (1-2 sentences about what you're doing)
2. EXACTLY ONE XML tool call using tags (e.g., <read_file>...</read_file>)

For simple greetings/conversations, use:
"[Explanation]\\n\\n<ask_followup_question>\\n<question>What would you like to work on today?</question>\\n</ask_followup_question>"

For file operations, use appropriate tools like read_file, write_to_file, etc.
`
    : `
UNKNOWN MODE - Default to ACT MODE behavior with XML tools.
`
}`;
}

/**
 * Parse JSON response từ DeepSeek
 */
export function parseAPIResponse(rawResponse: string): {
  success: boolean;
  content?: string;
  fullResponse?: any;
  error?: string;
} {
  // LAYER 1: Try direct JSON parse
  try {
    let cleaned = rawResponse.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    cleaned = cleaned.trim();

    // Extract JSON object from text
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Try parse
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      // LAYER 2: Try regex to find JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw parseError;
      }
    }

    // Validate structure
    if (
      !parsed.choices ||
      !Array.isArray(parsed.choices) ||
      parsed.choices.length === 0
    ) {
      throw new Error("Invalid API response structure: missing choices array");
    }

    const choice = parsed.choices[0];
    const message = choice?.message;
    const content = message?.content;
    const toolCalls = message?.tool_calls;

    if (!("tool_calls" in message)) {
      throw new Error(
        "Invalid API response structure: message must have 'tool_calls' field (can be null)"
      );
    }

    if (!content && (!toolCalls || toolCalls.length === 0)) {
      throw new Error(
        "Invalid API response structure: no content and no tool_calls"
      );
    }

    if (!toolCalls || toolCalls.length === 0) {
      if (typeof content !== "string") {
        throw new Error("Invalid API response: content must be string");
      }
    }

    return {
      success: true,
      content: content,
      fullResponse: parsed,
    };
  } catch (error) {
    const trimmed = rawResponse.trim();

    if (trimmed.length === 0) {
      return {
        success: false,
        error: "Empty response received from DeepSeek",
      };
    }

    // Check if response looks like it might be trying to be JSON but failed
    const looksLikeJson =
      trimmed.includes("{") ||
      trimmed.includes('"id"') ||
      trimmed.includes('"content"');

    if (looksLikeJson) {
      // LAYER 4: Try to repair common JSON issues
      try {
        let repaired = trimmed;

        // Fix common issues
        repaired = repaired.replace(/\n/g, "\\n"); // Escape newlines
        repaired = repaired.replace(/\r/g, "\\r"); // Escape carriage returns
        repaired = repaired.replace(/\t/g, "\\t"); // Escape tabs

        // Try parse again
        const parsed = JSON.parse(repaired);

        const content = parsed.choices?.[0]?.message?.content;
        if (content) {
          return {
            success: true,
            content: content,
            fullResponse: parsed,
          };
        }
      } catch (repairError) {}
    }

    return {
      success: true,
      content: trimmed,
      fullResponse: null,
      error: "Warning: Response was not in JSON format, using raw text",
    };
  }
}
