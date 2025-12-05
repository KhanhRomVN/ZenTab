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
exports.WSManagerNew = void 0;
// src/background/ws-manager-new.ts
var ws_connection_1 = require("./ws-connection");
var WSManagerNew = /** @class */ (function () {
    function WSManagerNew() {
        this.connection = null;
        this.cleanupOldConnections();
        this.setupStorageListener();
        this.setupStateQueryHandler();
    }
    WSManagerNew.prototype.setupStateQueryHandler = function () {
        var _this = this;
        chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
            if (message.action === "getWSConnectionInfo") {
                if (_this.connection) {
                    var state = _this.connection.getState();
                    sendResponse({
                        success: true,
                        state: state,
                    });
                }
                else {
                    sendResponse({
                        success: false,
                        error: "No WebSocket connection available",
                    });
                }
                return true;
            }
        });
    };
    WSManagerNew.prototype.cleanupOldConnections = function () {
        chrome.storage.local.remove([
            "wsMessages",
            "wsOutgoingMessage",
            "wsIncomingRequest",
        ]);
    };
    WSManagerNew.prototype.isValidApiProvider = function (apiProvider) {
        // 🔥 FIX: Chấp nhận empty string (user chưa config) - không cần validate
        if (!apiProvider || apiProvider.trim() === "") {
            return false;
        }
        return true;
    };
    WSManagerNew.prototype.parseApiProvider = function (apiProvider) {
        var url = apiProvider.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://".concat(url);
        }
        var urlObj;
        try {
            urlObj = new URL(url);
        }
        catch (error) {
            console.error("[WSManager] \u274C Failed to parse URL: ".concat(url));
            console.error("[WSManager] \uD83D\uDD0D Error:", error);
            throw new Error("Invalid API Provider URL: ".concat(apiProvider));
        }
        var isHttps = urlObj.protocol === "https:";
        var protocol = isHttps ? "wss" : "ws";
        var host = urlObj.hostname;
        var port = 80;
        if (urlObj.port) {
            port = parseInt(urlObj.port, 10);
        }
        else if (isHttps) {
            port = 443;
        }
        else {
            port = 80;
        }
        var wsUrl = isHttps && !urlObj.port
            ? "".concat(protocol, "://").concat(host, "/ws")
            : "".concat(protocol, "://").concat(host, ":").concat(port, "/ws");
        return { protocol: protocol, host: host, port: port, wsUrl: wsUrl };
    };
    /**
     * Broadcast message to single connected WebSocket client (port 1500)
     */
    WSManagerNew.prototype.broadcastToAll = function (message) {
        var _a;
        if (this.connection && this.connection.state.status === "connected") {
            try {
                this.connection.send(message);
            }
            catch (error) {
                console.error("[WSManager] ❌ Failed to broadcast message:", error);
                console.error("[WSManager] \uD83D\uDD0D Message type: ".concat(message.type));
                console.error("[WSManager] \uD83D\uDD0D Connection state: ".concat(this.connection.state.status));
            }
        }
        else {
            console.warn("[WSManager] \u26A0\uFE0F Cannot broadcast - connection not available or not connected");
            console.warn("[WSManager] \uD83D\uDD0D Connection exists: ".concat(!!this.connection));
            console.warn("[WSManager] \uD83D\uDD0D Connection status: ".concat(((_a = this.connection) === null || _a === void 0 ? void 0 : _a.state.status) || "N/A"));
        }
    };
    /**
     * Kiểm tra WebSocket connection (port 1500) có đang connected không
     */
    WSManagerNew.prototype.hasActiveConnections = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (this.connection !== null && this.connection.state.status === "connected")];
            });
        });
    };
    WSManagerNew.prototype.setupStorageListener = function () {
        var _this = this;
        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName !== "local")
                return;
            if (changes.apiProvider) {
                var newApiProvider = changes.apiProvider.newValue;
                var oldApiProvider = changes.apiProvider.oldValue;
                if (newApiProvider !== oldApiProvider) {
                    if (_this.connection) {
                        _this.connection.disconnect();
                        _this.connection = null;
                    }
                }
            }
        });
    };
    WSManagerNew.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var storageResult, apiProvider, errorMsg, _a, port, wsUrl, connectionId, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.connection && this.connection.state.status === "connected") {
                            return [2 /*return*/, { success: true }];
                        }
                        if (this.connection && this.connection.state.status === "connecting") {
                            console.warn("[WSManager] \u26A0\uFE0F Connection already in progress");
                            return [2 /*return*/, { success: false, error: "Already connecting" }];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.storage.local.get(["apiProvider"], function (data) {
                                    resolve(data || {});
                                });
                            })];
                    case 2:
                        storageResult = _b.sent();
                        apiProvider = storageResult === null || storageResult === void 0 ? void 0 : storageResult.apiProvider;
                        // 🔥 FIX: Nếu chưa có API Provider, KHÔNG connect và throw error
                        if (!apiProvider || !this.isValidApiProvider(apiProvider)) {
                            errorMsg = "API Provider not configured. Please set it in Settings.";
                            console.error("[WSManager] \u274C ".concat(errorMsg));
                            return [2 /*return*/, {
                                    success: false,
                                    error: errorMsg,
                                }];
                        }
                        _a = this.parseApiProvider(apiProvider), port = _a.port, wsUrl = _a.wsUrl;
                        connectionId = "ws-".concat(Date.now(), "-").concat(port);
                        this.connection = new ws_connection_1.WSConnection({
                            id: connectionId,
                            port: port,
                            url: wsUrl,
                        });
                        return [4 /*yield*/, this.connection.connect()];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, { success: true }];
                    case 4:
                        error_1 = _b.sent();
                        console.error("[WSManager] \u274C Connection failed:", error_1);
                        this.connection = null;
                        return [2 /*return*/, {
                                success: false,
                                error: error_1 instanceof Error ? error_1.message : String(error_1),
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    WSManagerNew.prototype.disconnect = function () {
        if (!this.connection) {
            return { success: true };
        }
        try {
            this.connection.disconnect();
            this.connection = null;
            return { success: true };
        }
        catch (error) {
            console.error("[WSManager] \u274C Disconnect failed:", error);
            return { success: false };
        }
    };
    WSManagerNew.prototype.sendResponse = function (data) {
        if (this.connection && this.connection.state.status === "connected") {
            this.connection.send(data);
            return true;
        }
        return false;
    };
    return WSManagerNew;
}());
exports.WSManagerNew = WSManagerNew;
