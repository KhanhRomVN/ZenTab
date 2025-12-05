"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptController = void 0;
// src/background/deepseek/prompt-controller.ts
var browser_helper_1 = require("../utils/browser-helper");
var state_controller_1 = require("./state-controller");
var chat_controller_1 = require("./chat-controller");
var types_1 = require("./types");
var tab_state_manager_1 = require("../utils/tab-state-manager");
var gpt_tokenizer_1 = require("gpt-tokenizer");
var PromptController = /** @class */ (function () {
    function PromptController() {
    }
    /**
     * 🆕 ACCURATE TOKEN CALCULATION using gpt-tokenizer (pure JS, no WASM)
     */
    PromptController.calculateTokensAndLog = function (text, label) {
        if (!text) {
            return 0;
        }
        try {
            // Tokenize text using gpt-tokenizer (GPT-3.5/GPT-4 compatible)
            var tokens = (0, gpt_tokenizer_1.encode)(text);
            var tokenCount = tokens.length;
            return tokenCount;
        }
        catch (error) {
            console.error("[TokenCalculation] \u274C Error calculating tokens for ".concat(label, ":"), error);
            console.error("[TokenCalculation] \uD83D\uDD0D Text length: ".concat(text.length, " chars"));
            console.error("[TokenCalculation] \uD83D\uDD0D Text preview: \"".concat(text.substring(0, 200), "\""));
            // Fallback to word-based estimation
            var words = text
                .trim()
                .split(/\s+/)
                .filter(function (w) { return w.length > 0; });
            var wordCount = words.length;
            // Estimate: ~0.75 tokens per word (more accurate than char-based)
            var estimatedTokens = Math.ceil(wordCount * 0.75);
            console.warn("[TokenCalculation] \u26A0\uFE0F Using fallback estimation: ".concat(estimatedTokens, " tokens (based on ").concat(wordCount, " words)"));
            return estimatedTokens;
        }
    };
    PromptController.saveTokensForFolder = function (folderPath, prompt_tokens, completion_tokens, total_tokens) {
        return __awaiter(this, void 0, void 0, function () {
            var releaseLock, lockPromise, browserAPI_1, result, accumulator_1, currentTokens, newPromptTokens, newCompletionTokens, newTotalTokens, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.folderTokenMutex.has(folderPath)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.folderTokenMutex.get(folderPath)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 0];
                    case 2:
                        lockPromise = new Promise(function (resolve) {
                            releaseLock = resolve;
                        });
                        this.folderTokenMutex.set(folderPath, lockPromise);
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, 7, 8]);
                        browserAPI_1 = (0, browser_helper_1.getBrowserAPI)();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                browserAPI_1.storage.session.get([_this.FOLDER_TOKENS_KEY], function (data) {
                                    if (browserAPI_1.runtime.lastError) {
                                        reject(browserAPI_1.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 4:
                        result = _a.sent();
                        accumulator_1 = result[this.FOLDER_TOKENS_KEY] || {};
                        currentTokens = accumulator_1[folderPath] || {
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0,
                        };
                        newPromptTokens = currentTokens.prompt_tokens + prompt_tokens;
                        newCompletionTokens = currentTokens.completion_tokens + completion_tokens;
                        newTotalTokens = currentTokens.total_tokens + total_tokens;
                        // 🔥 CRITICAL: Validate calculation
                        if (newTotalTokens !== newPromptTokens + newCompletionTokens) {
                            console.error("[TokenAccumulation] \u274C CALCULATION ERROR! total_tokens mismatch!");
                            console.error("[TokenAccumulation]   - Expected: ".concat(newPromptTokens + newCompletionTokens));
                            console.error("[TokenAccumulation]   - Got: ".concat(newTotalTokens));
                        }
                        accumulator_1[folderPath] = {
                            prompt_tokens: newPromptTokens,
                            completion_tokens: newCompletionTokens,
                            total_tokens: newTotalTokens,
                            lastUpdated: Date.now(),
                        };
                        // Save lại
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                browserAPI_1.storage.session.set((_a = {}, _a[_this.FOLDER_TOKENS_KEY] = accumulator_1, _a), function () {
                                    if (browserAPI_1.runtime.lastError) {
                                        reject(browserAPI_1.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 5:
                        // Save lại
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 6:
                        error_1 = _a.sent();
                        console.error("[PromptController] \u274C Error saving tokens for folder:", error_1);
                        return [3 /*break*/, 8];
                    case 7:
                        // 🔓 CRITICAL: Release lock
                        this.folderTokenMutex.delete(folderPath);
                        releaseLock();
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🆕 Get accumulated tokens cho một folder_path
     */
    PromptController.getTokensForFolder = function (folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var browserAPI_2, result, accumulator, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        browserAPI_2 = (0, browser_helper_1.getBrowserAPI)();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                browserAPI_2.storage.session.get([_this.FOLDER_TOKENS_KEY], function (data) {
                                    if (browserAPI_2.runtime.lastError) {
                                        reject(browserAPI_2.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        accumulator = result[this.FOLDER_TOKENS_KEY] || {};
                        return [2 /*return*/, accumulator[folderPath] || null];
                    case 2:
                        error_2 = _a.sent();
                        console.error("[PromptController] \u274C Error getting tokens for folder:", error_2);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🆕 Clear accumulated tokens cho một folder_path
     */
    PromptController.clearTokensForFolder = function (folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var browserAPI_3, result, accumulator_2, error_3;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        browserAPI_3 = (0, browser_helper_1.getBrowserAPI)();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                browserAPI_3.storage.session.get([_this.FOLDER_TOKENS_KEY], function (data) {
                                    if (browserAPI_3.runtime.lastError) {
                                        reject(browserAPI_3.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        accumulator_2 = result[this.FOLDER_TOKENS_KEY] || {};
                        if (!accumulator_2[folderPath]) return [3 /*break*/, 3];
                        delete accumulator_2[folderPath];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                browserAPI_3.storage.session.set((_a = {}, _a[_this.FOLDER_TOKENS_KEY] = accumulator_2, _a), function () {
                                    if (browserAPI_3.runtime.lastError) {
                                        reject(browserAPI_3.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [3 /*break*/, 5];
                    case 4:
                        error_3 = _a.sent();
                        console.error("[PromptController] \u274C Error clearing tokens for folder:", error_3);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Combine system prompt, user prompt với language và text wrap rules
     * 🆕 OPTIMIZATION: Chỉ thêm rules cho request ĐẦU TIÊN (khi có systemPrompt)
     */
    PromptController.buildFinalPrompt = function (systemPrompt, userPrompt) {
        // 🆕 Request ĐẦU TIÊN: systemPrompt + rules + userPrompt
        if (systemPrompt) {
            return "".concat(systemPrompt, "\n\n").concat(this.LANGUAGE_RULE, "\n\n").concat(this.CLARIFICATION_RULE, "\n\n").concat(this.TEXT_WRAP_RULE, "\n\nUSER REQUEST:\n").concat(userPrompt);
        }
        // 🆕 Request THỨ 2 TRỞ ĐI: chỉ userPrompt (đã chứa environment_details, open tabs, etc.)
        return userPrompt;
    };
    PromptController.validateTab = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var browserAPI_4, tab, tabState, retryTabState, fallbackError_1, error_4;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 8, , 9]);
                        browserAPI_4 = (0, browser_helper_1.getBrowserAPI)();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var startTime = Date.now();
                                browserAPI_4.tabs.get(tabId, function (result) {
                                    var endTime = Date.now();
                                    var duration = endTime - startTime;
                                    if (browserAPI_4.runtime.lastError) {
                                        console.error("[PromptController] \u274C TAB ".concat(tabId, " GET ERROR:"), browserAPI_4.runtime.lastError);
                                        console.error("[PromptController] \uD83D\uDCCD Error details:", JSON.stringify(browserAPI_4.runtime.lastError, null, 2));
                                        reject(new Error("Invalid tab ID: ".concat(tabId)));
                                        return;
                                    }
                                    if (!result) {
                                        console.error("[PromptController] \u274C Tab ".concat(tabId, " not found"));
                                        console.error("[PromptController] \uD83D\uDD0D Callback result:", typeof result, result);
                                        reject(new Error("Tab not found: ".concat(tabId)));
                                        return;
                                    }
                                    resolve(result);
                                });
                            })];
                    case 1:
                        tab = _b.sent();
                        if (!((_a = tab.url) === null || _a === void 0 ? void 0 : _a.startsWith("https://chat.deepseek.com"))) {
                            console.error("[PromptController] \u274C Tab is not DeepSeek page:", {
                                tabId: tabId,
                                url: tab.url,
                            });
                            return [2 /*return*/, {
                                    isValid: false,
                                    error: "Tab is not DeepSeek page: ".concat(tab.url),
                                }];
                        }
                        return [4 /*yield*/, this.tabStateManager.getTabState(tabId)];
                    case 2:
                        tabState = _b.sent();
                        if (!!tabState) return [3 /*break*/, 7];
                        console.warn("[PromptController] \u26A0\uFE0F Tab state not found, attempting fallback initialization...");
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, this.tabStateManager.initializeNewTab(tabId)];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, this.tabStateManager.getTabState(tabId)];
                    case 5:
                        retryTabState = _b.sent();
                        if (retryTabState) {
                            if (retryTabState.status !== "free") {
                                console.error("[PromptController] \u274C Tab status is not 'free' after fallback:", {
                                    tabId: tabId,
                                    status: retryTabState.status,
                                });
                                return [2 /*return*/, {
                                        isValid: false,
                                        error: "Tab ".concat(tabId, " is currently ").concat(retryTabState.status, " (after fallback init)"),
                                    }];
                            }
                            return [2 /*return*/, { isValid: true }];
                        }
                        else {
                            console.error("[PromptController] \u274C Fallback initialization failed, still no state for tab ".concat(tabId));
                            return [2 /*return*/, {
                                    isValid: false,
                                    error: "Tab ".concat(tabId, " state not found even after fallback initialization"),
                                }];
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        fallbackError_1 = _b.sent();
                        console.error("[PromptController] \u274C Fallback initialization error:", fallbackError_1);
                        return [2 /*return*/, {
                                isValid: false,
                                error: "Failed to initialize tab ".concat(tabId, ": ").concat(fallbackError_1 instanceof Error
                                    ? fallbackError_1.message
                                    : String(fallbackError_1)),
                            }];
                    case 7:
                        if (tabState.status !== "free") {
                            console.error("[PromptController] \u274C Tab status is not 'free':", {
                                tabId: tabId,
                                status: tabState.status,
                                canAcceptRequest: false,
                            });
                            return [2 /*return*/, {
                                    isValid: false,
                                    error: "Tab ".concat(tabId, " is currently ").concat(tabState.status),
                                }];
                        }
                        return [2 /*return*/, { isValid: true }];
                    case 8:
                        error_4 = _b.sent();
                        console.error("[PromptController] \u274C Validation exception:", error_4);
                        return [2 /*return*/, {
                                isValid: false,
                                error: error_4 instanceof Error
                                    ? error_4.message
                                    : "Unknown error validating tab ".concat(tabId),
                            }];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gửi prompt tới DeepSeek tab và đợi response
     * @param tabId - ID của tab DeepSeek
     * @param promptOrSystemPrompt - Final prompt HOẶC system prompt (nếu có userPrompt)
     * @param userPromptOrRequestId - User prompt HOẶC requestId (nếu chỉ có 1 prompt)
     * @param requestIdOrIsNewTask - RequestId HOẶC isNewTask flag
     * @param isNewTask - Flag để tạo chat mới (optional)
     */
    PromptController.sendPrompt = function (tabId, promptOrSystemPrompt, userPromptOrRequestId, requestIdOrIsNewTask, isNewTask) {
        return __awaiter(this, void 0, void 0, function () {
            var finalPrompt, requestId, isNewTaskFlag, systemPrompt, userPrompt, validation, browserAPI_5, messagesResult, wsMessages, targetConnectionId_1, _i, _a, _b, connId, msgArray, msgs, matchingMsg, validationErrorData_1, notifyError_1, retries, result, injectError_1, clickResult, clickTimestamp, error_5;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        finalPrompt = "";
                        requestId = "unknown";
                        isNewTaskFlag = false;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 28, , 29]);
                        if (typeof requestIdOrIsNewTask === "string") {
                            systemPrompt = promptOrSystemPrompt;
                            userPrompt = userPromptOrRequestId;
                            requestId = requestIdOrIsNewTask;
                            isNewTaskFlag = isNewTask === true;
                            finalPrompt = this.buildFinalPrompt(systemPrompt, userPrompt);
                        }
                        else {
                            finalPrompt = promptOrSystemPrompt;
                            requestId = userPromptOrRequestId;
                            isNewTaskFlag = requestIdOrIsNewTask === true;
                        }
                        return [4 /*yield*/, this.validateTab(tabId)];
                    case 2:
                        validation = _c.sent();
                        if (!!validation.isValid) return [3 /*break*/, 8];
                        console.error("[PromptController] \u274C Tab validation FAILED");
                        console.error("[PromptController] \uD83D\uDCCD Error details:", {
                            tabId: tabId,
                            error: validation.error,
                            requestId: requestId,
                        });
                        console.error("[PromptController] \uD83D\uDCA1 This means:");
                        console.error("  - Tab kh\u00F4ng t\u1ED3n t\u1EA1i HO\u1EB6C");
                        console.error("  - Tab kh\u00F4ng ph\u1EA3i DeepSeek page HO\u1EB6C");
                        console.error("  - Tab state kh\u00F4ng h\u1EE3p l\u1EC7 (status !== 'free')");
                        browserAPI_5 = (0, browser_helper_1.getBrowserAPI)();
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                browserAPI_5.storage.local.get(["wsMessages"], function (data) {
                                    if (browserAPI_5.runtime.lastError) {
                                        reject(browserAPI_5.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 4:
                        messagesResult = _c.sent();
                        wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                        targetConnectionId_1 = null;
                        // Tìm connectionId từ original sendPrompt message
                        for (_i = 0, _a = Object.entries(wsMessages); _i < _a.length; _i++) {
                            _b = _a[_i], connId = _b[0], msgArray = _b[1];
                            msgs = msgArray;
                            matchingMsg = msgs.find(function (msg) {
                                var _a, _b;
                                return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                    ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                            });
                            if (matchingMsg) {
                                targetConnectionId_1 = connId;
                                break;
                            }
                        }
                        if (!targetConnectionId_1) {
                            console.error("[PromptController] ❌ Cannot find connectionId for request:", requestId);
                            return [2 /*return*/, false];
                        }
                        validationErrorData_1 = {
                            type: "promptResponse",
                            requestId: requestId,
                            tabId: tabId,
                            success: false,
                            error: validation.error || "Tab validation failed",
                            errorType: "VALIDATION_FAILED",
                            timestamp: Date.now(),
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                browserAPI_5.storage.local.set({
                                    wsOutgoingMessage: {
                                        connectionId: targetConnectionId_1,
                                        data: validationErrorData_1,
                                        timestamp: Date.now(),
                                    },
                                }, function () {
                                    if (browserAPI_5.runtime.lastError) {
                                        reject(browserAPI_5.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 5:
                        _c.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        notifyError_1 = _c.sent();
                        console.error("[PromptController] \u274C Failed to notify Backend:", notifyError_1);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/, false];
                    case 8: return [4 /*yield*/, this.tabStateManager.markTabBusy(tabId, requestId)];
                    case 9:
                        _c.sent();
                        if (!(isNewTaskFlag === true)) return [3 /*break*/, 12];
                        return [4 /*yield*/, chat_controller_1.ChatController.clickNewChatButton(tabId)];
                    case 10:
                        _c.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 11:
                        _c.sent();
                        _c.label = 12;
                    case 12:
                        retries = 3;
                        result = null;
                        _c.label = 13;
                    case 13:
                        if (!(retries > 0 && !result)) return [3 /*break*/, 20];
                        _c.label = 14;
                    case 14:
                        _c.trys.push([14, 16, , 19]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function (text) {
                                var _a;
                                var textarea = document.querySelector('textarea[placeholder="Message DeepSeek"]');
                                if (!textarea) {
                                    return {
                                        success: false,
                                        step: "textarea_not_found",
                                        debug: {
                                            textareaExists: false,
                                            allTextareas: document.querySelectorAll("textarea").length,
                                            location: window.location.href,
                                        },
                                    };
                                }
                                // Step 1: Focus textarea
                                textarea.focus();
                                // Step 2: Set value
                                textarea.value = text;
                                // Step 3: Create proper InputEvent with data property
                                var inputEvent = new InputEvent("input", {
                                    bubbles: true,
                                    cancelable: true,
                                    data: text,
                                    inputType: "insertText",
                                });
                                textarea.dispatchEvent(inputEvent);
                                // Step 4: Dispatch change event
                                var changeEvent = new Event("change", { bubbles: true });
                                textarea.dispatchEvent(changeEvent);
                                // Step 5: Trigger React's internal event system
                                var nativeInputValueSetter = (_a = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")) === null || _a === void 0 ? void 0 : _a.set;
                                if (nativeInputValueSetter) {
                                    nativeInputValueSetter.call(textarea, text);
                                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                                }
                                return {
                                    success: true,
                                    step: "textarea_filled",
                                    debug: {
                                        textareaExists: true,
                                        textareaValue: textarea.value.substring(0, 50),
                                        textareaDisabled: textarea.disabled,
                                        textareaReadOnly: textarea.readOnly,
                                        textareaFocused: document.activeElement === textarea,
                                    },
                                };
                            }, [finalPrompt])];
                    case 15:
                        result = _c.sent();
                        if (result && result.success) {
                            return [3 /*break*/, 20];
                        }
                        return [3 /*break*/, 19];
                    case 16:
                        injectError_1 = _c.sent();
                        console.error("[PromptController] \u274C Textarea fill attempt ".concat(4 - retries, "/3 failed:"), injectError_1);
                        retries--;
                        if (!(retries > 0)) return [3 /*break*/, 18];
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                    case 17:
                        _c.sent();
                        _c.label = 18;
                    case 18: return [3 /*break*/, 19];
                    case 19: return [3 /*break*/, 13];
                    case 20:
                        if (!(!result || !result.success)) return [3 /*break*/, 22];
                        console.error("[PromptController] \u274C All textarea fill attempts failed - marking tab FREE for cleanup");
                        return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                    case 21:
                        _c.sent();
                        return [2 /*return*/, false];
                    case 22: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1500); })];
                    case 23:
                        _c.sent();
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var sendButton = document.querySelector(".ds-icon-button._7436101");
                                if (!sendButton) {
                                    console.error("[PromptController/Script] \u274C Send button NOT FOUND in DeepSeek page");
                                    return {
                                        success: false,
                                        reason: "button_not_found",
                                        debug: {
                                            buttonExists: false,
                                            allButtons: document.querySelectorAll(".ds-icon-button").length,
                                            specificButtons: document.querySelectorAll(".ds-icon-button._7436101").length,
                                        },
                                    };
                                }
                                var isDisabled = sendButton.classList.contains("ds-icon-button--disabled");
                                if (isDisabled) {
                                    // Try to trigger button enable by re-focusing textarea and dispatching events
                                    var textarea_1 = document.querySelector('textarea[placeholder="Message DeepSeek"]');
                                    if (textarea_1 && textarea_1.value) {
                                        // Re-focus and trigger events
                                        textarea_1.focus();
                                        textarea_1.blur();
                                        textarea_1.focus();
                                        // Dispatch multiple events to trigger validation
                                        var events = [
                                            new Event("input", { bubbles: true }),
                                            new Event("change", { bubbles: true }),
                                            new Event("keyup", { bubbles: true }),
                                            new Event("keydown", { bubbles: true }),
                                        ];
                                        events.forEach(function (event) { return textarea_1.dispatchEvent(event); });
                                        // Check button state again after short delay
                                        var checkAfterMs_1 = 500;
                                        return new Promise(function (resolve) {
                                            setTimeout(function () {
                                                var stillDisabled = sendButton.classList.contains("ds-icon-button--disabled");
                                                if (stillDisabled) {
                                                    resolve({
                                                        success: false,
                                                        reason: "button_still_disabled_after_retry",
                                                        debug: {
                                                            buttonExists: true,
                                                            isDisabled: true,
                                                            classList: Array.from(sendButton.classList),
                                                            textareaValue: textarea_1.value.substring(0, 50),
                                                            textareaFocused: document.activeElement === textarea_1,
                                                        },
                                                    });
                                                }
                                                else {
                                                    // Button enabled, click it
                                                    sendButton.click();
                                                    resolve({
                                                        success: true,
                                                        debug: {
                                                            buttonExists: true,
                                                            isDisabled: false,
                                                            clicked: true,
                                                            retriedEvents: true,
                                                        },
                                                    });
                                                }
                                            }, checkAfterMs_1);
                                        });
                                    }
                                    return {
                                        success: false,
                                        reason: "button_disabled",
                                        debug: {
                                            buttonExists: true,
                                            isDisabled: true,
                                            classList: Array.from(sendButton.classList),
                                            textareaExists: !!textarea_1,
                                            textareaValue: (textarea_1 === null || textarea_1 === void 0 ? void 0 : textarea_1.value.substring(0, 50)) || "N/A",
                                        },
                                    };
                                }
                                sendButton.click();
                                return {
                                    success: true,
                                    debug: {
                                        buttonExists: true,
                                        isDisabled: false,
                                        clicked: true,
                                    },
                                };
                            })];
                    case 24:
                        clickResult = _c.sent();
                        if (!(clickResult && clickResult.success)) return [3 /*break*/, 25];
                        clickTimestamp = Date.now();
                        this.monitorButtonStateUntilComplete(tabId, requestId, clickTimestamp);
                        return [3 /*break*/, 27];
                    case 25:
                        console.error("[PromptController] \u274C Send button click failed - marking tab FREE");
                        console.error("[PromptController] \uD83D\uDCA1 Click result:", clickResult);
                        console.error("[PromptController] \uD83D\uDCA1 Hint: Button may be disabled due to DeepSeek UI validation or tab is currently processing another request.");
                        // 🔥 CRITICAL FIX: Mark tab FREE VÀ cleanup active polling
                        this.activePollingTasks.delete(tabId);
                        return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                    case 26:
                        _c.sent();
                        return [2 /*return*/, false];
                    case 27:
                        this.activePollingTasks.set(tabId, requestId);
                        this.startResponsePolling(tabId, requestId, finalPrompt);
                        return [2 /*return*/, true];
                    case 28:
                        error_5 = _c.sent();
                        console.error("[PromptController] \u274C CRITICAL EXCEPTION in sendPrompt:", error_5);
                        console.error("[PromptController] \uD83D\uDCCD Exception occurred at: tabId=".concat(tabId, ", requestId=").concat(requestId || "unknown"));
                        console.error("[PromptController] \u2139\uFE0F Tab remains in current state (likely FREE if exception before button click)");
                        return [2 /*return*/, false];
                    case 29: return [2 /*return*/];
                }
            });
        });
    };
    PromptController.monitorButtonStateUntilComplete = function (tabId, _requestId, _clickTimestamp) {
        return __awaiter(this, void 0, void 0, function () {
            var maxChecks, checkCount, wasGenerating, checkState;
            var _this = this;
            return __generator(this, function (_a) {
                maxChecks = 180;
                checkCount = 0;
                wasGenerating = false;
                checkState = function () { return __awaiter(_this, void 0, void 0, function () {
                    var buttonState, error_6;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                checkCount++;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                        var sendButton = document.querySelector(".ds-icon-button._7436101");
                                        if (!sendButton) {
                                            return { found: false };
                                        }
                                        var isDisabled = sendButton.classList.contains("ds-icon-button--disabled") ||
                                            sendButton.getAttribute("aria-disabled") === "true";
                                        var hasStopIcon = sendButton.classList.contains("bcc55ca1");
                                        var svg = sendButton.querySelector("svg");
                                        var path = svg === null || svg === void 0 ? void 0 : svg.querySelector("path");
                                        var pathData = (path === null || path === void 0 ? void 0 : path.getAttribute("d")) || "";
                                        var isStopIconByPath = pathData.includes("M2 4.88006");
                                        var isSendIconByPath = pathData.includes("M8.3125 0.981648");
                                        return {
                                            found: true,
                                            isDisabled: isDisabled,
                                            hasStopIcon: hasStopIcon,
                                            ariaDisabled: sendButton.getAttribute("aria-disabled"),
                                            pathData: pathData.substring(0, 50),
                                            isStopIconByPath: isStopIconByPath,
                                            isSendIconByPath: isSendIconByPath,
                                        };
                                    })];
                            case 2:
                                buttonState = _a.sent();
                                if (!buttonState || !buttonState.found) {
                                    if (checkCount < maxChecks) {
                                        setTimeout(checkState, 1000);
                                    }
                                    return [2 /*return*/];
                                }
                                if (buttonState.isStopIconByPath && !buttonState.isDisabled) {
                                    wasGenerating = true;
                                }
                                if (wasGenerating &&
                                    buttonState.isSendIconByPath &&
                                    buttonState.isDisabled) {
                                    return [2 /*return*/];
                                }
                                if (checkCount < maxChecks) {
                                    setTimeout(checkState, 1000);
                                }
                                return [3 /*break*/, 4];
                            case 3:
                                error_6 = _a.sent();
                                if (checkCount < maxChecks) {
                                    setTimeout(checkState, 1000);
                                }
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); };
                setTimeout(checkState, 1000);
                return [2 /*return*/];
            });
        });
    };
    PromptController.startResponsePolling = function (tabId_1, requestId_1) {
        return __awaiter(this, arguments, void 0, function (tabId, requestId, originalPrompt) {
            var capturedRequestId, isTestRequest, browserAPI, pollCount, responseSent, poll;
            var _this = this;
            if (originalPrompt === void 0) { originalPrompt = ""; }
            return __generator(this, function (_a) {
                capturedRequestId = requestId;
                isTestRequest = requestId.startsWith("test-");
                browserAPI = (0, browser_helper_1.getBrowserAPI)();
                pollCount = 0;
                responseSent = false;
                poll = function () { return __awaiter(_this, void 0, void 0, function () {
                    var currentActiveRequest, isGenerating, hasContinueButton, folderPathToLink, messagesResult, wsMessages, _i, _a, _b, msgArray, msgs, matchingMsg, error_7, tabState, fallbackError_2, errorContent, errorResponse, responseToSend, responseData_1, messagesResult, wsMessages, targetConnectionId_2, _c, _d, _e, connId, msgArray, msgs, matchingMsg, sendError_1, rawResponse, folderPathToLink, messagesResult, wsMessages, _f, _g, _h, msgArray, msgs, matchingMsg, error_8, tabState, fallbackError_3, currentPromptTokens, currentCompletionTokens, currentTotalTokens, freeSuccess, responseToSend, parsedObject, builtResponse, builtResponse, parseError_1, builtResponse, responseObj, builtResponse, builtResponse, responseData_2, messagesResult, wsMessages, targetConnectionId_3, _j, _k, _l, connId, msgArray, msgs, matchingMsg, sendError_2, parsedResponse, contentField, errorData_1, messagesResult, wsMessages, targetConnectionId_4, _m, _o, _p, connId, msgArray, msgs, matchingMsg, sendError_3, nextPollDelay, timeoutData_1, messagesResult, wsMessages, targetConnectionId_5, _q, _r, _s, connId, msgArray, msgs, matchingMsg, sendError_4, error_9, errorMessage, exceptionData_1, messagesResult, wsMessages, targetConnectionId_6, _t, _u, _v, connId, msgArray, msgs, matchingMsg, sendError_5;
                    var _w, _x, _y, _z, _0;
                    var _1, _2, _3, _4, _5;
                    return __generator(this, function (_6) {
                        switch (_6.label) {
                            case 0:
                                pollCount++;
                                currentActiveRequest = this.activePollingTasks.get(tabId);
                                if (currentActiveRequest !== capturedRequestId) {
                                    return [2 /*return*/];
                                }
                                if (responseSent) {
                                    return [2 /*return*/];
                                }
                                pollCount++;
                                _6.label = 1;
                            case 1:
                                _6.trys.push([1, 90, , 100]);
                                return [4 /*yield*/, state_controller_1.StateController.isGenerating(tabId)];
                            case 2:
                                isGenerating = _6.sent();
                                if (!(!isGenerating && pollCount >= 3)) return [3 /*break*/, 79];
                                if (responseSent) {
                                    return [2 /*return*/];
                                }
                                return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                        var _a;
                                        var continueButton = document.querySelector('button.ds-basic-button.ds-basic-button--outlined[role="button"]');
                                        if (!continueButton) {
                                            return false;
                                        }
                                        var buttonText = ((_a = continueButton.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || "";
                                        return buttonText === "Continue";
                                    })];
                            case 3:
                                hasContinueButton = _6.sent();
                                if (!hasContinueButton) return [3 /*break*/, 26];
                                folderPathToLink = null;
                                _6.label = 4;
                            case 4:
                                _6.trys.push([4, 6, , 7]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 5:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                for (_i = 0, _a = Object.entries(wsMessages); _i < _a.length; _i++) {
                                    _b = _a[_i], msgArray = _b[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) { var _a; return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === capturedRequestId; });
                                    if (matchingMsg) {
                                        if ((_1 = matchingMsg.data) === null || _1 === void 0 ? void 0 : _1.folderPath) {
                                            folderPathToLink = matchingMsg.data.folderPath;
                                        }
                                        break;
                                    }
                                }
                                return [3 /*break*/, 7];
                            case 6:
                                error_7 = _6.sent();
                                console.error("[PromptController] ❌ Failed to get folderPath from wsMessages:", error_7);
                                return [3 /*break*/, 7];
                            case 7:
                                if (!!folderPathToLink) return [3 /*break*/, 11];
                                console.warn("[PromptController] \u26A0\uFE0F folderPath not found in wsMessages for request ".concat(capturedRequestId, ", trying fallback..."));
                                _6.label = 8;
                            case 8:
                                _6.trys.push([8, 10, , 11]);
                                return [4 /*yield*/, this.tabStateManager.getTabState(tabId)];
                            case 9:
                                tabState = _6.sent();
                                if (tabState && tabState.folderPath) {
                                    folderPathToLink = tabState.folderPath;
                                }
                                else {
                                    console.warn("[PromptController] \u26A0\uFE0F Fallback failed: tab state has no folderPath. Tokens will NOT be accumulated!");
                                }
                                return [3 /*break*/, 11];
                            case 10:
                                fallbackError_2 = _6.sent();
                                console.error("[PromptController] \u274C Fallback error:", fallbackError_2);
                                return [3 /*break*/, 11];
                            case 11:
                                errorContent = "\u274C **L\u1ED6I: Response b\u1ECB c\u1EAFt c\u1EE5t b\u1EDFi DeepSeek**\n\n**Nguy\u00EAn nh\u00E2n:**\nDeepSeek \u0111\u00E3 d\u1EEBng response v\u00E0 y\u00EAu c\u1EA7u nh\u1EA5n \"Continue\" \u0111\u1EC3 ti\u1EBFp t\u1EE5c. \u0110i\u1EC1u n\u00E0y x\u1EA3y ra khi:\n- Response qu\u00E1 d\u00E0i v\u00E0 v\u01B0\u1EE3t qu\u00E1 gi\u1EDBi h\u1EA1n c\u1EE7a DeepSeek\n- DeepSeek ph\u00E1t hi\u1EC7n n\u1ED9i dung nh\u1EA1y c\u1EA3m ho\u1EB7c vi ph\u1EA1m ch\u00EDnh s\u00E1ch\n- C\u00F3 l\u1ED7i kh\u00F4ng mong mu\u1ED1n trong qu\u00E1 tr\u00ECnh generate\n\n**Khuy\u1EBFn ngh\u1ECB:**\n1. Chia nh\u1ECF task th\u00E0nh c\u00E1c ph\u1EA7n nh\u1ECF h\u01A1n\n2. Y\u00EAu c\u1EA7u response ng\u1EAFn g\u1ECDn h\u01A1n (tr\u00E1nh generate qu\u00E1 nhi\u1EC1u code m\u1ED9t l\u00FAc)\n3. Ki\u1EC3m tra l\u1EA1i n\u1ED9i dung prompt c\u00F3 vi ph\u1EA1m ch\u00EDnh s\u00E1ch c\u1EE7a DeepSeek kh\u00F4ng\n\n**Th\u1EDDi gian:** ".concat(new Date().toISOString(), "\n**Request ID:** ").concat(capturedRequestId, "\n**Tab ID:** ").concat(tabId);
                                return [4 /*yield*/, this.buildOpenAIResponse(errorContent, originalPrompt, folderPathToLink)];
                            case 12:
                                errorResponse = _6.sent();
                                responseSent = true;
                                this.activePollingTasks.delete(tabId);
                                if (!folderPathToLink) return [3 /*break*/, 14];
                                return [4 /*yield*/, this.tabStateManager.markTabFreeWithFolder(tabId, folderPathToLink)];
                            case 13:
                                _6.sent();
                                return [3 /*break*/, 16];
                            case 14: return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                            case 15:
                                _6.sent();
                                _6.label = 16;
                            case 16: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                            case 17:
                                _6.sent();
                                responseToSend = JSON.stringify(errorResponse);
                                if (!isTestRequest) return [3 /*break*/, 19];
                                return [4 /*yield*/, browserAPI.storage.local.set((_w = {},
                                        _w["testResponse_".concat(tabId)] = {
                                            requestId: capturedRequestId,
                                            response: responseToSend,
                                            error: "CONTINUE_BUTTON_DETECTED",
                                            timestamp: Date.now(),
                                        },
                                        _w))];
                            case 18:
                                _6.sent();
                                this.activePollingTasks.delete(tabId);
                                return [2 /*return*/];
                            case 19:
                                responseData_1 = {
                                    type: "promptResponse",
                                    requestId: requestId,
                                    tabId: tabId,
                                    success: true,
                                    response: responseToSend,
                                    errorType: "CONTINUE_BUTTON_DETECTED",
                                    timestamp: Date.now(),
                                };
                                _6.label = 20;
                            case 20:
                                _6.trys.push([20, 24, , 25]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 21:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                targetConnectionId_2 = null;
                                for (_c = 0, _d = Object.entries(wsMessages); _c < _d.length; _c++) {
                                    _e = _d[_c], connId = _e[0], msgArray = _e[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) {
                                        var _a, _b;
                                        return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                            ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                                    });
                                    if (matchingMsg) {
                                        targetConnectionId_2 = connId;
                                        break;
                                    }
                                }
                                if (!targetConnectionId_2) return [3 /*break*/, 23];
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: targetConnectionId_2,
                                                data: responseData_1,
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 22:
                                _6.sent();
                                _6.label = 23;
                            case 23: return [3 /*break*/, 25];
                            case 24:
                                sendError_1 = _6.sent();
                                console.error("[PromptController] ❌ Exception sending error response:", sendError_1);
                                return [3 /*break*/, 25];
                            case 25:
                                this.activePollingTasks.delete(tabId);
                                return [2 /*return*/];
                            case 26: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                            case 27:
                                _6.sent();
                                return [4 /*yield*/, this.getLatestResponseDirectly(tabId)];
                            case 28:
                                rawResponse = _6.sent();
                                if (!rawResponse) return [3 /*break*/, 68];
                                responseSent = true;
                                this.activePollingTasks.delete(tabId);
                                folderPathToLink = null;
                                _6.label = 29;
                            case 29:
                                _6.trys.push([29, 31, , 32]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 30:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                for (_f = 0, _g = Object.entries(wsMessages); _f < _g.length; _f++) {
                                    _h = _g[_f], msgArray = _h[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) { var _a; return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === capturedRequestId; });
                                    if (matchingMsg) {
                                        // 🆕 Extract folderPath
                                        if ((_2 = matchingMsg.data) === null || _2 === void 0 ? void 0 : _2.folderPath) {
                                            folderPathToLink = matchingMsg.data.folderPath;
                                        }
                                        break;
                                    }
                                }
                                return [3 /*break*/, 32];
                            case 31:
                                error_8 = _6.sent();
                                console.error("[PromptController] ❌ Failed to get folderPath from wsMessages:", error_8);
                                return [3 /*break*/, 32];
                            case 32:
                                if (!!folderPathToLink) return [3 /*break*/, 36];
                                console.warn("[PromptController] \u26A0\uFE0F folderPath not found in wsMessages for request ".concat(capturedRequestId, ", trying fallback..."));
                                _6.label = 33;
                            case 33:
                                _6.trys.push([33, 35, , 36]);
                                return [4 /*yield*/, this.tabStateManager.getTabState(tabId)];
                            case 34:
                                tabState = _6.sent();
                                if (tabState && tabState.folderPath) {
                                    folderPathToLink = tabState.folderPath;
                                }
                                else {
                                    console.warn("[PromptController] \u26A0\uFE0F Fallback failed: tab state has no folderPath. Tokens will NOT be accumulated!");
                                }
                                return [3 /*break*/, 36];
                            case 35:
                                fallbackError_3 = _6.sent();
                                console.error("[PromptController] \u274C Fallback error:", fallbackError_3);
                                return [3 /*break*/, 36];
                            case 36:
                                currentPromptTokens = this.calculateTokensAndLog(originalPrompt, "CURRENT_REQUEST_PROMPT");
                                currentCompletionTokens = this.calculateTokensAndLog(typeof rawResponse === "string"
                                    ? rawResponse
                                    : JSON.stringify(rawResponse), "CURRENT_REQUEST_COMPLETION");
                                currentTotalTokens = currentPromptTokens + currentCompletionTokens;
                                if (!folderPathToLink) return [3 /*break*/, 40];
                                return [4 /*yield*/, this.saveTokensForFolder(folderPathToLink, currentPromptTokens, currentCompletionTokens, currentTotalTokens)];
                            case 37:
                                _6.sent();
                                return [4 /*yield*/, this.getTokensForFolder(folderPathToLink)];
                            case 38:
                                _6.sent();
                                return [4 /*yield*/, this.tabStateManager.markTabFreeWithFolder(tabId, folderPathToLink)];
                            case 39:
                                freeSuccess = _6.sent();
                                if (!freeSuccess) {
                                    console.error("[PromptController] \u274C Failed to mark tab free with folder, aborting response");
                                    return [2 /*return*/];
                                }
                                return [3 /*break*/, 42];
                            case 40: return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                            case 41:
                                _6.sent();
                                _6.label = 42;
                            case 42: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                            case 43:
                                _6.sent();
                                responseToSend = "";
                                if (!(typeof rawResponse === "string")) return [3 /*break*/, 54];
                                _6.label = 44;
                            case 44:
                                _6.trys.push([44, 51, , 53]);
                                parsedObject = JSON.parse(rawResponse);
                                if (!(parsedObject &&
                                    typeof parsedObject === "object" &&
                                    parsedObject.choices)) return [3 /*break*/, 48];
                                if (!folderPathToLink) return [3 /*break*/, 46];
                                return [4 /*yield*/, this.buildOpenAIResponse(rawResponse, originalPrompt, folderPathToLink)];
                            case 45:
                                builtResponse = _6.sent();
                                responseToSend = JSON.stringify(builtResponse);
                                return [3 /*break*/, 47];
                            case 46:
                                responseToSend = JSON.stringify(parsedObject);
                                _6.label = 47;
                            case 47: return [3 /*break*/, 50];
                            case 48: return [4 /*yield*/, this.buildOpenAIResponse(rawResponse, originalPrompt, folderPathToLink)];
                            case 49:
                                builtResponse = _6.sent();
                                responseToSend = JSON.stringify(builtResponse);
                                _6.label = 50;
                            case 50: return [3 /*break*/, 53];
                            case 51:
                                parseError_1 = _6.sent();
                                return [4 /*yield*/, this.buildOpenAIResponse(rawResponse, originalPrompt, folderPathToLink)];
                            case 52:
                                builtResponse = _6.sent();
                                responseToSend = JSON.stringify(builtResponse);
                                return [3 /*break*/, 53];
                            case 53: return [3 /*break*/, 60];
                            case 54:
                                if (!(typeof rawResponse === "object" &&
                                    rawResponse !== null)) return [3 /*break*/, 58];
                                responseObj = rawResponse;
                                if (!responseObj.choices) return [3 /*break*/, 55];
                                responseToSend = JSON.stringify(responseObj);
                                return [3 /*break*/, 57];
                            case 55: return [4 /*yield*/, this.buildOpenAIResponse(JSON.stringify(responseObj), originalPrompt, folderPathToLink)];
                            case 56:
                                builtResponse = _6.sent();
                                responseToSend = JSON.stringify(builtResponse);
                                _6.label = 57;
                            case 57: return [3 /*break*/, 60];
                            case 58: return [4 /*yield*/, this.buildOpenAIResponse(String(rawResponse), originalPrompt, folderPathToLink)];
                            case 59:
                                builtResponse = _6.sent();
                                responseToSend = JSON.stringify(builtResponse);
                                _6.label = 60;
                            case 60:
                                if (!isTestRequest) return [3 /*break*/, 62];
                                return [4 /*yield*/, browserAPI.storage.local.set((_x = {},
                                        _x["testResponse_".concat(tabId)] = {
                                            requestId: capturedRequestId,
                                            response: responseToSend,
                                            timestamp: Date.now(),
                                        },
                                        _x))];
                            case 61:
                                _6.sent();
                                this.activePollingTasks.delete(tabId);
                                return [2 /*return*/];
                            case 62:
                                responseData_2 = {
                                    type: "promptResponse",
                                    requestId: requestId,
                                    tabId: tabId,
                                    success: true,
                                    response: responseToSend,
                                    timestamp: Date.now(),
                                };
                                _6.label = 63;
                            case 63:
                                _6.trys.push([63, 66, , 67]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 64:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                targetConnectionId_3 = null;
                                // Tìm connectionId từ original sendPrompt message
                                for (_j = 0, _k = Object.entries(wsMessages); _j < _k.length; _j++) {
                                    _l = _k[_j], connId = _l[0], msgArray = _l[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) {
                                        var _a, _b;
                                        return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                            ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                                    });
                                    if (matchingMsg) {
                                        targetConnectionId_3 = connId;
                                        break;
                                    }
                                }
                                if (!targetConnectionId_3) {
                                    console.error("[PromptController] ❌ Cannot find connectionId for request:", requestId);
                                    return [2 /*return*/];
                                }
                                // Gửi response qua wsOutgoingMessage
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: targetConnectionId_3,
                                                data: responseData_2,
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 65:
                                // Gửi response qua wsOutgoingMessage
                                _6.sent();
                                return [3 /*break*/, 67];
                            case 66:
                                sendError_2 = _6.sent();
                                console.error("[PromptController] ❌ Exception sending response:", sendError_2);
                                return [3 /*break*/, 67];
                            case 67:
                                // LOG: Extract và log field "content" từ response JSON
                                try {
                                    parsedResponse = JSON.parse(responseToSend);
                                    contentField = ((_5 = (_4 = (_3 = parsedResponse === null || parsedResponse === void 0 ? void 0 : parsedResponse.choices) === null || _3 === void 0 ? void 0 : _3[0]) === null || _4 === void 0 ? void 0 : _4.delta) === null || _5 === void 0 ? void 0 : _5.content) || "";
                                    // Validation: Check nếu content rỗng hoặc quá ngắn
                                    if (contentField.length < 50) {
                                        console.error("[PromptController] \u26A0\uFE0F WARNING: Content field is suspiciously short (".concat(contentField.length, " chars)"));
                                        console.error("[PromptController] \uD83D\uDD0D Full responseToSend (first 1000 chars):\n".concat(responseToSend.substring(0, 1000)));
                                    }
                                }
                                catch (logError) {
                                    console.error("[PromptController] \u274C Failed to parse response for logging:", logError);
                                    console.error("[PromptController] \uD83D\uDD0D responseToSend value (first 1000 chars):\n".concat(responseToSend.substring(0, 1000)));
                                }
                                this.activePollingTasks.delete(tabId);
                                return [3 /*break*/, 78];
                            case 68: return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                            case 69:
                                _6.sent();
                                if (!isTestRequest) return [3 /*break*/, 71];
                                return [4 /*yield*/, browserAPI.storage.local.set((_y = {},
                                        _y["testResponse_".concat(tabId)] = {
                                            requestId: capturedRequestId,
                                            success: false,
                                            error: "Failed to fetch response from DeepSeek",
                                            timestamp: Date.now(),
                                        },
                                        _y))];
                            case 70:
                                _6.sent();
                                this.activePollingTasks.delete(tabId);
                                return [2 /*return*/];
                            case 71:
                                errorData_1 = {
                                    type: "promptResponse",
                                    requestId: requestId,
                                    tabId: tabId,
                                    success: false,
                                    error: "Failed to fetch response from DeepSeek",
                                    timestamp: Date.now(),
                                };
                                _6.label = 72;
                            case 72:
                                _6.trys.push([72, 76, , 77]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 73:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                targetConnectionId_4 = null;
                                for (_m = 0, _o = Object.entries(wsMessages); _m < _o.length; _m++) {
                                    _p = _o[_m], connId = _p[0], msgArray = _p[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) {
                                        var _a, _b;
                                        return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                            ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                                    });
                                    if (matchingMsg) {
                                        targetConnectionId_4 = connId;
                                        break;
                                    }
                                }
                                if (!targetConnectionId_4) return [3 /*break*/, 75];
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: targetConnectionId_4,
                                                data: errorData_1,
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 74:
                                _6.sent();
                                _6.label = 75;
                            case 75: return [3 /*break*/, 77];
                            case 76:
                                sendError_3 = _6.sent();
                                console.error("[PromptController] ❌ Exception sending error response:", sendError_3);
                                return [3 /*break*/, 77];
                            case 77:
                                this.activePollingTasks.delete(tabId);
                                _6.label = 78;
                            case 78: return [2 /*return*/];
                            case 79:
                                if (!(pollCount < this.config.maxPolls)) return [3 /*break*/, 80];
                                nextPollDelay = this.config.pollInterval;
                                setTimeout(poll, nextPollDelay);
                                return [3 /*break*/, 89];
                            case 80:
                                console.error("[PromptController] ⏱️ Timeout waiting for response, requestId:", capturedRequestId);
                                this.activePollingTasks.delete(tabId);
                                return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                            case 81:
                                _6.sent();
                                if (!isTestRequest) return [3 /*break*/, 83];
                                return [4 /*yield*/, browserAPI.storage.local.set((_z = {},
                                        _z["testResponse_".concat(tabId)] = {
                                            requestId: capturedRequestId,
                                            success: false,
                                            error: "Response timeout - AI took too long to respond",
                                            timestamp: Date.now(),
                                        },
                                        _z))];
                            case 82:
                                _6.sent();
                                return [2 /*return*/];
                            case 83:
                                timeoutData_1 = {
                                    type: "promptResponse",
                                    requestId: requestId,
                                    tabId: tabId,
                                    success: false,
                                    error: "Response timeout - AI took too long to respond",
                                    errorType: "TIMEOUT",
                                    timestamp: Date.now(),
                                };
                                _6.label = 84;
                            case 84:
                                _6.trys.push([84, 88, , 89]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 85:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                targetConnectionId_5 = null;
                                for (_q = 0, _r = Object.entries(wsMessages); _q < _r.length; _q++) {
                                    _s = _r[_q], connId = _s[0], msgArray = _s[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) {
                                        var _a, _b;
                                        return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                            ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                                    });
                                    if (matchingMsg) {
                                        targetConnectionId_5 = connId;
                                        break;
                                    }
                                }
                                if (!targetConnectionId_5) return [3 /*break*/, 87];
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: targetConnectionId_5,
                                                data: timeoutData_1,
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 86:
                                _6.sent();
                                _6.label = 87;
                            case 87: return [3 /*break*/, 89];
                            case 88:
                                sendError_4 = _6.sent();
                                console.error("[PromptController] ❌ Exception sending timeout response:", sendError_4);
                                return [3 /*break*/, 89];
                            case 89: return [3 /*break*/, 100];
                            case 90:
                                error_9 = _6.sent();
                                console.error("[PromptController] ❌ Exception in polling loop:", error_9);
                                this.activePollingTasks.delete(tabId);
                                return [4 /*yield*/, this.tabStateManager.markTabFree(tabId)];
                            case 91:
                                _6.sent();
                                if (!isTestRequest) return [3 /*break*/, 93];
                                return [4 /*yield*/, browserAPI.storage.local.set((_0 = {},
                                        _0["testResponse_".concat(tabId)] = {
                                            requestId: capturedRequestId,
                                            success: false,
                                            error: error_9 instanceof Error
                                                ? error_9.message
                                                : "Unknown polling error",
                                            timestamp: Date.now(),
                                        },
                                        _0))];
                            case 92:
                                _6.sent();
                                return [2 /*return*/];
                            case 93:
                                errorMessage = error_9 instanceof Error ? error_9.message : "Unknown polling error";
                                exceptionData_1 = {
                                    type: "promptResponse",
                                    requestId: requestId,
                                    tabId: tabId,
                                    success: false,
                                    error: errorMessage,
                                    timestamp: Date.now(),
                                };
                                _6.label = 94;
                            case 94:
                                _6.trys.push([94, 98, , 99]);
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.get(["wsMessages"], function (data) {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve(data || {});
                                        });
                                    })];
                            case 95:
                                messagesResult = _6.sent();
                                wsMessages = (messagesResult === null || messagesResult === void 0 ? void 0 : messagesResult.wsMessages) || {};
                                targetConnectionId_6 = null;
                                for (_t = 0, _u = Object.entries(wsMessages); _t < _u.length; _t++) {
                                    _v = _u[_t], connId = _v[0], msgArray = _v[1];
                                    msgs = msgArray;
                                    matchingMsg = msgs.find(function (msg) {
                                        var _a, _b;
                                        return ((_a = msg.data) === null || _a === void 0 ? void 0 : _a.requestId) === requestId &&
                                            ((_b = msg.data) === null || _b === void 0 ? void 0 : _b.type) === "sendPrompt";
                                    });
                                    if (matchingMsg) {
                                        targetConnectionId_6 = connId;
                                        break;
                                    }
                                }
                                if (!targetConnectionId_6) return [3 /*break*/, 97];
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: targetConnectionId_6,
                                                data: exceptionData_1,
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 96:
                                _6.sent();
                                _6.label = 97;
                            case 97: return [3 /*break*/, 99];
                            case 98:
                                sendError_5 = _6.sent();
                                console.error("[PromptController] ❌ Exception sending exception response:", sendError_5);
                                return [3 /*break*/, 99];
                            case 99: return [3 /*break*/, 100];
                            case 100: return [2 /*return*/];
                        }
                    });
                }); };
                setTimeout(poll, this.config.initialDelay);
                return [2 /*return*/];
            });
        });
    };
    PromptController.getLatestResponseDirectly = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var extractedContent, content, decodedResult, xmlFixedResult, unwrappedResult, artifactCleanedResult, cleanedResult, hasXmlTags, trimmed, jsonResponse, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                window.scrollTo({
                                    top: document.documentElement.scrollHeight,
                                    behavior: "smooth",
                                });
                                // Strategy 1: Tìm TẤT CẢ message containers với nhiều selectors
                                var possibleSelectors = [
                                    '[class*="message"]',
                                    '[class*="chat-message"]',
                                    '[class*="conversation"]',
                                    ".ds-markdown",
                                ];
                                var allMessages = [];
                                for (var _i = 0, possibleSelectors_1 = possibleSelectors; _i < possibleSelectors_1.length; _i++) {
                                    var selector = possibleSelectors_1[_i];
                                    var found = Array.from(document.querySelectorAll(selector));
                                    if (found.length > 0) {
                                        allMessages = found;
                                        break;
                                    }
                                }
                                if (allMessages.length === 0) {
                                    console.error("[DeepSeek Page] ❌ No message containers found with any selector");
                                    return null;
                                }
                                // Lọc ra CHỈ CÁC AI RESPONSES (chứa ds-markdown hoặc có content dài)
                                var aiResponses = allMessages.filter(function (msg) {
                                    var hasMarkdown = msg.querySelector(".ds-markdown") !== null;
                                    var hasContent = msg.classList && !msg.classList.contains("user");
                                    return hasMarkdown || hasContent;
                                });
                                if (aiResponses.length === 0) {
                                    console.error("[DeepSeek Page] ❌ No AI responses found");
                                    return null;
                                }
                                // Lấy AI response CUỐI CÙNG (response mới nhất)
                                var lastAIResponse = aiResponses[aiResponses.length - 1];
                                var lastMarkdown = lastAIResponse.querySelector(".ds-markdown") || lastAIResponse;
                                if (!lastMarkdown) {
                                    console.error("[DeepSeek Page] ❌ Last AI response missing markdown");
                                    return null;
                                }
                                // Tìm parent container chứa toàn bộ message
                                var messageContainer = lastMarkdown;
                                var parent = lastMarkdown.parentElement;
                                var level = 0;
                                while (parent && level < 5) {
                                    // ✅ Safe string conversion
                                    var parentClasses = String(parent.className || "");
                                    if (parentClasses.includes("message") ||
                                        parentClasses.includes("content") ||
                                        parentClasses.includes("assistant") ||
                                        parentClasses.includes("response")) {
                                        messageContainer = parent;
                                        break;
                                    }
                                    var childMarkdowns = parent.querySelectorAll(".ds-markdown");
                                    var parentText = parent.textContent || "";
                                    var containerText = messageContainer.textContent || "";
                                    if (childMarkdowns.length === 1 &&
                                        parentText.length > containerText.length) {
                                        messageContainer = parent;
                                    }
                                    parent = parent.parentElement;
                                    level++;
                                }
                                var extractMarkdown = function (element) {
                                    var result = "";
                                    var traverse = function (node) {
                                        var _a, _b;
                                        if (node.nodeType === Node.TEXT_NODE) {
                                            var text = node.textContent || "";
                                            // ✅ Ensure text is always string before using .includes()
                                            var safeText = String(text);
                                            if (safeText.includes("<task_progress>") ||
                                                safeText.includes("</task_progress>")) {
                                                result += safeText;
                                                return;
                                            }
                                            result += safeText;
                                        }
                                        else if (node.nodeType === Node.ELEMENT_NODE) {
                                            var el = node;
                                            var tag_1 = el.tagName.toLowerCase();
                                            // ✅ Safe string conversion
                                            var className = String(el.className || "");
                                            // CRITICAL: Xử lý đặc biệt cho ds-markdown-html spans (chứa XML tags)
                                            if (className.includes("ds-markdown-html")) {
                                                var htmlContent = String(el.textContent || "");
                                                // CRITICAL: Nếu là closing tag và không có newline trước nó
                                                // thì tự động thêm newline
                                                if (htmlContent.startsWith("</") && !result.endsWith("\n")) {
                                                    result += "\n";
                                                }
                                                result += htmlContent;
                                                return;
                                            }
                                            // Handle line breaks
                                            if (tag_1 === "br") {
                                                result += "\n";
                                                return;
                                            }
                                            // Handle code blocks
                                            if (tag_1 === "pre") {
                                                var codeEl = el.querySelector("code");
                                                if (codeEl) {
                                                    var lang = ((_a = codeEl.className.match(/language-(\w+)/)) === null || _a === void 0 ? void 0 : _a[1]) || "";
                                                    result += "```" + lang + "\n";
                                                    result += codeEl.textContent || "";
                                                    result += "\n```\n";
                                                }
                                                else {
                                                    result += "```\n";
                                                    result += el.textContent || "";
                                                    result += "\n```\n";
                                                }
                                                return;
                                            }
                                            // Handle inline code
                                            if (tag_1 === "code" &&
                                                ((_b = el.parentElement) === null || _b === void 0 ? void 0 : _b.tagName.toLowerCase()) !== "pre") {
                                                result += "`" + (el.textContent || "") + "`";
                                                return;
                                            }
                                            // Handle lists
                                            if (tag_1 === "ul" || tag_1 === "ol") {
                                                var items = Array.from(el.children);
                                                // CRITICAL: Kiểm tra xem list này có phải là task_progress không
                                                // Check previous sibling để tìm <task_progress> tag
                                                var isTaskProgressList_1 = false;
                                                var sibling = el.previousElementSibling;
                                                var checkCount = 0;
                                                // Check tối đa 3 sibling trước đó
                                                while (sibling && checkCount < 3) {
                                                    var siblingText = sibling.textContent || "";
                                                    if (siblingText.includes("<task_progress>") ||
                                                        siblingText.includes("&lt;task_progress&gt;")) {
                                                        isTaskProgressList_1 = true;
                                                        break;
                                                    }
                                                    sibling = sibling.previousElementSibling;
                                                    checkCount++;
                                                }
                                                items.forEach(function (item, index) {
                                                    if (item.tagName.toLowerCase() === "li") {
                                                        // CRITICAL: Kiểm tra checkbox trong li
                                                        var checkbox = item.querySelector('input[type="checkbox"]');
                                                        if (checkbox) {
                                                            // Task list item với checkbox thực
                                                            var isChecked = checkbox.checked;
                                                            result += isChecked ? "- [x] " : "- [ ] ";
                                                            // Extract text content, skipping the checkbox element
                                                            var textNodes_1 = [];
                                                            var extractText_1 = function (n) {
                                                                if (n.nodeType === Node.TEXT_NODE) {
                                                                    var text = (n.textContent || "").trim();
                                                                    if (text) {
                                                                        textNodes_1.push(text);
                                                                    }
                                                                }
                                                                else if (n.nodeType === Node.ELEMENT_NODE) {
                                                                    var elem = n;
                                                                    if (elem.tagName.toLowerCase() !== "input") {
                                                                        Array.from(elem.childNodes).forEach(extractText_1);
                                                                    }
                                                                }
                                                            };
                                                            Array.from(item.childNodes).forEach(extractText_1);
                                                            result += textNodes_1.join("").trim() + "\n";
                                                        }
                                                        else if (isTaskProgressList_1) {
                                                            // Task progress list WITHOUT checkbox element → force add "- [ ] "
                                                            result += "- [ ] ";
                                                            // Extract text content và trim để loại bỏ whitespace thừa
                                                            var itemText = (item.textContent || "")
                                                                .replace(/\s+/g, " ")
                                                                .trim();
                                                            result += itemText + "\n";
                                                        }
                                                        else {
                                                            // Regular list item (including lists inside <thinking>)
                                                            if (tag_1 === "ol") {
                                                                result += "".concat(index + 1, ". ");
                                                            }
                                                            else {
                                                                result += "- ";
                                                            }
                                                            // FIX: Extract content recursively VÀ GIỮ NGUYÊN paragraph structure
                                                            Array.from(item.childNodes).forEach(function (child) {
                                                                if (child.nodeType === Node.TEXT_NODE) {
                                                                    result += child.textContent || "";
                                                                }
                                                                else if (child.nodeType === Node.ELEMENT_NODE) {
                                                                    var childEl = child;
                                                                    var childTag = childEl.tagName.toLowerCase();
                                                                    // Handle <p> inside <li> - keep newline structure
                                                                    if (childTag === "p") {
                                                                        traverse(child);
                                                                        // Remove the automatic "\n\n" that paragraph adds
                                                                        // and replace with single newline for list item
                                                                        if (result.endsWith("\n\n")) {
                                                                            result = result.slice(0, -2);
                                                                        }
                                                                    }
                                                                    else {
                                                                        traverse(child);
                                                                    }
                                                                }
                                                            });
                                                            result += "\n";
                                                        }
                                                    }
                                                });
                                                return;
                                            }
                                            // Handle headings
                                            if (tag_1.match(/^h[1-6]$/)) {
                                                var level_1 = parseInt(tag_1[1]);
                                                result += "#".repeat(level_1) + " ";
                                                Array.from(el.childNodes).forEach(traverse);
                                                result += "\n\n";
                                                return;
                                            }
                                            // Handle paragraphs
                                            if (tag_1 === "p") {
                                                Array.from(el.childNodes).forEach(traverse);
                                                // Only add newlines if there's actual content
                                                if (el.textContent && el.textContent.trim()) {
                                                    result += "\n\n";
                                                }
                                                return;
                                            }
                                            // Handle blockquotes
                                            if (tag_1 === "blockquote") {
                                                var lines = (el.textContent || "").split("\n");
                                                lines.forEach(function (line) {
                                                    if (line.trim()) {
                                                        result += "> " + line + "\n";
                                                    }
                                                });
                                                result += "\n";
                                                return;
                                            }
                                            // Handle bold
                                            if (tag_1 === "strong" || tag_1 === "b") {
                                                result += "**";
                                                Array.from(el.childNodes).forEach(traverse);
                                                result += "**";
                                                return;
                                            }
                                            // Handle italic
                                            if (tag_1 === "em" || tag_1 === "i") {
                                                result += "*";
                                                Array.from(el.childNodes).forEach(traverse);
                                                result += "*";
                                                return;
                                            }
                                            // Handle divs and other containers
                                            Array.from(el.childNodes).forEach(traverse);
                                            // Add line break for block elements
                                            var blockElements = [
                                                "div",
                                                "section",
                                                "article",
                                                "header",
                                                "footer",
                                                "main",
                                            ];
                                            if (blockElements.includes(tag_1)) {
                                                result += "\n";
                                            }
                                        }
                                    };
                                    traverse(element);
                                    return result;
                                };
                                var markdownText = extractMarkdown(messageContainer);
                                markdownText = markdownText
                                    .replace(/\n+(<\/?\w+>)/g, "\n$1")
                                    .replace(/ {2,}/g, " ")
                                    .replace(/(<task_progress>)\s+(-)/g, "$1\n$2")
                                    .replace(/(-\s*\[\s*[x ]\s*\][^\n]*)\s+(-)/g, "$1\n$2")
                                    .replace(/(-\s*\[\s*[x ]\s*\][^\n<]*?)(<\/(?!path|thinking|read_file|write_file)\w+>)/g, "$1\n$2")
                                    .replace(/(<\/task_progress>)(<\/(?:read_file|write_file|execute_command)>)/g, "$1$2");
                                return { content: markdownText, method: "ds-markdown-parent" };
                            })];
                    case 1:
                        extractedContent = _a.sent();
                        if (!extractedContent) {
                            console.error("[PromptController] \u274C No result from page");
                            return [2 /*return*/, null];
                        }
                        // ✅ Type validation before destructuring
                        if (typeof extractedContent !== "object" || extractedContent === null) {
                            console.error("[PromptController] \u274C Invalid extractedContent type:", typeof extractedContent);
                            return [2 /*return*/, null];
                        }
                        content = extractedContent.content;
                        decodedResult = this.decodeHtmlEntities(content);
                        xmlFixedResult = this.fixXmlStructure(decodedResult);
                        unwrappedResult = this.unwrapTaskProgress(xmlFixedResult);
                        artifactCleanedResult = unwrappedResult
                            .replace(/\n*Copy\s*\n*/gi, "\n")
                            .replace(/\n*Download\s*\n*/gi, "\n")
                            .replace(/\btext\s*\n+/gi, "\n");
                        // Step 2.8: Remove any remaining code block markers around XML tags
                        artifactCleanedResult = artifactCleanedResult
                            .replace(/```\s*\n+(<[a-z_]+>)/gi, "$1")
                            .replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");
                        cleanedResult = artifactCleanedResult
                            .replace(/\n{3,}/g, "\n\n")
                            .trim();
                        // Additional cleanup: Fix spacing trong numbered lists
                        cleanedResult = cleanedResult.replace(/(\d+\.)\s+\n/g, "$1 ");
                        // CRITICAL: Ensure proper newlines around ALL XML closing tags
                        // Pattern: "text</tag>" → "text\n</tag>" (nếu chưa có newline)
                        cleanedResult = cleanedResult.replace(/([^\n])(<\/[a-z_]+>)/g, "$1\n$2");
                        // CRITICAL: Ensure proper newlines between consecutive closing tags
                        // Pattern: "</tag1></tag2>" → "</tag1>\n</tag2>"
                        cleanedResult = cleanedResult.replace(/(<\/[a-z_]+>)(<\/[a-z_]+>)/g, "$1\n$2");
                        // Step 2.9: Clean SEARCH/REPLACE code fences in <diff> blocks
                        cleanedResult = this.cleanSearchReplaceCodeFences(cleanedResult);
                        // Step 2.10: Clean code fences in <content> blocks of <write_to_file>
                        cleanedResult = this.cleanContentCodeFences(cleanedResult);
                        // LOG 2: Response sau xử lý (full cleaned content)
                        // console.log(
                        //   `[PromptController] ✅ PROCESSED RESPONSE (CLEAN):\n${cleanedResult}`
                        // );
                        // Step 3: Try to parse as JSON ONLY if ENTIRE response is JSON (không chứa XML tags)
                        try {
                            hasXmlTags = /<[a-z_]+>/.test(cleanedResult) || /<\/[a-z_]+>/.test(cleanedResult);
                            if (hasXmlTags) {
                                return [2 /*return*/, cleanedResult];
                            }
                            trimmed = cleanedResult.trim();
                            if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
                                return [2 /*return*/, cleanedResult];
                            }
                            jsonResponse = JSON.parse(trimmed);
                            // Validate structure
                            if (jsonResponse &&
                                typeof jsonResponse === "object" &&
                                jsonResponse.choices) {
                                return [2 /*return*/, JSON.stringify(jsonResponse)];
                            }
                            else {
                                return [2 /*return*/, cleanedResult];
                            }
                        }
                        catch (parseError) { }
                        // Return cleaned text
                        return [2 /*return*/, cleanedResult];
                    case 2:
                        error_10 = _a.sent();
                        console.error("[PromptController] \u274C EXCEPTION in getLatestResponseDirectly:", error_10);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Decode HTML entities trong string
     * Chuyển &lt; → <, &gt; → >, &amp; → &, &quot; → ", &#39; → '
     */
    PromptController.decodeHtmlEntities = function (text) {
        var entities = {
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
        };
        var decoded = text;
        var replacementCount = 0;
        for (var _i = 0, _a = Object.entries(entities); _i < _a.length; _i++) {
            var _b = _a[_i], entity = _b[0], char = _b[1];
            var countBefore = (decoded.match(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
            if (countBefore > 0) {
                replacementCount += countBefore;
            }
            decoded = decoded.split(entity).join(char);
        }
        // Handle numeric entities: &#123; → {
        decoded = decoded.replace(/&#(\d+);/g, function (_, num) {
            return String.fromCharCode(parseInt(num, 10));
        });
        // Handle hex entities: &#x7B; → {
        decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });
        return decoded;
    };
    /**
     * Validate và fix XML structure trong response
     * Fix lỗi: <task_progress> nằm bên trong <read_file> hoặc các tool tags khác
     */
    PromptController.fixXmlStructure = function (content) {
        var fixed = content;
        fixed = fixed.replace(/(<\/[a-z_]+>)(<[a-z_]+>)/g, "$1\n$2");
        return fixed;
    };
    PromptController.unwrapTaskProgress = function (content) {
        var textBlockPattern = /```text[\s\S]*?(<task_progress>[\s\S]*?<\/task_progress>)[\s\S]*?```/g;
        var unwrapped = content.replace(textBlockPattern, "$1");
        unwrapped = unwrapped.replace(/(Copy\s*(?:Download)?\s*\n+)(<[a-z_]+>)/gi, "$2");
        unwrapped = unwrapped.replace(/\btext\s*\n+(<[a-z_]+>)/gi, "$1");
        unwrapped = unwrapped.replace(/```\s*\n*(<task_progress>[\s\S]*?<\/task_progress>)\s*\n*```/g, "$1");
        unwrapped = unwrapped.replace(/```\s*\n+(<[a-z_]+>)/gi, "$1");
        unwrapped = unwrapped.replace(/(<\/[a-z_]+>)\s*\n+```/gi, "$1");
        return unwrapped;
    };
    /**
     * Loại bỏ code fence (```) bên ngoài cùng trong SEARCH/REPLACE blocks
     * Giữ nguyên các ``` bên trong nếu code có sử dụng
     */
    PromptController.cleanSearchReplaceCodeFences = function (content) {
        var diffBlockPattern = /<diff>([\s\S]*?)<\/diff>/g;
        var CODE_FENCE = "```";
        var UI_ARTIFACTS = ["text", "copy", "download"];
        return content.replace(diffBlockPattern, function (_match, diffContent) {
            var lines = diffContent.split("\n");
            var searchMarker = "<<<<<<< SEARCH";
            var separatorMarker = "=======";
            var replaceMarker = "> REPLACE";
            // Tìm vị trí các marker
            var searchIdx = -1;
            var separatorIdx = -1;
            var replaceIdx = -1;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].includes(searchMarker))
                    searchIdx = i;
                if (lines[i].includes(separatorMarker))
                    separatorIdx = i;
                if (lines[i].includes(replaceMarker))
                    replaceIdx = i;
            }
            if (searchIdx === -1 || separatorIdx === -1 || replaceIdx === -1) {
                return "<diff>".concat(diffContent, "</diff>");
            }
            var linesToRemove = new Set();
            // Step 1: Xóa dòng trống NGAY SAU "<<<<<<< SEARCH"
            if (searchIdx + 1 < lines.length && lines[searchIdx + 1].trim() === "") {
                linesToRemove.add(searchIdx + 1);
            }
            // Step 2: Sau "<<<<<<< SEARCH": Tìm CODE_FENCE (bỏ qua UI artifacts và dòng trống)
            for (var i = searchIdx + 1; i < separatorIdx; i++) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                var isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
                if (trimmed !== "" && !isUIArtifact) {
                    break;
                }
            }
            // Step 3: Xóa dòng trống NGAY TRƯỚC "======="
            if (separatorIdx - 1 >= 0 && lines[separatorIdx - 1].trim() === "") {
                linesToRemove.add(separatorIdx - 1);
            }
            // Step 4: Trước "=======": Tìm ngược lên CODE_FENCE (bỏ qua dòng trống đã mark)
            for (var i = separatorIdx - 1; i > searchIdx; i--) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                if (trimmed !== "") {
                    break;
                }
            }
            // Step 5: Xóa dòng trống NGAY SAU "======="
            if (separatorIdx + 1 < lines.length &&
                lines[separatorIdx + 1].trim() === "") {
                linesToRemove.add(separatorIdx + 1);
            }
            // Step 6: Sau "=======": Tìm CODE_FENCE (bỏ qua UI artifacts và dòng trống)
            for (var i = separatorIdx + 1; i < replaceIdx; i++) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                var isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
                if (trimmed !== "" && !isUIArtifact) {
                    break;
                }
            }
            // Step 7: Xóa dòng trống NGAY TRƯỚC "> REPLACE"
            if (replaceIdx - 1 >= 0 && lines[replaceIdx - 1].trim() === "") {
                linesToRemove.add(replaceIdx - 1);
            }
            // Step 8: Trước "> REPLACE": Tìm ngược lên CODE_FENCE (bỏ qua dòng trống đã mark)
            for (var i = replaceIdx - 1; i > separatorIdx; i--) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                if (trimmed !== "") {
                    break;
                }
            }
            // Step 9: Xóa CODE_FENCE nếu dòng TRÊN là marker
            for (var i = 0; i < lines.length; i++) {
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE && i > 0) {
                    var prevIdx = i - 1;
                    while (prevIdx >= 0 && lines[prevIdx].trim() === "") {
                        prevIdx--;
                    }
                    if (prevIdx >= 0) {
                        var prevLine = lines[prevIdx].trim();
                        if (prevLine === separatorMarker || prevLine === searchMarker) {
                            linesToRemove.add(i);
                        }
                    }
                }
            }
            // Lọc bỏ các dòng cần xóa
            var cleanedLines = lines.filter(function (_, idx) { return !linesToRemove.has(idx); });
            return "<diff>".concat(cleanedLines.join("\n"), "</diff>");
        });
    };
    /**
     * Loại bỏ code fence (```) bên ngoài cùng trong <content> blocks của <write_to_file>
     * Giữ nguyên các ``` bên trong nếu content có sử dụng
     */
    PromptController.cleanContentCodeFences = function (content) {
        var contentBlockPattern = /<content>([\s\S]*?)<\/content>/g;
        var CODE_FENCE = "```";
        var UI_ARTIFACTS = ["text", "copy", "download"];
        return content.replace(contentBlockPattern, function (_match, contentBlock) {
            var lines = contentBlock.split("\n");
            if (lines.length === 0) {
                return "<content>".concat(contentBlock, "</content>");
            }
            var linesToRemove = new Set();
            // Step 1: Xóa dòng trống đầu tiên (ngay sau <content>)
            if (lines[0].trim() === "") {
                linesToRemove.add(0);
            }
            // Step 2: Tìm và xóa CODE_FENCE đầu tiên (bỏ qua UI artifacts và dòng trống)
            for (var i = 0; i < lines.length; i++) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                var isUIArtifact = UI_ARTIFACTS.includes(trimmed.toLowerCase());
                if (trimmed !== "" && !isUIArtifact) {
                    break;
                }
            }
            // Step 3: Xóa dòng trống cuối cùng (ngay trước </content>)
            var lastIdx = lines.length - 1;
            if (lastIdx >= 0 && lines[lastIdx].trim() === "") {
                linesToRemove.add(lastIdx);
            }
            // Step 4: Tìm và xóa CODE_FENCE cuối cùng (bỏ qua dòng trống đã đánh dấu)
            for (var i = lastIdx; i >= 0; i--) {
                if (linesToRemove.has(i))
                    continue;
                var trimmed = lines[i].trim();
                if (trimmed === CODE_FENCE) {
                    linesToRemove.add(i);
                    break;
                }
                if (trimmed !== "") {
                    break;
                }
            }
            // Lọc bỏ các dòng cần xóa
            var cleanedLines = lines.filter(function (_, idx) { return !linesToRemove.has(idx); });
            return "<content>".concat(cleanedLines.join("\n"), "</content>");
        });
    };
    /**
     * Build OpenAI response với ACCURATE token calculation using tiktoken
     * @param content - Response content từ DeepSeek
     * @param originalPrompt - Original prompt để tính prompt_tokens
     */
    /**
     * Build OpenAI response với ACCURATE token calculation using gpt-tokenizer
     * @param content - Response content từ DeepSeek
     * @param originalPrompt - Original prompt để tính prompt_tokens
     */
    PromptController.buildOpenAIResponse = function (content_1) {
        return __awaiter(this, arguments, void 0, function (content, originalPrompt, folderPath) {
            var generateHex, responseId, systemFingerprint, timestamp, prompt_tokens, completion_tokens, total_tokens, accumulatedTokens, responseObject;
            if (originalPrompt === void 0) { originalPrompt = ""; }
            if (folderPath === void 0) { folderPath = null; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        generateHex = function (length) {
                            return Array.from({ length: length }, function () {
                                return Math.floor(Math.random() * 16).toString(16);
                            }).join("");
                        };
                        responseId = "chatcmpl-".concat(generateHex(16));
                        systemFingerprint = "fp_".concat(generateHex(8));
                        timestamp = Math.floor(Date.now() / 1000);
                        prompt_tokens = 0;
                        completion_tokens = 0;
                        total_tokens = 0;
                        if (!folderPath) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getTokensForFolder(folderPath)];
                    case 1:
                        accumulatedTokens = _a.sent();
                        if (accumulatedTokens) {
                            prompt_tokens = accumulatedTokens.prompt_tokens;
                            completion_tokens = accumulatedTokens.completion_tokens;
                            total_tokens = accumulatedTokens.total_tokens;
                        }
                        else {
                            console.warn("[PromptController] \u26A0\uFE0F No accumulated tokens found for folder \"".concat(folderPath, "\" - this should not happen!"));
                            console.warn("[PromptController] \uD83D\uDCA1 Falling back to calculating tokens for this request only");
                            // Fallback: Tính tokens như cũ nếu chưa có accumulator
                            prompt_tokens = this.calculateTokensAndLog(originalPrompt, "PROMPT_TOKENS (FALLBACK)");
                            completion_tokens = this.calculateTokensAndLog(content, "COMPLETION_TOKENS (FALLBACK)");
                            total_tokens = prompt_tokens + completion_tokens;
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        // Không có folderPath → tính tokens cho single request
                        prompt_tokens = this.calculateTokensAndLog(originalPrompt, "PROMPT_TOKENS");
                        completion_tokens = this.calculateTokensAndLog(content, "COMPLETION_TOKENS");
                        total_tokens = prompt_tokens + completion_tokens;
                        _a.label = 3;
                    case 3:
                        responseObject = {
                            id: responseId,
                            object: "chat.completion.chunk",
                            created: timestamp,
                            model: "deepseek-chat",
                            choices: [
                                {
                                    index: 0,
                                    delta: {
                                        role: "assistant",
                                        content: content,
                                    },
                                    finish_reason: "stop",
                                    logprobs: null,
                                },
                            ],
                            usage: {
                                prompt_tokens: prompt_tokens,
                                completion_tokens: completion_tokens,
                                total_tokens: total_tokens,
                            },
                            system_fingerprint: systemFingerprint,
                        };
                        return [2 /*return*/, responseObject];
                }
            });
        });
    };
    PromptController.activePollingTasks = new Map();
    PromptController.config = types_1.DEFAULT_CONFIG;
    PromptController.tabStateManager = tab_state_manager_1.TabStateManager.getInstance();
    /**
     * 🆕 STORAGE KEY cho folder tokens
     */
    PromptController.FOLDER_TOKENS_KEY = "folderTokenAccumulator";
    /**
     * 🆕 Save accumulated tokens cho một folder_path
     */
    // 🆕 ADD: Mutex lock để tránh race condition
    PromptController.folderTokenMutex = new Map();
    // Language rule - yêu cầu AI trả lời bằng tiếng Việt
    PromptController.LANGUAGE_RULE = "\nCRITICAL LANGUAGE RULE:\n- You MUST respond in Vietnamese (Ti\u1EBFng Vi\u1EC7t) for ALL outputs\n- All explanations, descriptions, and responses must be in Vietnamese\n- Code comments should also be in Vietnamese when possible";
    // Clarification rules - quy tắc yêu cầu làm rõ thông tin khi task mơ hồ
    PromptController.CLARIFICATION_RULE = "\nCRITICAL CLARIFICATION RULES (STRICTLY ENFORCED):\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 1: MANDATORY READ_FILE BEFORE REPLACE_IN_FILE (CRITICAL)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nYou MUST follow this strict workflow when using <replace_in_file>:\n\n1. **FIRST USE OF replace_in_file ON A FILE:**\n   \u2705 MUST call <read_file> first to get current content\n   \u274C NEVER use <replace_in_file> without reading file first\n   \n   Example (CORRECT):\n   <read_file>\n   <path>src/test.ts</path>\n   </read_file>\n   \n   ... (after getting file content)\n   \n   <replace_in_file>\n   <path>src/test.ts</path>\n   <diff>...</diff>\n   </replace_in_file>\n\n2. **SUBSEQUENT replace_in_file AFTER A PREVIOUS replace_in_file:**\n   \u2705 MUST call <read_file> again before next <replace_in_file>\n   \u26A0\uFE0F Reason: File may be auto-formatted by editor (VSCode, etc.)\n   \u274C NEVER assume file content is unchanged\n   \n   Example (CORRECT):\n   Request 1:\n   <read_file><path>src/test.ts</path></read_file>\n   <replace_in_file><path>src/test.ts</path>...</replace_in_file>\n   \n   Request 2 (later):\n   <read_file><path>src/test.ts</path></read_file>  \u2190 MUST read again!\n   <replace_in_file><path>src/test.ts</path>...</replace_in_file>\n\n3. **WHEN YOU DON'T NEED TO read_file AGAIN:**\n   \u2705 If you already <read_file> but haven't done <replace_in_file> yet\n   \n   Example (CORRECT - no redundant read):\n   <read_file><path>src/test.ts</path></read_file>\n   ... (analyze content)\n   <replace_in_file><path>src/test.ts</path>...</replace_in_file>  \u2190 OK, no need to read again\n\n4. **TRACKING RULE:**\n   - Track per file: \"Did I read this file?\" + \"Did I replace after reading?\"\n   - If \"replaced after reading\" = YES \u2192 MUST read again before next replace\n   - If \"read but not replaced yet\" = YES \u2192 Can replace without re-reading\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 1.5: PREVENT INFINITE REPLACE_IN_FILE LOOP (CRITICAL)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n**TRACKING MECHANISM:**\n- Track s\u1ED1 l\u1EA7n <replace_in_file> LI\u00CAN TI\u1EBEP tr\u00EAn C\u00D9NG M\u1ED8T FILE\n- N\u1EBFu \u0111\u00E3 <replace_in_file> tr\u00EAn file X >= 2 l\u1EA7n LI\u00CAN TI\u1EBEP m\u00E0 v\u1EABn c\u00F3 l\u1ED7i\n  \u2192 MUST call <read_file> on file X \u0111\u1EC3 xem to\u00E0n b\u1ED9 n\u1ED9i dung hi\u1EC7n t\u1EA1i\n\n**WHY THIS RULE EXISTS:**\n- File c\u00F3 th\u1EC3 b\u1ECB auto-format b\u1EDFi VSCode/Prettier\n- Spacing/indentation c\u00F3 th\u1EC3 thay \u0111\u1ED5i sau m\u1ED7i replace\n- SEARCH block kh\u00F4ng match \u0111\u01B0\u1EE3c do indentation sai\n- Blind replace without re-reading = infinite loop\n\n**CORRECT WORKFLOW:**\nRequest 1: <replace_in_file> on file.ts \u2192 fails\nRequest 2: <replace_in_file> on file.ts \u2192 fails again\nRequest 3: \u26A0\uFE0F STOP! Must <read_file> on file.ts first\n           \u2192 Analyze current state\n           \u2192 Then <replace_in_file> with correct SEARCH block\n\n**EXAMPLE - WRONG (INFINITE LOOP):**\nRequest 1: <replace_in_file path=\"test.ts\"> ... </replace_in_file> \u2192 error\nRequest 2: <replace_in_file path=\"test.ts\"> ... </replace_in_file> \u2192 error\nRequest 3: <replace_in_file path=\"test.ts\"> ... </replace_in_file> \u2192 error (LOOP!)\n\n**EXAMPLE - CORRECT (WITH READ):**\nRequest 1: <replace_in_file path=\"test.ts\"> ... </replace_in_file> \u2192 error\nRequest 2: <replace_in_file path=\"test.ts\"> ... </replace_in_file> \u2192 error\nRequest 3: <read_file path=\"test.ts\"> \u2192 Read current state\nRequest 4: <replace_in_file path=\"test.ts\"> \u2192 Now use EXACT spacing from read result\n\n**IMPLEMENTATION:**\n- Maintain counter per file: Map<filePath, consecutiveReplaceCount>\n- Reset counter when <read_file> is called on that file\n- If counter >= 2 \u2192 Force <read_file> before next <replace_in_file>\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 2: WHEN TO ASK FOR CLARIFICATION (MANDATORY)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nYou MUST use <ask_followup_question> tool when:\n\n1. FILE LOCATION AMBIGUOUS:\n   \u274C \"th\u00EAm h\u00E0m t\u00EDnh t\u1ED5ng\" \u2192 WHERE? Which file?\n   \u274C \"t\u1EA1o function tr\u1EEB 2 s\u1ED1\" \u2192 WHERE? New file or existing?\n   \u274C \"vi\u1EBFt h\u00E0m validate email\" \u2192 WHERE? utils? helpers? models?\n   \u2705 Use <ask_followup_question> to ask: \"B\u1EA1n mu\u1ED1n th\u00EAm h\u00E0m n\u00E0y v\u00E0o file n\u00E0o?\"\n\n2. MISSING CRITICAL DETAILS:\n   \u274C \"th\u00EAm validation\" \u2192 Validate WHAT? Which fields?\n   \u274C \"s\u1EEDa bug\" \u2192 Bug \u1EDE \u0110\u00C2U? What's the symptom?\n   \u274C \"refactor code\" \u2192 WHICH part? What's the goal?\n   \u2705 Ask specific questions about missing details\n\n3. MULTIPLE POSSIBLE APPROACHES:\n   \u274C \"t\u1ED1i \u01B0u performance\" \u2192 Which part? What metric?\n   \u274C \"c\u1EA3i thi\u1EC7n UI\" \u2192 Which component? What improvement?\n   \u2705 Present options and ask user to choose\n\n4. UNSAFE ASSUMPTIONS:\n   \u274C DON'T guess file location based on function name\n   \u274C DON'T assume user wants new file vs existing file\n   \u274C DON'T assume implementation details without confirmation\n   \u2705 ALWAYS ask when uncertain\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 3: HOW TO ASK (FORMAT)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nUse this format:\n\n<ask_followup_question>\n<question>\nT\u00F4i c\u1EA7n th\u00EAm th\u00F4ng tin \u0111\u1EC3 th\u1EF1c hi\u1EC7n task n\u00E0y:\n\n1. [C\u00E2u h\u1ECFi c\u1EE5 th\u1EC3 v\u1EC1 v\u1EA5n \u0111\u1EC1 1]\n2. [C\u00E2u h\u1ECFi c\u1EE5 th\u1EC3 v\u1EC1 v\u1EA5n \u0111\u1EC1 2]\n3. [N\u1EBFu c\u00F3 nhi\u1EC1u l\u1EF1a ch\u1ECDn, li\u1EC7t k\u00EA options]\n\nV\u00ED d\u1EE5:\n- Option A: [M\u00F4 t\u1EA3 approach 1]\n- Option B: [M\u00F4 t\u1EA3 approach 2]\n\nB\u1EA1n mu\u1ED1n t\u00F4i l\u00E0m theo c\u00E1ch n\u00E0o?\n</question>\n</ask_followup_question>\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 3: EXAMPLES - CORRECT BEHAVIOR\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\u274C WRONG - T\u1EF1 \u00FD \u0111o\u00E1n:\nUser: \"th\u00EAm h\u00E0m tr\u1EEB 2 s\u1ED1 nguy\u00EAn, ko c\u1EA7n test\"\nAI: *T\u1EF1 \u00FD t\u1EA1o src/utils/math.ts v\u00E0 th\u00EAm h\u00E0m v\u00E0o \u0111\u00F3*\n\n\u2705 CORRECT - H\u1ECFi tr\u01B0\u1EDBc:\nUser: \"th\u00EAm h\u00E0m tr\u1EEB 2 s\u1ED1 nguy\u00EAn, ko c\u1EA7n test\"\nAI: \n<ask_followup_question>\n<question>\nT\u00F4i c\u1EA7n l\u00E0m r\u00F5 m\u1ED9t s\u1ED1 \u0111i\u1EC3m:\n\n1. B\u1EA1n mu\u1ED1n th\u00EAm h\u00E0m n\u00E0y v\u00E0o file n\u00E0o?\n   - File \u0111\u00E3 c\u00F3 s\u1EB5n (n\u1EBFu c\u00F3, cho t\u00F4i bi\u1EBFt t\u00EAn file)\n   - T\u1EA1o file m\u1EDBi (t\u00F4i s\u1EBD t\u1EA1o file m\u1EDBi v\u1EDBi t\u00EAn ph\u00F9 h\u1EE3p)\n\n2. T\u00EAn h\u00E0m b\u1EA1n mu\u1ED1n \u0111\u1EB7t l\u00E0 g\u00EC?\n   - V\u00ED d\u1EE5: subtract(), minus(), tru()\n\n3. H\u00E0m n\u00E0y c\u00F3 c\u1EA7n x\u1EED l\u00FD edge cases kh\u00F4ng?\n   - Ki\u1EC3m tra input c\u00F3 ph\u1EA3i s\u1ED1 nguy\u00EAn\n   - X\u1EED l\u00FD overflow\n   - Ho\u1EB7c ch\u1EC9 tr\u1EEB \u0111\u01A1n gi\u1EA3n\n\nVui l\u00F2ng cho t\u00F4i bi\u1EBFt \u0111\u1EC3 t\u00F4i th\u1EF1c hi\u1EC7n ch\u00EDnh x\u00E1c.\n</question>\n</ask_followup_question>\n\n\u274C WRONG - Thi\u1EBFu context:\nUser: \"s\u1EEDa bug trong function login\"\nAI: *\u0110\u1ECDc file v\u00E0 \u0111o\u00E1n bug l\u00E0 g\u00EC, r\u1ED3i s\u1EEDa*\n\n\u2705 CORRECT - H\u1ECFi r\u00F5:\nAI:\n<ask_followup_question>\n<question>\n\u0110\u1EC3 s\u1EEDa bug hi\u1EC7u qu\u1EA3, t\u00F4i c\u1EA7n bi\u1EBFt:\n\n1. Bug x\u1EA3y ra khi n\u00E0o? (M\u00F4 t\u1EA3 t\u00ECnh hu\u1ED1ng c\u1EE5 th\u1EC3)\n2. Error message l\u00E0 g\u00EC? (N\u1EBFu c\u00F3)\n3. Expected behavior vs Actual behavior?\n4. File n\u00E0o ch\u1EE9a function login?\n\nTh\u00F4ng tin n\u00E0y gi\u00FAp t\u00F4i \u0111\u1ECBnh v\u1ECB v\u00E0 s\u1EEDa bug ch\u00EDnh x\u00E1c.\n</question>\n</ask_followup_question>\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE 4: WHEN NOT TO ASK\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nDON'T ask when:\n\u2705 Task is crystal clear: \"s\u1EEDa typo 'helo' th\u00E0nh 'hello' trong src/index.ts\"\n\u2705 File path is explicit: \"th\u00EAm function sum() v\u00E0o src/utils/math.ts\"\n\u2705 Context is complete: \"refactor function X trong file Y \u0111\u1EC3 d\u00F9ng async/await\"\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nFINAL REMINDER\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nGOLDEN RULE: When in doubt, ASK. Don't guess.\n- Better to ask 1 clarifying question than make 10 wrong assumptions\n- User prefers being asked than having to fix incorrect implementations\n- <ask_followup_question> is your friend - use it liberally for ambiguous tasks\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n";
    // Text wrapping rules - quy tắc format XML tags và code blocks
    PromptController.TEXT_WRAP_RULE = "\nCRITICAL TEXT BLOCK WRAPPING RULES (25 RULES - STRICTLY ENFORCED):\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 1: WHAT MUST BE WRAPPED (MANDATORY)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n1. <task_progress> content MUST ALWAYS be wrapped in ```text code blocks\n   - NO EXCEPTIONS - Even if it's just 1 task item\n   - Format: ```text\n<task_progress>...</task_progress>\n```\n\n2. ALL code inside <content> tags of <write_to_file> MUST be wrapped in ```text\n   - Format: <content>\n```text\nYOUR_CODE_HERE\n```\n</content>\n\n3. ALL code in <diff> tags (BOTH SEARCH and REPLACE sections) MUST be wrapped in ```text\n   - Format: <<<<<<< SEARCH\n```text\nOLD_CODE\n```\n=======\n```text\nNEW_CODE\n```\n>>>>>>> REPLACE\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 2: WRAPPER FORMAT (EXACT SYNTAX) - CRITICAL\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n4. Text block MUST start with EXACTLY: ```text (lowercase \"text\", no spaces)\n   \u274C FORBIDDEN: ```typescript, ```python, ```javascript, ```java, ```cpp, ```bash, etc.\n   \u2705 ONLY ALLOWED: ```text\n\n5. Text block MUST end with exactly: ``` (three backticks, nothing else)\n\n6. NO content allowed before ```text or after closing ```\n\n7. Each wrappable item gets its OWN separate ```text...``` block\n\n8. \uD83D\uDD25 CRITICAL: NEVER use language-specific code fence markers\n   - Even if code is TypeScript/Python/Java/etc., you MUST use ```text\n   - Language detection is NOT your responsibility\n   - Parser expects ONLY ```text for ALL code blocks\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 3: WHAT SHOULD NOT BE WRAPPED\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n8. <thinking> tags and explanations should NOT be wrapped\n9. XML tool tags themselves (<read_file>, <write_to_file>, etc.) should NOT be wrapped\n10. Vietnamese explanatory text should NOT be wrapped\n11. Do NOT wrap multiple different elements in one text block\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 4: STRUCTURE REQUIREMENTS\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n12. <content></content> tags are MANDATORY inside ALL <write_to_file> operations\n13. NEVER omit <content> tags - this will cause parsing errors\n14. Code inside <content> MUST be wrapped: <content>```text\nCODE```</content>\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 5: INDENTATION PRESERVATION (CRITICAL)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n15. You MUST preserve EXACT indentation (spaces/tabs) from original code\n16. Count spaces carefully - if original uses 2 spaces, keep 2 spaces\n17. Do NOT apply auto-formatting (Prettier, ESLint, PEP8, etc.)\n18. In <replace_in_file>, SEARCH block MUST match indentation EXACTLY character-by-character\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nRULE GROUP 6: VALIDATION CHECKLIST (BEFORE SENDING RESPONSE)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n19. Before sending response, verify:\n    \u2713 Every <task_progress> is wrapped in ```text...```\n    \u2713 Every <content> block has ```text wrapper\n    \u2713 Every SEARCH/REPLACE section has ```text wrapper\n    \u2713 No explanatory text inside ```text blocks\n    \u2713 Indentation matches original code exactly\n\n20. If you forget to wrap <task_progress>, the system will reject your response\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nCORRECT FORMAT EXAMPLES\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\u2705 Example 1 - Task Progress (CORRECT):\n<read_file>\n<path>test.ts</path>\n```text\n<task_progress>\n- [ ] Ph\u00E2n t\u00EDch c\u1EA5u tr\u00FAc d\u1EF1 \u00E1n\n- [ ] Ki\u1EC3m tra file hi\u1EC7n t\u1EA1i\n- [ ] Th\u00EAm h\u00E0m m\u1EDBi\n</task_progress>\n```\n</read_file>\n\n\u2705 Example 2 - Write To File (CORRECT):\n<write_to_file>\n<path>src/new-file.ts</path>\n<content>\n```text\nexport function myFunction() {\n  console.log(\"Hello\");  // 2 spaces indent\n  return true;\n}\n```\n</content>\n</write_to_file>\n\n\u2705 Example 3 - Replace In File (CORRECT):\n<replace_in_file>\n<path>src/helper.ts</path>\n<diff>\n<<<<<<< SEARCH\n```text\nfunction oldFunction() {\n  return \"old\";\n}\n```\n=======\n```text\nfunction newFunction() {\n  return \"new\";\n}\n```\n>>>>>>> REPLACE\n</diff>\n</replace_in_file>\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nINCORRECT FORMAT EXAMPLES (WILL BE REJECTED)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\u274C Example 1 - Task Progress NOT wrapped (CRITICAL ERROR):\n<read_file>\n<path>test.ts</path>\n<task_progress>\n- [ ] Do something\n</task_progress>\n</read_file>\n\n\u274C Example 2 - Missing <content> tag:\n<write_to_file>\n<path>test.ts</path>\n```text\nfunction test() {}\n```\n</write_to_file>\n\n\u274C Example 3 - Code not wrapped:\n<write_to_file>\n<path>test.ts</path>\n<content>\nfunction test() {}\n</content>\n</write_to_file>\n\n\u274C Example 4 - Using language-specific marker (CRITICAL ERROR):\n<write_to_file>\n<path>src/utils/helper.ts</path>\n<content>\n```typescript\nfunction helper() {\n  return true;\n}\n```\n</content>\n</write_to_file>\n\uD83D\uDD25 REASON: Must use ```text instead of ```typescript\n\n\u274C Example 5 - Using Python marker (CRITICAL ERROR):\n<write_to_file>\n<path>calculator.py</path>\n<content>\n```python\ndef add(a, b):\n    return a + b\n```\n</content>\n</write_to_file>\n\uD83D\uDD25 REASON: Must use ```text instead of ```python\n\n\u274C Example 6 - Using Java marker in SEARCH block (CRITICAL ERROR):\n<replace_in_file>\n<path>Main.java</path>\n<diff>\n<<<<<<< SEARCH\n```java\npublic class Main {\n}\n```\n=======\n```text\npublic class Main {\n    public static void main(String[] args) {}\n}\n```\n>>>>>>> REPLACE\n</diff>\n</replace_in_file>\n\uD83D\uDD25 REASON: BOTH SEARCH and REPLACE must use ```text\n\n\u274C Example 7 - Mixed markers (CRITICAL ERROR):\n<replace_in_file>\n<path>script.sh</path>\n<diff>\n<<<<<<< SEARCH\n```bash\necho \"old\"\n```\n=======\n```shell\necho \"new\"\n```\n>>>>>>> REPLACE\n</diff>\n</replace_in_file>\n\uD83D\uDD25 REASON: BOTH blocks must use ```text (not bash, not shell)\n\n\u274C Example 4 - Mixing content in text block:\n```text\nSome explanation text here\n<task_progress>\n- [ ] Task 1\n</task_progress>\nMore text here\n```\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nFINAL REMINDER (CRITICAL - READ TWICE)\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n1. If you output <task_progress> without wrapping it in ```text...```, \n   the system will FAIL to parse your response and the user will see an error.\n   ALWAYS wrap <task_progress> in ```text code blocks - NO EXCEPTIONS!\n\n2. \uD83D\uDD25 NEVER use language-specific code fence markers:\n   \u274C ```typescript  \u274C ```python    \u274C ```javascript\n   \u274C ```java        \u274C ```cpp       \u274C ```bash\n   \u274C ```shell       \u274C ```go        \u274C ```rust\n   \u274C ```php         \u274C ```ruby      \u274C ```swift\n   \n   \u2705 ONLY USE: ```text (for ALL code, regardless of language)\n\n3. This rule applies to:\n   - <content> blocks in <write_to_file>\n   - SEARCH sections in <replace_in_file>\n   - REPLACE sections in <replace_in_file>\n   - <task_progress> blocks\n   - ALL other code blocks\n\n4. If you use ```typescript or any language marker, the parser will FAIL\n   and your response will be rejected.\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\nCRITICAL INDENTATION RULES:\n- Read and preserve the EXACT number of spaces or tabs at the beginning of each line\n- If original code uses 2 spaces for indentation, keep 2 spaces\n- If original code uses 4 spaces, keep 4 spaces\n- If original code uses tabs, keep tabs\n- Do NOT apply auto-formatting (like Prettier, ESLint, or PEP8)\n- Do NOT change indentation to match your preferred style\n- Example: If you see \"  return a + b;\" (2 spaces), you MUST write \"  return a + b;\" (2 spaces)\n- When using <replace_in_file>, the SEARCH block MUST match indentation EXACTLY character-by-character\n- When using <write_to_file>, preserve the indentation style of existing files in the project\n\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\nCORRECT FORMAT EXAMPLES\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n\u2705 Example 1 - Task Progress (CORRECT):\n<read_file>\n<path>test.ts</path>\n```text\n<task_progress>\n- [ ] Ph\u00E2n t\u00EDch c\u1EA5u tr\u00FAc d\u1EF1 \u00E1n\n- [ ] Ki\u1EC3m tra file hi\u1EC7n t\u1EA1i\n- [ ] Th\u00EAm h\u00E0m m\u1EDBi\n- [ ] X\u00E1c nh\u1EADn k\u1EBFt qu\u1EA3\n</task_progress>\n```\n</read_file>\n\n\u2705 Example 2 - Replace In File with TypeScript Code (CORRECT - use ```text for ALL code):\n<replace_in_file>\n<path>src/utils/helper.ts</path>\n<diff>\n<<<<<<< SEARCH\n```text\nfunction oldFunction() {\n  return \"old\";  // Exactly 2 spaces - MUST match original file\n}\n```\n=======\n```text\nfunction newFunction() {\n  return \"new\";\n}\n```\n>>>>>>> REPLACE\n</diff>\n</replace_in_file>\n\n\u2705 Example 3 - Write Python File (CORRECT - use ```text even for Python):\n<write_to_file>\n<path>src/calculator.py</path>\n<content>\n```text\ndef add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b\n```\n</content>\n</write_to_file>\n\n\u2705 Example 4 - Write Java File (CORRECT - use ```text even for Java):\n<write_to_file>\n<path>src/Main.java</path>\n<content>\n```text\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello World\");\n    }\n}\n```\n</content>\n</write_to_file>\n\nExample 3 - Write To File with Code (CORRECT - has <content> tag and preserves 2-space indent):\n<write_to_file>\n<path>src/new-file.ts</path>\n<content>\n```text\nexport function myFunction() {\n  console.log(\"Hello World\");  // Exactly 2 spaces indent\n  return true;                 // Exactly 2 spaces indent\n}\n```\n</content>\n</write_to_file>\n\nINCORRECT FORMAT EXAMPLES:\n\u274C Example 1 - Missing <content> tag (CRITICAL ERROR):\n<write_to_file>\n<path>test.ts</path>\n```text\nfunction test() {\n  return true;\n}\n```\n</write_to_file>\n\n\u274C Example 2 - code without text wrapper:\n<write_to_file>\n<path>test.ts</path>\n<content>\nfunction test() {\n  return true;\n}\n</content>\n</write_to_file>\n\n\u274C Example 3 - only new code wrapped in replace_in_file:\n<replace_in_file>\n<path>test.ts</path>\n<diff>\n<<<<<<< SEARCH\nfunction oldFunction() {\n  return \"old\";\n}\n=======\n```text\nfunction newFunction() {\n  return \"new\";\n}\n```\n>>>>>>> REPLACE\n</diff>\n</replace_in_file>\n\n\u274C Example 4 - wrapping everything:\n```text\n<thinking>...</thinking>\n<write_to_file>...</write_to_file>\n```\n\n\u274C Example 5 - mixing content in text block:\n```text\nSome explanation\nfunction test() {}\nMore text\n```\n\n\u274C Example 6 - wrong indentation (file uses 2 spaces, but you wrote 4 spaces):\n<write_to_file>\n<path>test.ts</path>\n<content>\n```text\nfunction test() {\n    return true;  // \u274C WRONG: 4 spaces, but file uses 2 spaces\n}\n```\n</content>\n</write_to_file>\n\nREMEMBER: \n- <task_progress> content MUST be wrapped in ```text...```\n- ALL CODE in <replace_in_file> (both SEARCH and REPLACE sections) MUST be wrapped in ```text...```\n- ALL CODE in <write_to_file> MUST be wrapped in ```text...``` AND placed inside <content></content> tags\n- The <content></content> tags are MANDATORY in <write_to_file> - NEVER skip them\n- Each code block gets its own separate ```text...``` wrapper!\n- Structure: <write_to_file><path>...</path><content>```text...code...```</content></write_to_file>\n- CRITICAL: Preserve EXACT indentation (spaces/tabs) from original code - count spaces carefully!\n- When using <replace_in_file>, SEARCH block MUST match original indentation character-by-character\n- Example: \"  return a + b;\" (2 spaces) \u2192 you MUST write \"  return a + b;\" (2 spaces), NOT \"    return a + b;\" (4 spaces)";
    return PromptController;
}());
exports.PromptController = PromptController;
