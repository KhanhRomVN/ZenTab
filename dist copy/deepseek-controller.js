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
exports.DeepSeekController = void 0;
// src/background/deepseek-controller.ts
var chat_controller_1 = require("./deepseek/chat-controller");
var state_controller_1 = require("./deepseek/state-controller");
var prompt_controller_1 = require("./deepseek/prompt-controller");
/**
 * Facade controller để export các method từ sub-controllers
 */
var DeepSeekController = /** @class */ (function () {
    function DeepSeekController() {
    }
    // Chat operations
    DeepSeekController.clickNewChatButton = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, chat_controller_1.ChatController.clickNewChatButton(tabId)];
            });
        });
    };
    DeepSeekController.isDeepThinkEnabled = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, chat_controller_1.ChatController.isDeepThinkEnabled(tabId)];
            });
        });
    };
    DeepSeekController.toggleDeepThink = function (tabId, enable) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, chat_controller_1.ChatController.toggleDeepThink(tabId, enable)];
            });
        });
    };
    DeepSeekController.createNewChat = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, chat_controller_1.ChatController.createNewChat(tabId)];
            });
        });
    };
    DeepSeekController.getChatTitle = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, chat_controller_1.ChatController.getChatTitle(tabId)];
            });
        });
    };
    // State operations
    DeepSeekController.isGenerating = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, state_controller_1.StateController.isGenerating(tabId)];
            });
        });
    };
    DeepSeekController.stopGeneration = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, state_controller_1.StateController.stopGeneration(tabId)];
            });
        });
    };
    DeepSeekController.getCurrentInput = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, state_controller_1.StateController.getCurrentInput(tabId)];
            });
        });
    };
    DeepSeekController.getLatestResponse = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, state_controller_1.StateController.getLatestResponse(tabId)];
            });
        });
    };
    // Implementation
    DeepSeekController.sendPrompt = function (tabId, promptOrSystemPrompt, userPromptOrRequestId, requestIdOrIsNewTask, isNewTask) {
        return __awaiter(this, void 0, void 0, function () {
            var result, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(typeof requestIdOrIsNewTask === "string")) return [3 /*break*/, 2];
                        return [4 /*yield*/, prompt_controller_1.PromptController.sendPrompt(tabId, promptOrSystemPrompt, userPromptOrRequestId, requestIdOrIsNewTask, isNewTask)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2: return [4 /*yield*/, prompt_controller_1.PromptController.sendPrompt(tabId, promptOrSystemPrompt || "", userPromptOrRequestId, requestIdOrIsNewTask)];
                    case 3:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        });
    };
    // Token management operations
    DeepSeekController.clearTokensForFolder = function (folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, prompt_controller_1.PromptController.clearTokensForFolder(folderPath)];
            });
        });
    };
    return DeepSeekController;
}());
exports.DeepSeekController = DeepSeekController;
