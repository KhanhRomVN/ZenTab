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
exports.TabBroadcaster = void 0;
var TabBroadcaster = /** @class */ (function () {
    function TabBroadcaster(wsManager) {
        this.lastBroadcastTime = 0;
        this.BROADCAST_THROTTLE = 2000; // 2 seconds để tránh spam
        this.broadcastCount = 0;
        this.wsManager = wsManager;
        this.setupListeners();
    }
    TabBroadcaster.prototype.setupListeners = function () {
        var _this = this;
        var pendingBroadcast = null;
        var debouncedBroadcast = function () {
            if (pendingBroadcast) {
                clearTimeout(pendingBroadcast);
            }
            pendingBroadcast = setTimeout(function () {
                _this.broadcastFocusedTabs();
                pendingBroadcast = null;
            }, 500);
        };
        chrome.storage.onChanged.addListener(function (changes, areaName) { return __awaiter(_this, void 0, void 0, function () {
            var newStates, oldStates, hasDisconnected, _i, _a, _b, connId, newState, oldState, newConnIds, oldConnIds, _c, newConnIds_1, connId, oldState, newState, hasNewConnection, latestConnId, newState, newState, oldState, disconnectMessage;
            return __generator(this, function (_d) {
                if (areaName !== "local")
                    return [2 /*return*/];
                if (changes.zenTabSelectedTabs) {
                    debouncedBroadcast();
                }
                if (changes.wsStates) {
                    newStates = changes.wsStates.newValue || {};
                    oldStates = changes.wsStates.oldValue || {};
                    hasDisconnected = false;
                    for (_i = 0, _a = Object.entries(newStates); _i < _a.length; _i++) {
                        _b = _a[_i], connId = _b[0], newState = _b[1];
                        oldState = oldStates[connId];
                        if ((oldState === null || oldState === void 0 ? void 0 : oldState.status) === "connected" &&
                            newState.status === "disconnected") {
                            hasDisconnected = true;
                            break;
                        }
                    }
                    if (Object.keys(newStates).length === 0 &&
                        Object.keys(oldStates).length > 0) {
                        hasDisconnected = true;
                    }
                    newConnIds = Object.keys(newStates);
                    oldConnIds = Object.keys(oldStates);
                    if (oldConnIds.length > 0 && newConnIds.length === 0) {
                        hasDisconnected = true;
                    }
                    else if (newConnIds.length > 0) {
                        for (_c = 0, newConnIds_1 = newConnIds; _c < newConnIds_1.length; _c++) {
                            connId = newConnIds_1[_c];
                            oldState = oldStates[connId];
                            newState = newStates[connId];
                            if ((oldState === null || oldState === void 0 ? void 0 : oldState.status) === "connected" &&
                                (newState === null || newState === void 0 ? void 0 : newState.status) === "disconnected") {
                                hasDisconnected = true;
                                break;
                            }
                        }
                    }
                    hasNewConnection = false;
                    if (newConnIds.length > 0) {
                        latestConnId = newConnIds[0];
                        if (!oldConnIds.includes(latestConnId)) {
                            newState = newStates[latestConnId];
                            if (newState.status === "connected") {
                                hasNewConnection = true;
                            }
                        }
                        else {
                            newState = newStates[latestConnId];
                            oldState = oldStates[latestConnId];
                            if (newState.status === "connected" &&
                                (oldState === null || oldState === void 0 ? void 0 : oldState.status) !== "connected") {
                                hasNewConnection = true;
                            }
                        }
                    }
                    if (hasDisconnected) {
                        disconnectMessage = {
                            type: "focusedTabsUpdate",
                            data: [],
                            timestamp: Date.now(),
                        };
                        this.wsManager.broadcastToAll(disconnectMessage);
                    }
                    else if (hasNewConnection) {
                        debouncedBroadcast();
                    }
                }
                return [2 /*return*/];
            });
        }); });
        chrome.storage.onChanged.addListener(function (changes, areaName) { return __awaiter(_this, void 0, void 0, function () {
            var messages, _i, _a, _b, msgArray, msgs, recentMsgs, latestMsg;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (areaName !== "local")
                            return [2 /*return*/];
                        if (!changes.wsMessages) return [3 /*break*/, 4];
                        messages = changes.wsMessages.newValue || {};
                        _i = 0, _a = Object.entries(messages);
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        _b = _a[_i], msgArray = _b[1];
                        msgs = msgArray;
                        recentMsgs = msgs.filter(function (msg) {
                            var age = Date.now() - msg.timestamp;
                            return age < 5000;
                        });
                        if (recentMsgs.length === 0)
                            return [3 /*break*/, 3];
                        latestMsg = recentMsgs[recentMsgs.length - 1];
                        if (!(latestMsg.data.type === "requestFocusedTabs")) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.broadcastFocusedTabs()];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        chrome.tabs.onUpdated.addListener(function (_tabId, changeInfo, tab) {
            var _a;
            if (((_a = tab.url) === null || _a === void 0 ? void 0 : _a.startsWith("https://chat.deepseek.com")) &&
                (changeInfo.title || changeInfo.url)) {
                debouncedBroadcast();
            }
        });
        chrome.tabs.onRemoved.addListener(function (_tabId) {
            debouncedBroadcast();
        });
    };
    TabBroadcaster.prototype.broadcastFocusedTabs = function () {
        return __awaiter(this, void 0, void 0, function () {
            var hasConnections, now, focusedTabs, message, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.broadcastCount++;
                        return [4 /*yield*/, this.wsManager.hasActiveConnections()];
                    case 1:
                        hasConnections = _a.sent();
                        if (!hasConnections) {
                            return [2 /*return*/];
                        }
                        now = Date.now();
                        if (now - this.lastBroadcastTime < this.BROADCAST_THROTTLE) {
                            return [2 /*return*/];
                        }
                        this.lastBroadcastTime = now;
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.getFocusedTabs()];
                    case 3:
                        focusedTabs = _a.sent();
                        if (focusedTabs.length === 0) {
                            return [2 /*return*/];
                        }
                        message = {
                            type: "focusedTabsUpdate",
                            data: focusedTabs,
                            timestamp: Date.now(),
                        };
                        this.wsManager.broadcastToAll(message);
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all focused tabs with their details
     */
    TabBroadcaster.prototype.getFocusedTabs = function () {
        return __awaiter(this, void 0, void 0, function () {
            var browserAPI_1, allDeepSeekTabs, result, tabsError_1, focusedTabs, _i, allDeepSeekTabs_1, tab, focusedTab, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        browserAPI_1 = typeof globalThis.browser !== "undefined"
                            ? globalThis.browser
                            : chrome;
                        allDeepSeekTabs = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                try {
                                    browserAPI_1.tabs.query({ url: "https://chat.deepseek.com/*" }, function (tabs) {
                                        if (browserAPI_1.runtime.lastError) {
                                            reject(browserAPI_1.runtime.lastError);
                                            return;
                                        }
                                        resolve(tabs || []);
                                    });
                                }
                                catch (callError) {
                                    reject(callError);
                                }
                            })];
                    case 2:
                        result = _a.sent();
                        allDeepSeekTabs = result || [];
                        return [3 /*break*/, 4];
                    case 3:
                        tabsError_1 = _a.sent();
                        return [2 /*return*/, []];
                    case 4:
                        if (allDeepSeekTabs.length === 0) {
                            return [2 /*return*/, []];
                        }
                        focusedTabs = [];
                        for (_i = 0, allDeepSeekTabs_1 = allDeepSeekTabs; _i < allDeepSeekTabs_1.length; _i++) {
                            tab = allDeepSeekTabs_1[_i];
                            try {
                                if (!tab || !tab.id) {
                                    continue;
                                }
                                focusedTab = {
                                    tabId: tab.id,
                                    containerName: "Tab ".concat(tab.id),
                                    title: tab.title || "Untitled",
                                    url: tab.url,
                                };
                                focusedTabs.push(focusedTab);
                            }
                            catch (error) { }
                        }
                        return [2 /*return*/, focusedTabs];
                    case 5:
                        error_2 = _a.sent();
                        return [2 /*return*/, []];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return TabBroadcaster;
}());
exports.TabBroadcaster = TabBroadcaster;
