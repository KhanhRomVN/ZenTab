"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.WSConnection = void 0;
var WSConnection = /** @class */ (function () {
    function WSConnection(config) {
        this.forwardedRequests = new Set();
        this.lastPingTime = 0;
        this.PING_TIMEOUT = 90000; // 90 seconds (45s backend ping + 45s buffer)
        this.state = {
            id: config.id,
            port: config.port,
            url: config.url,
            status: "disconnected",
        };
        this.notifyStateChange();
        // CRITICAL: Setup storage listener để forward wsOutgoingMessage qua WebSocket
        this.setupOutgoingMessageListener();
    }
    WSConnection.prototype.disconnect = function () {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.state.status = "disconnected";
        this.notifyStateChange();
    };
    WSConnection.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (this.state.status === "connected" ||
                    this.state.status === "connecting") {
                    return [2 /*return*/];
                }
                this.state.status = "connecting";
                this.notifyStateChange();
                return [2 /*return*/, new Promise(function (resolve) {
                        try {
                            _this.ws = new WebSocket(_this.state.url);
                            _this.ws.onopen = function () {
                                _this.state.status = "connected";
                                _this.state.lastConnected = Date.now();
                                _this.lastPingTime = Date.now();
                                _this.notifyStateChange();
                                // Start health monitoring
                                _this.startHealthMonitor();
                                resolve();
                            };
                            _this.ws.onerror = function (error) {
                                var _a;
                                console.error("[WSConnection] \u274C WebSocket ERROR for ".concat(_this.state.url, ":"), {
                                    errorType: error.type,
                                    readyState: (_a = _this.ws) === null || _a === void 0 ? void 0 : _a.readyState,
                                    connectionId: _this.state.id,
                                    currentStatus: _this.state.status,
                                });
                                var wasAttemptingConnection = _this.state.status === "connected" ||
                                    _this.state.status === "connecting";
                                if (wasAttemptingConnection) {
                                    _this.sendDisconnectSignal();
                                }
                                _this.state.status = "error";
                                _this.notifyStateChange();
                            };
                            _this.ws.onclose = function () {
                                // 🆕 FIX: Gửi disconnect signal cho MỌI trạng thái (kể cả "connecting")
                                var wasAttemptingConnection = _this.state.status === "connected" ||
                                    _this.state.status === "connecting";
                                if (wasAttemptingConnection) {
                                    _this.state.status = "disconnected";
                                    _this.notifyStateChange();
                                    // 🆕 Gửi EMPTY focusedTabsUpdate để notify Zen về disconnect
                                    try {
                                        chrome.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: _this.state.id,
                                                data: {
                                                    type: "focusedTabsUpdate",
                                                    data: [], // 🆕 EMPTY array = disconnect signal
                                                    timestamp: Date.now(),
                                                },
                                                timestamp: Date.now(),
                                            },
                                        });
                                        // Cleanup sau 500ms
                                        setTimeout(function () {
                                            chrome.storage.local.remove(["wsOutgoingMessage"], function () { });
                                        }, 500);
                                    }
                                    catch (error) {
                                        console.error("[WSConnection] \u274C Failed to send disconnect signal:", error);
                                    }
                                }
                                else {
                                    // Nếu đã disconnected rồi, vẫn update state
                                    _this.state.status = "disconnected";
                                    _this.notifyStateChange();
                                }
                            };
                            _this.ws.onmessage = function (event) {
                                _this.handleMessage(event.data);
                            };
                        }
                        catch (error) {
                            console.error("[WSConnection] \u274C Exception during WebSocket creation");
                            console.error("[WSConnection] \uD83D\uDD0D Exception details:", {
                                error: error,
                                message: error instanceof Error ? error.message : String(error),
                                stack: error instanceof Error ? error.stack : undefined,
                                connectionId: _this.state.id,
                                url: _this.state.url,
                            });
                            console.error("[WSConnection] \uD83D\uDCA1 This usually means:");
                            console.error("  - Invalid WebSocket URL format");
                            console.error("  - Browser blocking WebSocket protocol");
                            console.error("  - Extension permission issues");
                            _this.state.status = "error";
                            _this.notifyStateChange();
                            resolve();
                        }
                    })];
            });
        });
    };
    WSConnection.prototype.send = function (data) {
        if (this.ws && this.state.status === "connected") {
            try {
                var messageStr = JSON.stringify(data);
                this.ws.send(messageStr);
            }
            catch (error) {
                console.error("[WSConnection] \u274C Failed to send message:", error);
                console.error("[WSConnection] \uD83D\uDD0D Data type: ".concat(typeof data));
                console.error("[WSConnection] \uD83D\uDD0D Data:", data);
            }
        }
        else {
            console.warn("[WSConnection] \u26A0\uFE0F Cannot send - WebSocket not ready");
            console.warn("[WSConnection] \uD83D\uDD0D WebSocket exists: ".concat(!!this.ws));
            console.warn("[WSConnection] \uD83D\uDD0D Connection status: ".concat(this.state.status));
        }
    };
    WSConnection.prototype.handleMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var receiveTime, message_1, newTimestamp, pongMessage, folderPath, dedupeKey_1, result, storageError_1, storagePayload, requestId, folderPath, dedupeKey_2, result, storageError_2, storagePayload, requestId, dedupeKey_3, result, storageError_3, storagePayload, requestId, storageKey_1, result, storageError_4, storageKey_2, currentTimestamp_1, storageError_5, storageKey_3, messageTimestamp, messageAge, error_1;
            var _a, _b, _c, _d;
            var _this = this;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        receiveTime = Date.now();
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 26, , 27]);
                        message_1 = JSON.parse(data);
                        if (!message_1.timestamp) {
                            newTimestamp = Date.now();
                            message_1.timestamp = newTimestamp;
                        }
                        if (!message_1.timestamp) {
                            message_1.timestamp = Date.now();
                        }
                        // CRITICAL: Handle ping messages - reply with pong
                        if (message_1.type === "ping") {
                            try {
                                if (this.ws && this.state.status === "connected") {
                                    // 🆕 CRITICAL FIX: Update lastPingTime khi nhận ping
                                    this.lastPingTime = Date.now();
                                    pongMessage = {
                                        type: "pong",
                                        timestamp: Date.now(),
                                    };
                                    this.ws.send(JSON.stringify(pongMessage));
                                }
                            }
                            catch (pongError) {
                                console.error("[WSConnection] \u274C Failed to send pong:", pongError);
                            }
                            return [2 /*return*/]; // Don't process ping further
                        }
                        if (message_1.type === "cleanupMessages") {
                            chrome.storage.local.remove(["wsMessages", "wsOutgoingMessage"], function () { });
                            chrome.storage.local.get(null, function (allItems) {
                                var keysToRemove = [];
                                for (var key in allItems) {
                                    if (key.startsWith("testResponse_") ||
                                        key.includes("request") ||
                                        key.startsWith("forwarded_") ||
                                        key.startsWith("processed_")) {
                                        keysToRemove.push(key);
                                    }
                                }
                                if (keysToRemove.length > 0) {
                                    chrome.storage.local.remove(keysToRemove, function () { });
                                }
                            });
                            this.forwardedRequests.clear();
                            return [2 /*return*/];
                        }
                        if (!(message_1.type === "cleanupFolderLink")) return [3 /*break*/, 6];
                        folderPath = message_1.folderPath;
                        if (!folderPath) {
                            return [2 /*return*/];
                        }
                        dedupeKey_1 = "cleanup_".concat(folderPath, "_").concat(Date.now());
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.storage.local.get([dedupeKey_1], function (data) {
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        result = _e.sent();
                        if (result[dedupeKey_1]) {
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        storageError_1 = _e.sent();
                        console.error("[WSConnection] ❌ Cleanup dedupe check failed:", storageError_1);
                        return [3 /*break*/, 5];
                    case 5:
                        chrome.storage.local.set((_a = {}, _a[dedupeKey_1] = Date.now(), _a));
                        setTimeout(function () {
                            chrome.storage.local.remove([dedupeKey_1]);
                        }, 5000);
                        storagePayload = {
                            wsIncomingRequest: {
                                type: "cleanupFolderLink",
                                folderPath: folderPath,
                                connectionId: this.state.id,
                                timestamp: Date.now(),
                            },
                        };
                        chrome.storage.local.set(storagePayload, function () {
                            if (chrome.runtime.lastError) {
                                console.error("[WSConnection] ❌ Failed to set cleanupFolderLink:", chrome.runtime.lastError);
                                return;
                            }
                        });
                        return [2 /*return*/];
                    case 6:
                        if (!(message_1.type === "getTabsByFolder")) return [3 /*break*/, 11];
                        requestId = message_1.requestId;
                        folderPath = message_1.folderPath;
                        if (!folderPath) {
                            return [2 /*return*/];
                        }
                        dedupeKey_2 = "folder_req_".concat(requestId);
                        _e.label = 7;
                    case 7:
                        _e.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.storage.local.get([dedupeKey_2], function (data) {
                                    resolve(data || {});
                                });
                            })];
                    case 8:
                        result = _e.sent();
                        if (result[dedupeKey_2]) {
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 10];
                    case 9:
                        storageError_2 = _e.sent();
                        console.error("[WSConnection] ❌ Folder request dedupe check failed:", storageError_2);
                        return [3 /*break*/, 10];
                    case 10:
                        chrome.storage.local.set((_b = {}, _b[dedupeKey_2] = Date.now(), _b));
                        setTimeout(function () {
                            chrome.storage.local.remove([dedupeKey_2]);
                        }, 5000);
                        storagePayload = {
                            wsIncomingRequest: {
                                type: "getTabsByFolder",
                                requestId: message_1.requestId,
                                folderPath: folderPath,
                                connectionId: this.state.id,
                                timestamp: Date.now(),
                            },
                        };
                        chrome.storage.local.set(storagePayload, function () {
                            if (chrome.runtime.lastError) {
                                console.error("[WSConnection] ❌ Failed to set getAvailableTabs:", chrome.runtime.lastError);
                                return;
                            }
                        });
                        return [2 /*return*/];
                    case 11:
                        if (!(message_1.type === "getAvailableTabs")) return [3 /*break*/, 16];
                        requestId = message_1.requestId;
                        dedupeKey_3 = "tabs_req_".concat(requestId);
                        _e.label = 12;
                    case 12:
                        _e.trys.push([12, 14, , 15]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.storage.local.get([dedupeKey_3], function (data) {
                                    resolve(data || {});
                                });
                            })];
                    case 13:
                        result = _e.sent();
                        if (result[dedupeKey_3]) {
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 15];
                    case 14:
                        storageError_3 = _e.sent();
                        return [3 /*break*/, 15];
                    case 15:
                        chrome.storage.local.set((_c = {}, _c[dedupeKey_3] = Date.now(), _c));
                        setTimeout(function () {
                            chrome.storage.local.remove([dedupeKey_3]);
                        }, 5000);
                        storagePayload = {
                            wsIncomingRequest: {
                                type: "getAvailableTabs",
                                requestId: message_1.requestId,
                                connectionId: this.state.id,
                                timestamp: Date.now(),
                            },
                        };
                        chrome.storage.local.set(storagePayload, function () {
                            if (chrome.runtime.lastError) {
                                console.error("[WSConnection] ❌ Failed to set getAvailableTabs:", chrome.runtime.lastError);
                                return;
                            }
                        });
                        return [2 /*return*/];
                    case 16:
                        if (!(message_1.type === "promptResponse")) return [3 /*break*/, 25];
                        requestId = message_1.requestId;
                        if (this.forwardedRequests.has(requestId)) {
                            return [2 /*return*/];
                        }
                        _e.label = 17;
                    case 17:
                        _e.trys.push([17, 19, , 20]);
                        storageKey_1 = "forwarded_".concat(requestId);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.storage.local.get([storageKey_1], function (data) {
                                    resolve(data || {});
                                });
                            })];
                    case 18:
                        result = _e.sent();
                        if (result[storageKey_1]) {
                            return [2 /*return*/];
                        }
                        return [3 /*break*/, 20];
                    case 19:
                        storageError_4 = _e.sent();
                        return [3 /*break*/, 20];
                    case 20:
                        this.forwardedRequests.add(requestId);
                        _e.label = 21;
                    case 21:
                        _e.trys.push([21, 23, , 24]);
                        storageKey_2 = "forwarded_".concat(requestId);
                        currentTimestamp_1 = Date.now();
                        return [4 /*yield*/, new Promise(function (resolve) {
                                var _a;
                                chrome.storage.local.set((_a = {}, _a[storageKey_2] = currentTimestamp_1, _a), function () {
                                    resolve();
                                });
                            })];
                    case 22:
                        _e.sent();
                        return [3 /*break*/, 24];
                    case 23:
                        storageError_5 = _e.sent();
                        return [3 /*break*/, 24];
                    case 24:
                        setTimeout(function () {
                            _this.forwardedRequests.delete(message_1.requestId);
                        }, 60000);
                        // Gửi trực tiếp qua WebSocket thay vì lưu storage
                        this.send(message_1);
                        storageKey_3 = "forwarded_".concat(message_1.requestId);
                        chrome.storage.local.set((_d = {},
                            _d[storageKey_3] = Date.now(),
                            _d), function () {
                            setTimeout(function () {
                                chrome.storage.local.remove([storageKey_3]);
                            }, 60000);
                        });
                        return [2 /*return*/];
                    case 25:
                        messageTimestamp = message_1.timestamp || 0;
                        messageAge = messageTimestamp > 0 ? Date.now() - messageTimestamp : 0;
                        if (messageTimestamp === 0) {
                        }
                        else {
                            if (messageAge > 60000) {
                                console.error("[WSConnection] \u274C Message too old (".concat(messageAge, "ms), skipping!"));
                                return [2 /*return*/];
                            }
                        }
                        chrome.storage.local.get(["wsMessages"], function (result) {
                            var messages = result.wsMessages || {};
                            if (!messages[_this.state.id]) {
                                messages[_this.state.id] = [];
                            }
                            // Messages như focusedTabsUpdate, ping, pong KHÔNG có requestId → skip duplicate check
                            var isDuplicate = message_1.requestId
                                ? messages[_this.state.id].some(function (existing) { return existing.data.requestId === message_1.requestId; })
                                : false;
                            if (isDuplicate) {
                                console.error("[WSConnection] \u274C DUPLICATE MESSAGE DETECTED, SKIPPING:", {
                                    requestId: message_1.requestId,
                                    messageType: message_1.type,
                                    existingCount: messages[_this.state.id].length,
                                });
                                return;
                            }
                            var sanitizedMessage = message_1;
                            if (message_1.type === "promptResponse" && message_1.response) {
                                try {
                                    JSON.parse(message_1.response);
                                    sanitizedMessage = __assign(__assign({}, message_1), { response: message_1.response });
                                }
                                catch (parseError) {
                                    sanitizedMessage = __assign(__assign({}, message_1), { response: JSON.stringify(message_1.response) });
                                }
                            }
                            messages[_this.state.id].push({
                                timestamp: Date.now(),
                                data: sanitizedMessage,
                            });
                            if (messages[_this.state.id].length > 50) {
                                messages[_this.state.id] = messages[_this.state.id].slice(-50);
                            }
                            chrome.storage.local.set({ wsMessages: messages }, function () {
                                // Verify save
                                chrome.storage.local.get(["wsMessages"], function (verifyResult) {
                                    var _a;
                                    var verifyMessages = verifyResult.wsMessages || {};
                                    var saved = (_a = verifyMessages[_this.state.id]) === null || _a === void 0 ? void 0 : _a.find(function (m) { return m.data.requestId === message_1.requestId; });
                                    if (saved) {
                                    }
                                    else {
                                        console.error("[WSConnection] \u274C VERIFICATION FAILED: Message NOT found in storage!");
                                    }
                                });
                            });
                        });
                        return [3 /*break*/, 27];
                    case 26:
                        error_1 = _e.sent();
                        console.error("[WSConnection] \u274C Exception in handleMessage:", {
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                            stack: error_1 instanceof Error ? error_1.stack : undefined,
                            messagePreview: data.substring(0, 200),
                        });
                        return [3 /*break*/, 27];
                    case 27: return [2 /*return*/];
                }
            });
        });
    };
    WSConnection.prototype.notifyStateChange = function () {
        var _this = this;
        var updateStorage = function () { return __awaiter(_this, void 0, void 0, function () {
            var result, states_1, newState, verifyResult, verifyStates, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.local.get(["wsStates"], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_1 = result.wsStates || {};
                        newState = {
                            id: this.state.id,
                            port: this.state.port,
                            url: this.state.url,
                            status: this.state.status,
                            lastConnected: this.state.lastConnected,
                        };
                        states_1[this.state.id] = newState;
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.local.set({ wsStates: states_1 }, function () {
                                    if (chrome.runtime.lastError) {
                                        console.error("[WSConnection] ❌ Error saving wsStates:", chrome.runtime.lastError);
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.local.get(["wsStates"], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = verifyResult.wsStates || {};
                        if (verifyStates[this.state.id]) {
                        }
                        else {
                            console.error("[WSConnection] \u274C State NOT found in storage after save!");
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _a.sent();
                        console.error("[WSConnection] ❌ Error in notifyStateChange:", error_2);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        updateStorage();
        // Also try to send message (fallback communication)
        try {
            var promise = chrome.runtime.sendMessage({
                type: "wsStateChanged",
                connectionId: this.state.id,
                state: __assign({}, this.state),
            });
            if (promise && typeof promise.catch === "function") {
                promise.catch(function () { });
            }
        }
        catch (error) {
            // Ignore message errors
        }
    };
    WSConnection.prototype.getState = function () {
        return __assign({}, this.state);
    };
    /**
     * Listen for wsOutgoingMessage from ServiceWorker và forward qua WebSocket
     */
    WSConnection.prototype.setupOutgoingMessageListener = function () {
        var _this = this;
        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName !== "local")
                return;
            if (changes.wsOutgoingMessage) {
                var outgoingMessage = changes.wsOutgoingMessage.newValue;
                if (!outgoingMessage)
                    return;
                // Check nếu message thuộc connection này
                if (outgoingMessage.connectionId !== _this.state.id) {
                    return;
                }
                // Forward qua WebSocket
                if (_this.ws && _this.state.status === "connected") {
                    try {
                        _this.ws.send(JSON.stringify(outgoingMessage.data));
                    }
                    catch (error) {
                        console.error("[WSConnection] \u274C Failed to send message:", error);
                    }
                }
                // Cleanup message sau khi gửi
                setTimeout(function () {
                    chrome.storage.local.remove(["wsOutgoingMessage"]);
                }, 100);
            }
        });
    };
    /**
     * Monitor connection health based on ping/pong
     */
    WSConnection.prototype.startHealthMonitor = function () {
        var _this = this;
        var _a;
        var checkInterval = setInterval(function () {
            if (_this.state.status !== "connected") {
                return;
            }
            var timeSinceLastPing = Date.now() - _this.lastPingTime;
            if (timeSinceLastPing > _this.PING_TIMEOUT) {
                // Force reconnect
                if (_this.ws) {
                    _this.ws.close();
                }
            }
        }, 10000); // Check every 10 seconds
        // Cleanup on disconnect
        (_a = this.ws) === null || _a === void 0 ? void 0 : _a.addEventListener("close", function () {
            clearInterval(checkInterval);
        });
    };
    /**
     * 🆕 Helper method để gửi disconnect signal
     */
    WSConnection.prototype.sendDisconnectSignal = function () {
        try {
            chrome.storage.local.set({
                wsOutgoingMessage: {
                    connectionId: this.state.id,
                    data: {
                        type: "focusedTabsUpdate",
                        data: [],
                        timestamp: Date.now(),
                    },
                    timestamp: Date.now(),
                },
            });
            setTimeout(function () {
                chrome.storage.local.remove(["wsOutgoingMessage"]);
            }, 500);
        }
        catch (error) {
            console.error("[WSConnection] \u274C Failed to send disconnect signal:", error);
        }
    };
    /**
     * 🆕 Force disconnect với disconnect signal
     */
    WSConnection.prototype.forceDisconnect = function () {
        // Gửi disconnect signal trước
        this.sendDisconnectSignal();
        // Đóng WebSocket nếu có
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        // Update state
        this.state.status = "disconnected";
        this.notifyStateChange();
    };
    return WSConnection;
}());
exports.WSConnection = WSConnection;
