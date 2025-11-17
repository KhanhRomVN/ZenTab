// src/background/deepseek/prompt-template.ts

/**
 * System prompt yêu cầu DeepSeek trả về theo format JSON API
 */
export const DEEPSEEK_API_SYSTEM_PROMPT = `
You must respond ONLY with valid JSON in this exact format. Do not include any text outside the JSON structure.
`.trim();

/**
 * Wrap user prompt với system instruction
 */
export function wrapPromptWithAPIFormat(userPrompt: string): string {
  return `${DEEPSEEK_API_SYSTEM_PROMPT}

USER REQUEST:
${userPrompt}

CRITICAL INSTRUCTION:
Return ONLY a valid JSON object in this EXACT format. No additional text before or after the JSON.

Required JSON structure:
{
  "id": "chatcmpl-${generateRandomId()}",
  "object": "chat.completion",
  "created": ${Math.floor(Date.now() / 1000)},
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "PUT YOUR COMPLETE ANSWER HERE - use \\n for line breaks, escape quotes with \\"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": ${estimateTokens(userPrompt)},
    "completion_tokens": 100,
    "total_tokens": ${estimateTokens(userPrompt) + 100}
  },
  "system_fingerprint": "fp_${generateRandomId().substring(0, 8)}"
}

Your response must start with { and end with }. No explanations, no markdown, just pure JSON.`;
}

// Helper functions
function generateRandomId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
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
        console.log("[parseAPIResponse] 🔧 Layer 2: Found JSON via regex");
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
      console.warn(
        "[parseAPIResponse] ⚠️ Invalid structure: missing choices array"
      );
      throw new Error("Invalid API response structure: missing choices array");
    }

    const content = parsed.choices[0]?.message?.content;

    if (typeof content !== "string") {
      console.warn(
        "[parseAPIResponse] ⚠️ Invalid structure: missing message content"
      );
      throw new Error(
        "Invalid API response structure: missing message content"
      );
    }

    if (content.trim().length === 0) {
      console.warn("[parseAPIResponse] ⚠️ Invalid structure: empty content");
      throw new Error("Invalid API response: content is empty");
    }

    return {
      success: true,
      content: content,
      fullResponse: parsed,
    };
  } catch (error) {
    console.error("[parseAPIResponse] ❌ Layers 1-2 failed:", error);

    // LAYER 3: Fallback - treat entire response as plain text
    console.warn("[parseAPIResponse] 🔄 Layer 3: Fallback to plain text mode");

    const trimmed = rawResponse.trim();

    if (trimmed.length === 0) {
      console.error("[parseAPIResponse] ❌ Layer 3 failed: empty response");
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
      console.warn(
        "[parseAPIResponse] ⚠️ Response looks like malformed JSON, attempting repair..."
      );

      // LAYER 4: Try to repair common JSON issues
      try {
        let repaired = trimmed;

        // Fix common issues
        repaired = repaired.replace(/\n/g, "\\n"); // Escape newlines
        repaired = repaired.replace(/\r/g, "\\r"); // Escape carriage returns
        repaired = repaired.replace(/\t/g, "\\t"); // Escape tabs

        // Try parse again
        const parsed = JSON.parse(repaired);
        console.log("[parseAPIResponse] ✅ Layer 4: JSON repair successful!");

        const content = parsed.choices?.[0]?.message?.content;
        if (content) {
          return {
            success: true,
            content: content,
            fullResponse: parsed,
          };
        }
      } catch (repairError) {
        console.error("[parseAPIResponse] ❌ Layer 4 failed:", repairError);
      }
    }

    // FINAL FALLBACK: Return raw response as-is
    console.warn(
      "[parseAPIResponse] 🆘 Using final fallback: returning raw response"
    );
    console.log(
      "[parseAPIResponse] 📋 Fallback content length:",
      trimmed.length
    );

    return {
      success: true,
      content: trimmed,
      fullResponse: null,
      error: "Warning: Response was not in JSON format, using raw text",
    };
  }
}
