// import { ContainerManager } from "./container-manager";
// import { MessageHandler } from "./message-handler";
// import { WSManagerNew } from "./websocket/ws-manager-new";
// import { TabBroadcaster } from "./websocket/tab-broadcaster";
// import { DeepSeekController } from "./deepseek-controller";
// import { TabStateManager } from "./utils/tab-state-manager";

// declare const browser: typeof chrome & any;

// (function () {
//   "use strict";

//   const browserAPI = (function (): typeof chrome & any {
//     if (typeof browser !== "undefined") return browser as any;
//     if (typeof chrome !== "undefined") return chrome as any;
//     throw new Error("No browser API available");
//   })();

//   browserAPI.storage.local.remove([
//     "wsStates",
//     "wsConnections",
//     "wsMessages",
//     "wsOutgoingMessage",
//     "wsIncomingRequest",
//     "wsCommand",
//     "wsCommandResult",
//   ]);

//   const wsManager = new WSManagerNew();
//   new TabBroadcaster(wsManager);

//   const tabStateManager = TabStateManager.getInstance();

//   // 🆕 Inject clipboard watcher vào tất cả DeepSeek tabs
//   (async () => {
//     const injectClipboardWatcher = async (tabId: number) => {
//       try {
//         await browserAPI.tabs.executeScript(tabId, {
//           code: `
// (function() {
//   'use strict';

//   // Prevent multiple injections
//   if (window.__deepseekClipboardWatcherInjected) {
//     console.log('[DeepSeek Watcher] Already injected, skipping...');
//     return;
//   }
//   window.__deepseekClipboardWatcherInjected = true;

//   console.log('[DeepSeek Watcher] 🟢 Starting clipboard watcher...');
//   console.log('[DeepSeek Watcher] 📍 Location:', window.location.href);
//   console.log('[DeepSeek Watcher] 🔍 Document ready state:', document.readyState);

//   let lastCopiedText = null;
//   let lastCopyTimestamp = 0;
//   const DEBOUNCE_TIME = 1000;
//   let buttonCount = 0;

//   // Function to safely read clipboard with detailed logging
//   async function readClipboardSafe() {
//     try {
//       console.log('[DeepSeek Watcher] 📋 Attempting to read clipboard...');

//       // Firefox doesn't support clipboard-read permission query
//       // Just try to read directly
//       const text = await navigator.clipboard.readText();
//       console.log('[DeepSeek Watcher] ✅ Clipboard read successful, length:', text?.length || 0);
//       return text;
//     } catch (error) {
//       console.error('[DeepSeek Watcher] ❌ Clipboard read failed:', error);
//       console.error('[DeepSeek Watcher] 💡 Error name:', error.name);
//       console.error('[DeepSeek Watcher] 💡 Error message:', error.message);
//       return null;
//     }
//   }

//   // Function to send data to background
//   function sendToBackground(text, source) {
//     const now = Date.now();

//     // Deduplicate
//     if (text === lastCopiedText && now - lastCopyTimestamp < DEBOUNCE_TIME) {
//       console.log('[DeepSeek Watcher] ⚠️  Duplicate detected (within ' + DEBOUNCE_TIME + 'ms), ignoring...');
//       return;
//     }

//     lastCopiedText = text;
//     lastCopyTimestamp = now;

//     console.log(\`[DeepSeek Watcher] ✅ NEW CAPTURE from \${source}\`);
//     console.log(\`[DeepSeek Watcher] 📊 Length: \${text.length} chars\`);
//     console.log(\`[DeepSeek Watcher] ⏰ Timestamp: \${new Date(now).toISOString()}\`);
//     console.log(\`[DeepSeek Watcher] 📄 First 300 chars:\`);
//     console.log(text.substring(0, 300));
//     console.log(\`[DeepSeek Watcher] 📄 Last 100 chars:\`);
//     console.log(text.substring(Math.max(0, text.length - 100)));

