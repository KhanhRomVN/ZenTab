import { ContainerManager } from "./container-manager";
import { MessageHandler } from "./message-handler";
import { WSManagerNew } from "./websocket/ws-manager-new";
import { TabBroadcaster } from "./websocket/tab-broadcaster";
import { DeepSeekController } from "./deepseek-controller";
import { TabStateManager } from "./utils/tab-state-manager";

declare const browser: typeof chrome & any;

(function () {
  "use strict";

  const browserAPI = (function (): typeof chrome & any {
    if (typeof browser !== "undefined") return browser as any;
    if (typeof chrome !== "undefined") return chrome as any;
    throw new Error("No browser API available");
  })();

  browserAPI.storage.local.remove([
    "wsStates",
    "wsConnections",
    "wsMessages",
    "wsOutgoingMessage",
    "wsIncomingRequest",
    "wsCommand",
    "wsCommandResult",
  ]);

  const wsManager = new WSManagerNew();
  new TabBroadcaster(wsManager);

  const tabStateManager = TabStateManager.getInstance();

  const containerManager = new ContainerManager(browserAPI);
  const messageHandler = new MessageHandler(containerManager);

  // Setup event listeners
  if (browserAPI.contextualIdentities) {
    browserAPI.contextualIdentities.onCreated.addListener(() => {
      containerManager.initializeContainers();
    });

    browserAPI.contextualIdentities.onRemoved.addListener(() => {
      containerManager.initializeContainers();
    });
  }

  browserAPI.storage.onChanged.addListener((changes: any, areaName: string) => {
    if (areaName !== "local") return;

    // Process incoming WebSocket messages
    if (changes.wsMessages) {
      const messages = changes.wsMessages.newValue || {};
      if (Object.keys(messages).length === 0) {
        return;
      }

      // Process each connection's messages
      for (const [connectionId, msgArray] of Object.entries(messages)) {
        const msgs = msgArray as Array<{ timestamp: number; data: any }>;

        const recentMsgs = msgs.filter((msg) => {
          const age = Date.now() - msg.timestamp;
          return age < 180000; // 180 seconds (3 minutes)
        });

        if (recentMsgs.length === 0) {
          continue;
        }

        // Get latest message
        const latestMsg = recentMsgs[recentMsgs.length - 1];

        if (latestMsg.data.type === "sendPrompt") {
          const {
            tabId,
            systemPrompt,
            userPrompt,
            requestId,
            isNewTask,
            folderPath,
          } = latestMsg.data;

          if (!tabId || !userPrompt || !requestId) {
            console.error(
              `[ServiceWorker] ❌ Invalid sendPrompt message - missing required fields`
            );
            console.error(`[ServiceWorker] 📊 Message data:`, {
              tabId,
              hasSystemPrompt: !!systemPrompt,
              hasUserPrompt: !!userPrompt,
              requestId,
              isNewTask,
              hasFolderPath: !!folderPath,
            });
            continue;
          }

          const languageRule = `
CRITICAL LANGUAGE RULE:
- You MUST respond in Vietnamese (Tiếng Việt) for ALL outputs
- All explanations, descriptions, and responses must be in Vietnamese
- Code comments should also be in Vietnamese when possible`;

          const textWrapRule = `
CRITICAL TEXT BLOCK WRAPPING RULES (16 RULES):
1. You MUST wrap <task_progress> tags inside text code blocks
2. You MUST wrap ALL code content inside <content> tags of <write_to_file> inside text code blocks
3. You MUST wrap ALL code content inside <diff> tags of <replace_in_file> inside text code blocks
4. The text block must start with: \`\`\`text
5. The text block must end with: \`\`\`
6. <thinking> tags and explanations should NOT be wrapped in text blocks
7. Do NOT put explanations or other content inside the \`\`\`text...\`\`\` blocks
8. Each wrappable content (task_progress or code) gets its own separate text block
9. If there is no task_progress or code in your response, do NOT use any text code blocks
10. The text block wrapper is ONLY for task_progress and code content, not for other content
11. In <replace_in_file>: BOTH old code (after SEARCH) and new code (after REPLACE) MUST be wrapped in separate text blocks
12. Code in <new_str> within <replace_in_file> MUST be wrapped in text blocks
13. Code in <content> within <write_to_file> MUST be wrapped in text blocks
14. YOU MUST ALWAYS USE <content></content> tags inside <write_to_file> - NEVER omit them
15. The <content> tag is REQUIRED and MANDATORY in all <write_to_file> operations
16. You MUST preserve EXACT indentation (spaces/tabs) from original code - do NOT reformat or change spacing

CRITICAL INDENTATION RULES:
- Read and preserve the EXACT number of spaces or tabs at the beginning of each line
- If original code uses 2 spaces for indentation, keep 2 spaces
- If original code uses 4 spaces, keep 4 spaces
- If original code uses tabs, keep tabs
- Do NOT apply auto-formatting (like Prettier, ESLint, or PEP8)
- Do NOT change indentation to match your preferred style
- Example: If you see "  return a + b;" (2 spaces), you MUST write "  return a + b;" (2 spaces)
- When using <replace_in_file>, the SEARCH block MUST match indentation EXACTLY character-by-character
- When using <write_to_file>, preserve the indentation style of existing files in the project

CORRECT FORMAT EXAMPLES:

Example 1 - Task Progress:
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

Example 2 - Replace In File with Code (BOTH old and new code wrapped, preserving 2-space indent):
<replace_in_file>
<path>src/utils/helper.ts</path>
<diff>
<<<<<<< SEARCH
\`\`\`text
function oldFunction() {
  return "old";  // Exactly 2 spaces - MUST match original file
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

Example 3 - Write To File with Code (CORRECT - has <content> tag and preserves 2-space indent):
<write_to_file>
<path>src/new-file.ts</path>
<content>
\`\`\`text
export function myFunction() {
  console.log("Hello World");  // Exactly 2 spaces indent
  return true;                 // Exactly 2 spaces indent
}
\`\`\`
</content>
</write_to_file>

INCORRECT FORMAT EXAMPLES:
❌ Example 1 - Missing <content> tag (CRITICAL ERROR):
<write_to_file>
<path>test.ts</path>
\`\`\`text
function test() {
  return true;
}
\`\`\`
</write_to_file>

❌ Example 2 - code without text wrapper:
<write_to_file>
<path>test.ts</path>
<content>
function test() {
  return true;
}
</content>
</write_to_file>

❌ Example 3 - only new code wrapped in replace_in_file:
<replace_in_file>
<path>test.ts</path>
<diff>
<<<<<<< SEARCH
function oldFunction() {
  return "old";
}
=======
\`\`\`text
function newFunction() {
  return "new";
}
\`\`\`
>>>>>>> REPLACE
</diff>
</replace_in_file>

❌ Example 4 - wrapping everything:
\`\`\`text
<thinking>...</thinking>
<write_to_file>...</write_to_file>
\`\`\`

❌ Example 5 - mixing content in text block:
\`\`\`text
Some explanation
function test() {}
More text
\`\`\`

❌ Example 6 - wrong indentation (file uses 2 spaces, but you wrote 4 spaces):
<write_to_file>
<path>test.ts</path>
<content>
\`\`\`text
function test() {
    return true;  // ❌ WRONG: 4 spaces, but file uses 2 spaces
}
\`\`\`
</content>
</write_to_file>

REMEMBER: 
- <task_progress> content MUST be wrapped in \`\`\`text...\`\`\`
- ALL CODE in <replace_in_file> (both SEARCH and REPLACE sections) MUST be wrapped in \`\`\`text...\`\`\`
- ALL CODE in <write_to_file> MUST be wrapped in \`\`\`text...\`\`\` AND placed inside <content></content> tags
- The <content></content> tags are MANDATORY in <write_to_file> - NEVER skip them
- Each code block gets its own separate \`\`\`text...\`\`\` wrapper!
- Structure: <write_to_file><path>...</path><content>\`\`\`text...code...\`\`\`</content></write_to_file>
- CRITICAL: Preserve EXACT indentation (spaces/tabs) from original code - count spaces carefully!
- When using <replace_in_file>, SEARCH block MUST match original indentation character-by-character
- Example: "  return a + b;" (2 spaces) → you MUST write "  return a + b;" (2 spaces), NOT "    return a + b;" (4 spaces)`;

          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${languageRule}\n\n${textWrapRule}\n\nUSER REQUEST:\n${userPrompt}`
            : `${languageRule}\n\n${textWrapRule}\n\nUSER REQUEST:\n${userPrompt}`;

          const requestKey = `processed_${requestId}`;

          // Wrap in async IIFE to use await
          (async () => {
            try {
              const result = await new Promise<any>((resolve) => {
                browserAPI.storage.local.get([requestKey], (data: any) => {
                  resolve(data || {});
                });
              });

              if (result[requestKey]) {
                return;
              }

              // Mark as processed
              await new Promise<void>((resolve) => {
                browserAPI.storage.local.set(
                  { [requestKey]: Date.now() },
                  () => {
                    resolve();
                  }
                );
              });

              const isNewTaskBool = isNewTask === true;
              DeepSeekController.sendPrompt(
                tabId,
                combinedPrompt,
                requestId,
                isNewTaskBool
              )
                .then((success: boolean) => {
                  if (success) {
                    setTimeout(() => {
                      browserAPI.storage.local.remove([requestKey]);
                    }, 120000);
                  } else {
                    console.error(
                      `[ServiceWorker] ❌ Failed to send prompt, notifying backend...`
                    );

                    browserAPI.storage.local.set({
                      wsOutgoingMessage: {
                        connectionId: connectionId,
                        data: {
                          type: "promptResponse",
                          requestId: requestId,
                          tabId: tabId,
                          success: false,
                          error: "Failed to send prompt to DeepSeek tab",
                          errorType: "SEND_FAILED",
                          details: {
                            tabId: tabId,
                            promptLength: combinedPrompt.length,
                            timestamp: Date.now(),
                          },
                        },
                        timestamp: Date.now(),
                      },
                    });

                    browserAPI.storage.local.remove([requestKey]);
                  }
                })
                .catch((error: any) => {
                  console.error(
                    `[ServiceWorker] ❌ Exception in DeepSeekController.sendPrompt:`,
                    error
                  );
                  browserAPI.storage.local.remove([requestKey]);
                });
            } catch (error) {
              console.error(
                `[ServiceWorker] ❌ Exception in sendPrompt handler:`,
                error
              );
              browserAPI.storage.local.remove([requestKey]);
            }
          })();
        }
      }
    }

    if (changes.wsIncomingRequest) {
      const request = changes.wsIncomingRequest.newValue;

      if (!request) {
        return;
      }

      if (request.type === "getAvailableTabs") {
        (async () => {
          try {
            const { requestId, connectionId } = request;

            // Sử dụng tabStateManager instance đã tạo ở đầu file
            if (!tabStateManager) {
              console.error("[ServiceWorker] TabStateManager not available!");
              throw new Error("TabStateManager not initialized");
            }

            const availableTabs = await tabStateManager.getAllTabStates();

            // Send response via wsOutgoingMessage
            await new Promise<void>((resolve, reject) => {
              browserAPI.storage.local.set(
                {
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "availableTabs",
                      requestId: requestId,
                      tabs: availableTabs,
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  },
                },
                () => {
                  if (browserAPI.runtime.lastError) {
                    console.error(
                      "[ServiceWorker] Error sending availableTabs response:",
                      browserAPI.runtime.lastError
                    );
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve();
                }
              );
            });

            // Clean up request
            browserAPI.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing getAvailableTabs:",
              error
            );

            // Send error response
            browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: request.connectionId,
                data: {
                  type: "availableTabs",
                  requestId: request.requestId,
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              },
            });

            // Clean up request
            browserAPI.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }

      if (request.type === "cleanupFolderLink") {
        const folderPath = request.folderPath;

        if (!folderPath) {
          console.error(
            "[ServiceWorker] ❌ cleanupFolderLink missing folderPath"
          );
          chrome.storage.local.remove(["wsIncomingRequest"]);
          return;
        }

        (async () => {
          try {
            if (!tabStateManager) {
              console.error(
                "[ServiceWorker] ❌ TabStateManager not available for cleanup!"
              );
              chrome.storage.local.remove(["wsIncomingRequest"]);
              return;
            }

            const unlinked = await tabStateManager.unlinkFolder(folderPath);

            if (unlinked) {
              console.log(
                `[ServiceWorker] ✅ Successfully unlinked tabs from folder: ${folderPath}`
              );
            } else {
              console.warn(
                `[ServiceWorker] ⚠️ No tabs were unlinked from folder: ${folderPath}`
              );
            }

            chrome.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing cleanupFolderLink:",
              error
            );
            chrome.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }

      if (request.type === "getTabsByFolder") {
        const folderPath = request.folderPath;
        const requestId = request.requestId;
        const connectionId = request.connectionId;

        if (!folderPath || !requestId || !connectionId) {
          console.error(
            "[ServiceWorker] ❌ getTabsByFolder missing required fields"
          );
          chrome.storage.local.remove(["wsIncomingRequest"]);
          return;
        }

        (async () => {
          try {
            if (!tabStateManager) {
              console.error(
                "[ServiceWorker] ❌ TabStateManager not available!"
              );
              throw new Error("TabStateManager not initialized");
            }

            const matchingTabs = await tabStateManager.getTabsByFolder(
              folderPath
            );

            await new Promise<void>((resolve, reject) => {
              browserAPI.storage.local.set(
                {
                  wsOutgoingMessage: {
                    connectionId: connectionId,
                    data: {
                      type: "availableTabs",
                      requestId: requestId,
                      tabs: matchingTabs,
                      timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                  },
                },
                () => {
                  if (browserAPI.runtime.lastError) {
                    console.error(
                      "[ServiceWorker] ❌ Error sending getTabsByFolder response:",
                      browserAPI.runtime.lastError
                    );
                    reject(browserAPI.runtime.lastError);
                    return;
                  }
                  resolve();
                }
              );
            });

            chrome.storage.local.remove(["wsIncomingRequest"]);
          } catch (error) {
            console.error(
              "[ServiceWorker] ❌ Error processing getTabsByFolder:",
              error
            );

            browserAPI.storage.local.set({
              wsOutgoingMessage: {
                connectionId: request.connectionId,
                data: {
                  type: "availableTabs",
                  requestId: request.requestId,
                  success: false,
                  tabs: [],
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: Date.now(),
                },
                timestamp: Date.now(),
              },
            });

            chrome.storage.local.remove(["wsIncomingRequest"]);
          }
        })();
      }
    }
  });

  // Unified Message Listener - handles all actions
  browserAPI.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: any) => {
      // WebSocket actions - ignore, handled via storage
      if (
        (message.action &&
          message.action.startsWith("addWebSocketConnection")) ||
        message.action === "removeWebSocketConnection" ||
        message.action === "connectWebSocket" ||
        message.action === "disconnectWebSocket"
      ) {
        // Return empty response to prevent UI from hanging
        sendResponse({
          success: true,
          note: "WebSocket actions use storage-based communication",
        });
        return true;
      }

      if (message.action === "ws.incomingPrompt") {
        DeepSeekController.sendPrompt(
          message.tabId,
          message.prompt,
          message.requestId
        ).then((success: boolean) => {
          sendResponse({ success });
        });
        return true;
      }

      // DeepSeek controller handlers
      switch (message.action) {
        case "getTabStates":
          (async () => {
            try {
              const tabStates = await tabStateManager.getAllTabStates();
              const responseData = { success: true, tabStates };
              sendResponse(responseData);
            } catch (error) {
              console.error("[ServiceWorker] ❌ Error in getTabStates:", error);
              console.error("[ServiceWorker] 🔍 Error details:", {
                type:
                  error instanceof Error
                    ? error.constructor.name
                    : typeof error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              });

              const responseData = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
              sendResponse(responseData);
            }
          })();

          return true;

        case "deepseek.clickNewChat":
          DeepSeekController.clickNewChatButton(message.tabId).then(
            (success: boolean) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.isDeepThinkEnabled":
          DeepSeekController.isDeepThinkEnabled(message.tabId).then(
            (enabled: any) => {
              sendResponse({ enabled });
            }
          );
          return true;

        case "deepseek.toggleDeepThink":
          DeepSeekController.toggleDeepThink(
            message.tabId,
            message.enable
          ).then((success: boolean) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.sendPrompt":
          DeepSeekController.sendPrompt(
            message.tabId,
            message.prompt,
            message.requestId
          ).then((success: boolean) => {
            sendResponse({ success });
          });
          return true;

        case "deepseek.stopGeneration":
          DeepSeekController.stopGeneration(message.tabId).then(
            (success: boolean) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.getLatestResponse":
          DeepSeekController.getLatestResponse(message.tabId).then(
            (response: any) => {
              sendResponse({ response });
            }
          );
          return true;

        case "deepseek.createNewChat":
          DeepSeekController.createNewChat(message.tabId).then(
            (success: any) => {
              sendResponse({ success });
            }
          );
          return true;

        case "deepseek.getChatTitle":
          DeepSeekController.getChatTitle(message.tabId).then((title: any) => {
            sendResponse({ title });
          });
          return true;

        case "deepseek.isGenerating":
          DeepSeekController.isGenerating(message.tabId).then(
            (generating: any) => {
              sendResponse({ generating });
            }
          );
          return true;

        case "deepseek.getCurrentInput":
          DeepSeekController.getCurrentInput(message.tabId).then(
            (input: any) => {
              sendResponse({ input });
            }
          );
          return true;

        case "getAvailableTabs":
          return true;

        default:
          messageHandler.handleMessage(message, sendResponse);
          return true;
      }
    }
  );

  // Initialize on startup
  containerManager.initializeContainers();
})();
