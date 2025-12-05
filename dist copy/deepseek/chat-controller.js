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
exports.ChatController = void 0;
// src/background/deepseek/chat-controller.ts
var browser_helper_1 = require("../utils/browser-helper");
var ChatController = /** @class */ (function () {
    function ChatController() {
    }
    /**
     * Lấy trạng thái DeepThink button
     */
    ChatController.isDeepThinkEnabled = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var button = document.querySelector("button.ds-toggle-button");
                                if (!button)
                                    return null;
                                return button.classList.contains("ds-toggle-button--selected");
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : false];
                    case 2:
                        error_1 = _a.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Bật/tắt DeepThink
     */
    ChatController.toggleDeepThink = function (tabId, enable) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function (targetState) {
                                var button = document.querySelector("button.ds-toggle-button");
                                if (!button)
                                    return false;
                                var isCurrentlyEnabled = button.classList.contains("ds-toggle-button--selected");
                                if (isCurrentlyEnabled !== targetState) {
                                    button.click();
                                    return true;
                                }
                                return false;
                            }, [enable])];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : false];
                    case 2:
                        error_2 = _a.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Click vào button "New Chat"
     */
    ChatController.clickNewChatButton = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var _a;
                                var button1 = document.querySelector('.ds-icon-button._4f3769f[role="button"]');
                                if (button1 && !button1.getAttribute("aria-disabled")) {
                                    button1.click();
                                    return true;
                                }
                                var allButtons = Array.from(document.querySelectorAll("._5a8ac7a"));
                                for (var _i = 0, allButtons_1 = allButtons; _i < allButtons_1.length; _i++) {
                                    var btn = allButtons_1[_i];
                                    var svg = btn.querySelector("svg");
                                    var pathD = (_a = svg === null || svg === void 0 ? void 0 : svg.querySelector("path")) === null || _a === void 0 ? void 0 : _a.getAttribute("d");
                                    if (pathD &&
                                        pathD.includes("M8 0.599609C3.91309 0.599609") &&
                                        pathD.includes("M7.34473 4.93945V7.34961")) {
                                        btn.click();
                                        return true;
                                    }
                                }
                                return false;
                            })];
                    case 1:
                        result = _a.sent();
                        if (!result) return [3 /*break*/, 3];
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 3: return [2 /*return*/, false];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_3 = _a.sent();
                        return [2 /*return*/, false];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Tạo chat mới
     */
    ChatController.createNewChat = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var newChatButton = document.querySelector("button.ds-floating-button--secondary");
                                if (newChatButton && !newChatButton.disabled) {
                                    newChatButton.click();
                                    return true;
                                }
                                return false;
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : false];
                    case 2:
                        error_4 = _a.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Lấy title của chat hiện tại
     */
    ChatController.getChatTitle = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var _a;
                                var titleElement = document.querySelector(".afa34042.e37a04e4.e0a1edb7");
                                return ((_a = titleElement === null || titleElement === void 0 ? void 0 : titleElement.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || null;
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : null];
                    case 2:
                        error_5 = _a.sent();
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return ChatController;
}());
exports.ChatController = ChatController;