//     try {
//       chrome.runtime.sendMessage({
//         action: 'deepseek.clipboardCaptured',
//         data: {
//           text: text,
//           timestamp: now,
//           source: source,
//           length: text.length
//         }
//       }, (response) => {
//         if (chrome.runtime.lastError) {
//           console.error('[DeepSeek Watcher] ❌ Message send failed:', chrome.runtime.lastError);
//         } else {
//           console.log('[DeepSeek Watcher] 📤 Message sent successfully, response:', response);
//         }
//       });
//     } catch (error) {
//       console.error('[DeepSeek Watcher] ❌ Exception sending message:', error);
//     }
//   }

//   // Method 1: Direct button click listener with enhanced logging
//   function attachButtonListeners() {
//     // Only attach to AI response copy buttons (in groups of 5 buttons)
//     const aiButtonGroups = document.querySelectorAll('.ds-flex._965abe9._54866f7');

//     console.log(\`[DeepSeek Watcher] 🔍 Scanning for AI response groups... Found: \${aiButtonGroups.length}\`);

//     let newlyAttached = 0;

//     aiButtonGroups.forEach((group, groupIndex) => {
//       const copyButtons = group.querySelectorAll('.ds-icon-button.db183363');

//       copyButtons.forEach((button, btnIndex) => {
//         if (button.__copyListenerAttached) {
//           return;
//         }

//         const svgPath = button.querySelector('svg path');
//         const pathData = svgPath?.getAttribute('d') || '';

//         console.log(\`[DeepSeek Watcher] 🔍 Group #\${groupIndex} Button #\${btnIndex} path: \${pathData.substring(0, 50)}\`);

//         if (pathData.startsWith('M6.14926 4.02039')) {
//           buttonCount++;
//         console.log(\`[DeepSeek Watcher] ✅ Attaching listener to COPY button #\${buttonCount} (Group: \${groupIndex}, Button: \${btnIndex})\`);

//         button.addEventListener('click', async (event) => {
//           console.log(\`[DeepSeek Watcher] 🖱️  COPY BUTTON #\${buttonCount} CLICKED!\`);
//           console.log(\`[DeepSeek Watcher] 🖱️  Event type:\`, event.type);
//           console.log(\`[DeepSeek Watcher] 🖱️  Event target:\`, event.target);
//           console.log(\`[DeepSeek Watcher] 🖱️  Current timestamp:\`, Date.now());

//           // Wait for clipboard to be populated (longer delay for safety)
//           console.log('[DeepSeek Watcher] ⏳ Waiting 200ms for clipboard...');
//           await new Promise(resolve => setTimeout(resolve, 200));

//           const text = await readClipboardSafe();
//           if (text) {
//             console.log('[DeepSeek Watcher] 🎉 Clipboard text retrieved successfully!');
//             sendToBackground(text, \`copy_button_\${buttonCount}\`);
//           } else {
//             console.error('[DeepSeek Watcher] ❌ Failed to retrieve clipboard text after button click');
//           }
//         }, { passive: true });

//         button.__copyListenerAttached = true;
//           newlyAttached++;
//         } else {
//           console.log(\`[DeepSeek Watcher] ⚠️  Group #\${groupIndex} Button #\${btnIndex} NOT a copy button (wrong path)\`);
//         }
//       });
//     });

//     console.log(\`[DeepSeek Watcher] 📊 Summary: \${newlyAttached} new listeners attached, \${buttonCount} total copy buttons\`);
//   }

//   // Method 2: Global copy event listener (fallback) with enhanced logging
//   document.addEventListener('copy', async (event) => {
//     console.log('[DeepSeek Watcher] 📋 GLOBAL COPY EVENT DETECTED');
//     console.log('[DeepSeek Watcher] 📋 Event timestamp:', Date.now());
//     console.log('[DeepSeek Watcher] 📋 Event target:', event.target);

//     // Wait for clipboard to be updated
//     console.log('[DeepSeek Watcher] ⏳ Waiting 150ms for clipboard...');
//     await new Promise(resolve => setTimeout(resolve, 150));

