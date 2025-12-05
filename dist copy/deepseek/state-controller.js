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
exports.StateController = void 0;
// src/background/deepseek/state-controller.ts
var browser_helper_1 = require("../utils/browser-helper");
var StateController = /** @class */ (function () {
    function StateController() {
    }
    /**
     * Kiểm tra xem AI có đang trả lời không
     */
    StateController.isGenerating = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, isGenerating, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var sendButton = document.querySelector(".ds-icon-button._7436101");
                                if (!sendButton) {
                                    return false;
                                }
                                var svg = sendButton.querySelector("svg");
                                if (!svg) {
                                    return false;
                                }
                                var path = svg.querySelector("path");
                                if (!path) {
                                    return false;
                                }
                                var pathData = path.getAttribute("d") || "";
                                var isStopIcon = pathData.includes("M2 4.88006") &&
                                    pathData.includes("C2 3.68015") &&
                                    pathData.includes("2.30557 2.6596");
                                var isSendIcon = pathData.includes("M8.3125 0.981648") &&
                                    pathData.includes("9.2627 1.4338") &&
                                    pathData.includes("9.97949 2.1086");
                                if (isStopIcon) {
                                    return true;
                                }
                                if (isSendIcon) {
                                    return false;
                                }
                                if (pathData.startsWith("M2") && pathData.length > 100) {
                                    return true;
                                }
                                else if (pathData.startsWith("M8") && pathData.length > 50) {
                                    return false;
                                }
                                return false;
                            })];
                    case 1:
                        result = _a.sent();
                        isGenerating = result !== null && result !== void 0 ? result : false;
                        return [2 /*return*/, isGenerating];
                    case 2:
                        error_1 = _a.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Dừng AI đang trả lời
     */
    StateController.stopGeneration = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var stopButton = document.querySelector('.ds-icon-button._7436101 svg path[d*="M2 4.88006"]');
                                if (stopButton) {
                                    var button = stopButton.closest("button");
                                    if (button &&
                                        !button.classList.contains("ds-icon-button--disabled")) {
                                        button.click();
                                        return true;
                                    }
                                }
                                return false;
                            })];
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
     * Lấy input hiện tại
     */
    StateController.getCurrentInput = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var textarea = document.querySelector('textarea[placeholder="Message DeepSeek"]');
                                return (textarea === null || textarea === void 0 ? void 0 : textarea.value) || "";
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : ""];
                    case 2:
                        error_3 = _a.sent();
                        return [2 /*return*/, ""];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Lấy nội dung response mới nhất của AI
     */
    StateController.getLatestResponse = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, browser_helper_1.executeScript)(tabId, function () {
                                var _a;
                                var copyButtons = Array.from(document.querySelectorAll(".ds-icon-button.db183363"));
                                if (copyButtons.length === 0)
                                    return null;
                                var lastCopyButton = copyButtons[copyButtons.length - 1];
                                var messageContainer = lastCopyButton.closest('[class*="message"]');
                                if (!messageContainer)
                                    return null;
                                return ((_a = messageContainer.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || null;
                            })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result !== null && result !== void 0 ? result : null];
                    case 2:
                        error_4 = _a.sent();
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return StateController;
}());
exports.StateController = StateController;