//     const text = await readClipboardSafe();
//     if (text) {
//       console.log('[DeepSeek Watcher] 🎉 Global copy captured!');
//       sendToBackground(text, 'global_copy_event');
//     } else {
//       console.error('[DeepSeek Watcher] ❌ Failed to capture global copy');
//     }
//   }, { passive: true });

//   console.log('[DeepSeek Watcher] 👂 Global copy listener attached');

//   // Method 3: MutationObserver for dynamically added buttons
//   const observer = new MutationObserver((mutations) => {
//     let shouldRescan = false;
//     let addedNodesCount = 0;

//     for (const mutation of mutations) {
//       if (mutation.addedNodes.length > 0) {
//         addedNodesCount += mutation.addedNodes.length;
//         for (const node of mutation.addedNodes) {
//           if (node.nodeType === Node.ELEMENT_NODE) {
//             if (node.classList?.contains('_965abe9') ||
//                 node.querySelector?.('.ds-flex._965abe9._54866f7')) {
//               shouldRescan = true;
//               console.log('[DeepSeek Watcher] 🆕 New AI response group detected');
//               break;
//             }
//           }
//         }
//       }
//       if (shouldRescan) break;
//     }

//     if (shouldRescan) {
//       console.log(\`[DeepSeek Watcher] 🔄 Rescanning due to \${addedNodesCount} new nodes...\`);
//       attachButtonListeners();
//     }
//   });

//   observer.observe(document.body, {
//     childList: true,
//     subtree: true
//   });

//   console.log('[DeepSeek Watcher] 👀 MutationObserver started');

//   // Initial scan with retry
//   console.log('[DeepSeek Watcher] 🔍 Performing initial scan...');
//   attachButtonListeners();

//   // Retry after 2 seconds if no buttons found initially
//   setTimeout(() => {
//     if (buttonCount === 0) {
//       console.log('[DeepSeek Watcher] 🔄 No buttons found initially, retrying scan...');
//       attachButtonListeners();
//     }
//   }, 2000);

//   // Debug: Log page structure
//   setTimeout(() => {
//     console.log('[DeepSeek Watcher] 🔍 Page structure debug info:');
//     console.log('  - Total buttons:', document.querySelectorAll('button').length);
//     console.log('  - Icon buttons (.ds-icon-button):', document.querySelectorAll('.ds-icon-button').length);
//     console.log('  - Copy buttons (.ds-icon-button.db183363):', document.querySelectorAll('.ds-icon-button.db183363').length);
//     console.log('  - Textareas:', document.querySelectorAll('textarea').length);
//     console.log('  - Current URL:', window.location.href);
//     console.log('  - Document title:', document.title);
//   }, 1000);

//   console.log('[DeepSeek Watcher] ✅ All systems ready!');
// })();
//           `,
//         });

//         console.log(
//           `[ServiceWorker] ✅ Clipboard watcher injected into tab ${tabId}`
//         );
//       } catch (error) {
//         console.error(
//           `[ServiceWorker] ❌ Failed to inject clipboard watcher into tab ${tabId}:`,
//           error
//         );
//         console.error(
//           `[ServiceWorker] 💡 Error type:`,
//           error instanceof Error ? error.constructor.name : typeof error
//         );
//         console.error(
//           `[ServiceWorker] 💡 Error message:`,
//           error instanceof Error ? error.message : String(error)
//         );
//       }
//     };

//     // Inject vào tất cả DeepSeek tabs hiện tại
//     try {
//       const tabs = await browserAPI.tabs.query({
//         url: ["https://chat.deepseek.com/*", "https://*.deepseek.com/*"],
//       });

//       console.log(
//         `[ServiceWorker] 🔍 Found ${tabs.length} DeepSeek tabs for clipboard watching`
//       );

//       for (const tab of tabs) {
//         if (tab.id) {
//           console.log(
//             `[ServiceWorker] 📌 Injecting into tab ${tab.id}: ${tab.title}`
//           );
//           await injectClipboardWatcher(tab.id);
//         }
//       }

//       console.log(
//         `[ServiceWorker] ✅ Injection complete for ${tabs.length} tabs`
//       );
//     } catch (error) {
//       console.error("[ServiceWorker] ❌ Failed to query tabs:", error);
//       console.error(
//         "[ServiceWorker] 💡 Error type:",
//         error instanceof Error ? error.constructor.name : typeof error
//       );
//     }

//     // Listen for new DeepSeek tabs và inject
//     browserAPI.tabs.onUpdated.addListener(
//       async (tabId: number, changeInfo: any, tab: any) => {
//         if (
//           changeInfo.status === "complete" &&
//           tab.url?.startsWith("https://chat.deepseek.com")
//         ) {
//           console.log(`[ServiceWorker] 🆕 New DeepSeek tab detected: ${tabId}`);
//           console.log(`[ServiceWorker] 📌 Tab title: ${tab.title}`);
//           await injectClipboardWatcher(tabId);
//         }
//       }
//     );

//     console.log(
//       "[ServiceWorker] 👂 Tab update listener attached for auto-injection"
//     );
//   })();

//   // Copy Watcher Helper
//   const startCopyWatcher = async (tabId: number): Promise<boolean> => {
//     try {
//       await browserAPI.tabs.executeScript(tabId, {
//         code: `
// (function() {
//   'use strict';

//   if (window.__deepseekCopyWatcherInjected) {
//     console.log('[CopyWatcher] Already injected, skipping...');
//     return;
//   }
//   window.__deepseekCopyWatcherInjected = true;

//   console.log('[CopyWatcher] 🟢 Starting clipboard watcher...');

//   let lastCopiedText = null;
//   let lastCopyTimestamp = 0;
//   const DEBOUNCE_TIME = 1000;
//   let buttonCount = 0;

//   async function readClipboardSafe() {
//     try {
//       console.log('[CopyWatcher] 📋 Attempting to read clipboard...');
//       const text = await navigator.clipboard.readText();
//       console.log('[CopyWatcher] ✅ Clipboard read successful, length:', text?.length || 0);
//       return text;
//     } catch (error) {
//       console.error('[CopyWatcher] ❌ Clipboard read failed:', error);
//       return null;
//     }
//   }

//   function logCapturedContent(text, source) {
//     const now = Date.now();

//     if (text === lastCopiedText && now - lastCopyTimestamp < DEBOUNCE_TIME) {
//       console.log('[CopyWatcher] ⚠️  Duplicate detected, ignoring...');
//       return;
//     }

//     lastCopiedText = text;
//     lastCopyTimestamp = now;

//     console.log("╔═══════════════════════════════════════════════════════════╗");
//     console.log("║         🤖 AI RESPONSE COPIED (DeepSeek)                 ║");
//     console.log("╚═══════════════════════════════════════════════════════════╝");
//     console.log(\`📍 Source: \${source}\`);
//     console.log(\`📊 Length: \${text.length} chars\`);
//     console.log(\`⏰ Timestamp: \${new Date(now).toISOString()}\`);
//     console.log("📋 Copied Content:");
//     console.log("─".repeat(60));
//     console.log(text);
//     console.log("─".repeat(60));
//   }

//   function attachButtonListeners() {
//     const aiButtonGroups = document.querySelectorAll('.ds-flex._965abe9._54866f7');

//     console.log(\`[CopyWatcher] 🔍 Scanning for AI response groups... Found: \${aiButtonGroups.length}\`);

//     let newlyAttached = 0;

//     aiButtonGroups.forEach((group, groupIndex) => {
//       const copyButtons = group.querySelectorAll('.ds-icon-button.db183363');

//       copyButtons.forEach((button, btnIndex) => {
//         if (button.__copyListenerAttached) {
//           return;
//         }

//         const svgPath = button.querySelector('svg path');
//         const pathData = svgPath?.getAttribute('d') || '';

//         if (pathData.startsWith('M6.14926 4.02039')) {
//           buttonCount++;
//           console.log(\`[CopyWatcher] ✅ Attaching listener to COPY button #\${buttonCount}\`);

//           button.addEventListener('click', async (event) => {
//             console.log(\`[CopyWatcher] 🖱️  COPY BUTTON #\${buttonCount} CLICKED!\`);

//             console.log('[CopyWatcher] ⏳ Waiting 200ms for clipboard...');
//             await new Promise(resolve => setTimeout(resolve, 200));

//             const text = await readClipboardSafe();
//             if (text) {
//               console.log('[CopyWatcher] 🎉 Clipboard text retrieved successfully!');
//               logCapturedContent(text, \`copy_button_\${buttonCount}\`);
//             } else {
//               console.error('[CopyWatcher] ❌ Failed to retrieve clipboard text after button click');
//             }
//           }, { passive: true });

//           button.__copyListenerAttached = true;
//           newlyAttached++;
//         }
//       });
//     });

//     console.log(\`[CopyWatcher] 📊 Summary: \${newlyAttached} new listeners attached, \${buttonCount} total copy buttons\`);
//   }

//   document.addEventListener('copy', async (event) => {
//     console.log('[CopyWatcher] 📋 GLOBAL COPY EVENT DETECTED');

//     console.log('[CopyWatcher] ⏳ Waiting 150ms for clipboard...');
//     await new Promise(resolve => setTimeout(resolve, 150));

//     const text = await readClipboardSafe();
//     if (text) {
//       console.log('[CopyWatcher] 🎉 Global copy captured!');
//       logCapturedContent(text, 'global_copy_event');
//     }
//   }, { passive: true });

//   console.log('[CopyWatcher] 👂 Global copy listener attached');

//   const observer = new MutationObserver((mutations) => {
//     let shouldRescan = false;

//     for (const mutation of mutations) {
//       if (mutation.addedNodes.length > 0) {
//         for (const node of mutation.addedNodes) {
//           if (node.nodeType === Node.ELEMENT_NODE) {
//             if (node.classList?.contains('_965abe9') ||
//                 node.querySelector?.('.ds-flex._965abe9._54866f7')) {
//               shouldRescan = true;
//               console.log('[CopyWatcher] 🆕 New AI response group detected');
//               break;
//             }
//           }
//         }
//       }
//       if (shouldRescan) break;
//     }

//     if (shouldRescan) {
//       console.log('[CopyWatcher] 🔄 Rescanning...');
//       attachButtonListeners();
//     }
//   });

//   observer.observe(document.body, {
//     childList: true,
//     subtree: true
//   });

//   console.log('[CopyWatcher] 👀 MutationObserver started');

//   console.log('[CopyWatcher] 🔍 Performing initial scan...');
//   attachButtonListeners();

//   setTimeout(() => {
//     if (buttonCount === 0) {
//       console.log('[CopyWatcher] 🔄 No buttons found initially, retrying scan...');
//       attachButtonListeners();
//     }
//   }, 2000);

//   console.log('[CopyWatcher] ✅ All systems ready!');
// })();
//         `,
//       });

//       console.log(
//         `[ServiceWorker] ✅ Clipboard watcher injected into tab ${tabId}`
//       );
//       return true;
//     } catch (error) {
//       console.error(
//         `[ServiceWorker] ❌ Failed to inject clipboard watcher into tab ${tabId}:`,
//         error
//       );
//       return false;
//     }
//   };

//   const containerManager = new ContainerManager(browserAPI);
//   const messageHandler = new MessageHandler(containerManager);

//   // Setup event listeners
//   if (browserAPI.contextualIdentities) {
//     browserAPI.contextualIdentities.onCreated.addListener(() => {
//       containerManager.initializeContainers();
//     });

//     browserAPI.contextualIdentities.onRemoved.addListener(() => {
//       containerManager.initializeContainers();
//     });
//   }

//   browserAPI.storage.onChanged.addListener((changes: any, areaName: string) => {
//     if (areaName !== "local") return;

//     // Process incoming WebSocket messages
//     if (changes.wsMessages) {
//       const messages = changes.wsMessages.newValue || {};
//       if (Object.keys(messages).length === 0) {
//         return;
//       }

//       // Process each connection's messages
//       for (const [connectionId, msgArray] of Object.entries(messages)) {
//         const msgs = msgArray as Array<{ timestamp: number; data: any }>;

//         const recentMsgs = msgs.filter((msg) => {
//           const age = Date.now() - msg.timestamp;
//           return age < 180000; // 180 seconds (3 minutes)
//         });

//         if (recentMsgs.length === 0) {
//           continue;
//         }

//         // Get latest message
//         const latestMsg = recentMsgs[recentMsgs.length - 1];

//         if (latestMsg.data.type === "sendPrompt") {
//           const { tabId, systemPrompt, userPrompt, requestId } = latestMsg.data;

//           if (!tabId || !userPrompt || !requestId) {
//             console.error(
//               `[ServiceWorker] ❌ Invalid sendPrompt message - missing required fields`
//             );
//             console.error(`[ServiceWorker] 📊 Message data:`, {
//               tabId,
//               hasSystemPrompt: !!systemPrompt,
//               hasUserPrompt: !!userPrompt,
//               requestId,
//             });
//             continue;
//           }

//           // 🆕 Combine system prompt + user prompt
//           const combinedPrompt = systemPrompt
//             ? `${systemPrompt}\n\nUSER REQUEST:\n${userPrompt}`
//             : userPrompt;

//           const requestKey = `processed_${requestId}`;

//           // Wrap in async IIFE to use await
//           (async () => {
//             try {
//               const result = await new Promise<any>((resolve) => {
//                 browserAPI.storage.local.get([requestKey], (data: any) => {
//                   resolve(data || {});
//                 });
//               });

//               if (result[requestKey]) {
//                 return;
//               }

//               // Mark as processed
//               await new Promise<void>((resolve) => {
//                 browserAPI.storage.local.set(
//                   { [requestKey]: Date.now() },
//                   () => {
//                     resolve();
//                   }
//                 );
//               });

//               DeepSeekController.sendPrompt(tabId, combinedPrompt, requestId)
//                 .then((success: boolean) => {
//                   if (success) {
//                     setTimeout(() => {
//                       browserAPI.storage.local.remove([requestKey]);
//                     }, 120000);
//                   } else {
//                     console.error(
//                       `[ServiceWorker] ❌ Failed to send prompt, notifying backend...`
//                     );

//                     browserAPI.storage.local.set({
//                       wsOutgoingMessage: {
//                         connectionId: connectionId,
//                         data: {
//                           type: "promptResponse",
//                           requestId: requestId,
//                           tabId: tabId,
//                           success: false,
//                           error: "Failed to send prompt to DeepSeek tab",
//                           errorType: "SEND_FAILED",
//                           details: {
//                             tabId: tabId,
//                             promptLength: combinedPrompt.length,
//                             timestamp: Date.now(),
//                           },
//                         },
//                         timestamp: Date.now(),
//                       },
//                     });

//                     browserAPI.storage.local.remove([requestKey]);
//                   }
//                 })
//                 .catch((error: any) => {
//                   console.error(
//                     `[ServiceWorker] ❌ Exception in DeepSeekController.sendPrompt:`,
//                     error
//                   );
//                   browserAPI.storage.local.remove([requestKey]);
//                 });
//             } catch (error) {
//               console.error(
//                 `[ServiceWorker] ❌ Exception in sendPrompt handler:`,
//                 error
//               );
//               browserAPI.storage.local.remove([requestKey]);
//             }
//           })();
//         }
//       }
//     }

//     if (changes.wsIncomingRequest) {
//       const request = changes.wsIncomingRequest.newValue;

//       if (!request) {
//         return;
//       }

//       if (request.type === "getAvailableTabs") {
//         (async () => {
//           try {
//             const { requestId, connectionId } = request;

//             // Sử dụng tabStateManager instance đã tạo ở đầu file
//             if (!tabStateManager) {
//               console.error("[ServiceWorker] TabStateManager not available!");
//               throw new Error("TabStateManager not initialized");
//             }

//             const availableTabs = await tabStateManager.getAllTabStates();

//             // Send response via wsOutgoingMessage
//             await new Promise<void>((resolve, reject) => {
//               browserAPI.storage.local.set(
//                 {
//                   wsOutgoingMessage: {
//                     connectionId: connectionId,
//                     data: {
//                       type: "availableTabs",
//                       requestId: requestId,
//                       tabs: availableTabs,
//                       timestamp: Date.now(),
//                     },
//                     timestamp: Date.now(),
//                   },
//                 },
//                 () => {
//                   if (browserAPI.runtime.lastError) {
//                     console.error(
//                       "[ServiceWorker] Error sending availableTabs response:",
//                       browserAPI.runtime.lastError
//                     );
//                     reject(browserAPI.runtime.lastError);
//                     return;
//                   }
//                   resolve();
//                 }
//               );
//             });

//             // Clean up request
//             browserAPI.storage.local.remove(["wsIncomingRequest"]);
//           } catch (error) {
//             console.error(
//               "[ServiceWorker] ❌ Error processing getAvailableTabs:",
//               error
//             );

//             // Send error response
//             browserAPI.storage.local.set({
//               wsOutgoingMessage: {
//                 connectionId: request.connectionId,
//                 data: {
//                   type: "availableTabs",
//                   requestId: request.requestId,
//                   success: false,
//                   error: error instanceof Error ? error.message : String(error),
//                   timestamp: Date.now(),
//                 },
//                 timestamp: Date.now(),
//               },
//             });

//             // Clean up request
//             browserAPI.storage.local.remove(["wsIncomingRequest"]);
//           }
//         })();
//       }
//     }

//     // Auto-start copy watcher for ready DeepSeek tabs
//     if (changes.tabStates) {
//       const newStates = changes.tabStates.newValue || {};

//       for (const [tabIdStr, state] of Object.entries(newStates)) {
//         const tabState = state as any;
//         if (tabState.status === "ready" && tabState.type === "deepseek") {
//           const tabId = parseInt(tabIdStr);
//           setTimeout(() => {
//             startCopyWatcher(tabId).catch((error) => {
//               console.error(
//                 `[ServiceWorker] Failed to start copy watcher for tab ${tabId}:`,
//                 error
//               );
//             });
//           }, 1000);
//         }
//       }
//     }
//   });

//   // Unified Message Listener - handles all actions
//   browserAPI.runtime.onMessage.addListener(
//     (message: any, _sender: any, sendResponse: any) => {
//       // WebSocket actions - ignore, handled via storage
//       if (
//         (message.action &&
//           message.action.startsWith("addWebSocketConnection")) ||
//         message.action === "removeWebSocketConnection" ||
//         message.action === "connectWebSocket" ||
//         message.action === "disconnectWebSocket"
//       ) {
//         // Return empty response to prevent UI from hanging
//         sendResponse({
//           success: true,
//           note: "WebSocket actions use storage-based communication",
//         });
//         return true;
//       }

//       if (message.action === "ws.incomingPrompt") {
//         DeepSeekController.sendPrompt(
//           message.tabId,
//           message.prompt,
//           message.requestId
//         ).then((success: boolean) => {
//           sendResponse({ success });
//         });
//         return true;
//       }

//       // DeepSeek controller handlers
//       switch (message.action) {
//         case "getTabStates":
//           (async () => {
//             try {
//               const tabStates = await tabStateManager.getAllTabStates();
//               const responseData = { success: true, tabStates };
//               sendResponse(responseData);
//             } catch (error) {
//               console.error("[ServiceWorker] ❌ Error in getTabStates:", error);
//               console.error("[ServiceWorker] 🔍 Error details:", {
//                 type:
//                   error instanceof Error
//                     ? error.constructor.name
//                     : typeof error,
//                 message: error instanceof Error ? error.message : String(error),
//                 stack: error instanceof Error ? error.stack : undefined,
//               });

//               const responseData = {
//                 success: false,
//                 error: error instanceof Error ? error.message : String(error),
//               };
//               sendResponse(responseData);
//             }
//           })();

//           return true;

//         case "deepseek.clickNewChat":
//           DeepSeekController.clickNewChatButton(message.tabId).then(
//             (success: boolean) => {
//               sendResponse({ success });
//             }
//           );
//           return true;

//         case "deepseek.isDeepThinkEnabled":
//           DeepSeekController.isDeepThinkEnabled(message.tabId).then(
//             (enabled: any) => {
//               sendResponse({ enabled });
//             }
//           );
//           return true;

//         case "deepseek.toggleDeepThink":
//           DeepSeekController.toggleDeepThink(
//             message.tabId,
//             message.enable
//           ).then((success: boolean) => {
//             sendResponse({ success });
//           });
//           return true;

//         case "deepseek.sendPrompt":
//           DeepSeekController.sendPrompt(
//             message.tabId,
//             message.prompt,
//             message.requestId
//           ).then((success: boolean) => {
//             sendResponse({ success });
//           });
//           return true;

//         case "deepseek.stopGeneration":
//           DeepSeekController.stopGeneration(message.tabId).then(
//             (success: boolean) => {
//               sendResponse({ success });
//             }
//           );
//           return true;

//         case "deepseek.getLatestResponse":
//           DeepSeekController.getLatestResponse(message.tabId).then(
//             (response: any) => {
//               sendResponse({ response });
//             }
//           );
//           return true;

//         case "deepseek.createNewChat":
//           DeepSeekController.createNewChat(message.tabId).then(
//             (success: any) => {
//               sendResponse({ success });
//             }
//           );
//           return true;

//         case "deepseek.getChatTitle":
//           DeepSeekController.getChatTitle(message.tabId).then((title: any) => {
//             sendResponse({ title });
//           });
//           return true;

//         case "deepseek.isGenerating":
//           DeepSeekController.isGenerating(message.tabId).then(
//             (generating: any) => {
//               sendResponse({ generating });
//             }
//           );
//           return true;

//         case "deepseek.getCurrentInput":
//           DeepSeekController.getCurrentInput(message.tabId).then(
//             (input: any) => {
//               sendResponse({ input });
//             }
//           );
//           return true;

//         case "deepseek.clipboardCaptured":
//           (async () => {
//             const { text, timestamp, source, length } = message.data;

//             console.log(`[ServiceWorker] 🎉 CLIPBOARD CAPTURED!`);
//             console.log(`[ServiceWorker] 📍 Source: ${source}`);
//             console.log(`[ServiceWorker] 📊 Length: ${length} chars`);
//             console.log(
//               `[ServiceWorker] ⏰ Timestamp: ${new Date(
//                 timestamp
//               ).toISOString()}`
//             );
//             console.log(`[ServiceWorker] 📄 First 500 chars:`);
//             console.log(text.substring(0, 500));
//             console.log(`[ServiceWorker] 📄 Last 100 chars:`);
//             console.log(text.substring(Math.max(0, text.length - 100)));

//             // 🆕 Store vào session storage để có thể query sau
//             try {
//               await browserAPI.storage.session.set({
//                 [`clipboardCapture_${timestamp}`]: {
//                   text: text,
//                   timestamp: timestamp,
//                   source: source,
//                   length: length,
//                 },
//               });
//               console.log(
//                 `[ServiceWorker] 💾 Stored clipboard capture with key: clipboardCapture_${timestamp}`
//               );
//             } catch (storageError) {
//               console.error(
//                 `[ServiceWorker] ❌ Failed to store clipboard:`,
//                 storageError
//               );
//             }

//             sendResponse({
//               success: true,
//               received: true,
//               stored: true,
//               timestamp: timestamp,
//             });
//           })();
//           return true;

//         case "deepseek.startCopyWatcher":
//           startCopyWatcher(message.tabId).then((success: boolean) => {
//             sendResponse({ success });
//           });
//           return true;

//         case "getAvailableTabs":
//           return true;

//         default:
//           messageHandler.handleMessage(message, sendResponse);
//           return true;
//       }
//     }
//   );

//   // Initialize on startup
//   containerManager.initializeContainers();
// })();
