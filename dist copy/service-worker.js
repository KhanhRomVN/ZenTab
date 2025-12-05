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
var container_manager_1 = require("./container-manager");
var message_handler_1 = require("./message-handler");
var ws_manager_new_1 = require("./websocket/ws-manager-new");
var tab_broadcaster_1 = require("./websocket/tab-broadcaster");
var deepseek_controller_1 = require("./deepseek-controller");
var tab_state_manager_1 = require("./utils/tab-state-manager");
(function () {
    "use strict";
    var _this = this;
    var browserAPI = (function () {
        if (typeof browser !== "undefined")
            return browser;
        if (typeof chrome !== "undefined")
            return chrome;
        throw new Error("No browser API available");
    })();
    browserAPI.storage.local.remove([
        "wsStates",
        "wsMessages",
        "wsOutgoingMessage",
        "wsIncomingRequest",
    ]);
    // 🔥 CRITICAL: Cleanup legacy storage data from old versions
    (function () { return __awaiter(_this, void 0, void 0, function () {
        var allData, keysToRemove_1, legacyDomains, currentProvider_1, isLegacy, legacyKeys, _i, legacyKeys_1, key, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            browserAPI.storage.local.get(null, function (data) {
                                resolve(data || {});
                            });
                        })];
                case 1:
                    allData = _a.sent();
                    keysToRemove_1 = [];
                    // Check for legacy API Provider URLs (containing old domains)
                    if (allData.apiProvider) {
                        legacyDomains = ["localhost:3030", "127.0.0.1:3030"];
                        currentProvider_1 = String(allData.apiProvider || "").toLowerCase();
                        isLegacy = legacyDomains.some(function (domain) {
                            return currentProvider_1.includes(domain.toLowerCase());
                        });
                        if (isLegacy) {
                            keysToRemove_1.push("apiProvider");
                        }
                    }
                    legacyKeys = [
                        "wsConnection",
                        "wsConnectionId",
                        "wsPort",
                        "wsUrl",
                        "lastConnected",
                    ];
                    for (_i = 0, legacyKeys_1 = legacyKeys; _i < legacyKeys_1.length; _i++) {
                        key = legacyKeys_1[_i];
                        if (allData[key] !== undefined) {
                            keysToRemove_1.push(key);
                        }
                    }
                    if (!(keysToRemove_1.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, new Promise(function (resolve) {
                            browserAPI.storage.local.remove(keysToRemove_1, function () {
                                resolve();
                            });
                        })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("[ServiceWorker] \u274C Legacy cleanup failed:", error_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); })();
    var wsManager = new ws_manager_new_1.WSManagerNew();
    new tab_broadcaster_1.TabBroadcaster(wsManager);
    var tabStateManager = tab_state_manager_1.TabStateManager.getInstance();
    var containerManager = new container_manager_1.ContainerManager(browserAPI);
    var messageHandler = new message_handler_1.MessageHandler(containerManager);
    // Setup event listeners
    if (browserAPI.contextualIdentities) {
        browserAPI.contextualIdentities.onCreated.addListener(function () {
            containerManager.initializeContainers();
        });
        browserAPI.contextualIdentities.onRemoved.addListener(function () {
            containerManager.initializeContainers();
        });
    }
    browserAPI.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== "local")
            return;
        // Process incoming WebSocket messages
        if (changes.wsMessages) {
            var messages = changes.wsMessages.newValue || {};
            if (Object.keys(messages).length === 0) {
                return;
            }
            if (Object.keys(messages).length === 0) {
                return;
            }
            var _loop_1 = function (connectionId, msgArray) {
                var msgs = msgArray;
                var now = Date.now();
                var recentMsgs = msgs.filter(function (msg) {
                    var age = now - msg.timestamp;
                    return age < 180000; // 180 seconds (3 minutes)
                });
                if (recentMsgs.length === 0) {
                    return "continue";
                }
                // Get latest message
                var latestMsg = recentMsgs[recentMsgs.length - 1];
                if (latestMsg.data.type === "sendPrompt") {
                    var _c = latestMsg.data, tabId_1 = _c.tabId, systemPrompt_1 = _c.systemPrompt, userPrompt_1 = _c.userPrompt, requestId_1 = _c.requestId, isNewTask_1 = _c.isNewTask, folderPath = _c.folderPath;
                    if (!tabId_1 || !userPrompt_1 || !requestId_1) {
                        console.error("[ServiceWorker] \u274C Invalid sendPrompt message - missing required fields");
                        console.error("[ServiceWorker] \uD83D\uDCCA Message data:", {
                            tabId: tabId_1,
                            hasSystemPrompt: !!systemPrompt_1,
                            hasUserPrompt: !!userPrompt_1,
                            requestId: requestId_1,
                            isNewTask: isNewTask_1,
                            hasFolderPath: !!folderPath,
                        });
                        return "continue";
                    }
                    var requestKey_1 = "processed_".concat(requestId_1);
                    (function () { return __awaiter(_this, void 0, void 0, function () {
                        var result, isNewTaskBool, sendPromptPromise, error_2;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 3, , 4]);
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            browserAPI.storage.local.get([requestKey_1], function (data) {
                                                resolve(data || {});
                                            });
                                        })];
                                case 1:
                                    result = _a.sent();
                                    if (result[requestKey_1]) {
                                        console.error("[ServiceWorker] \u26A0\uFE0F Request already processed, skipping:", {
                                            requestId: requestId_1,
                                            processedAt: result[requestKey_1],
                                            age: Date.now() - result[requestKey_1],
                                        });
                                        return [2 /*return*/];
                                    }
                                    // Mark as processed
                                    return [4 /*yield*/, new Promise(function (resolve) {
                                            var _a;
                                            browserAPI.storage.local.set((_a = {}, _a[requestKey_1] = Date.now(), _a), function () {
                                                resolve();
                                            });
                                        })];
                                case 2:
                                    // Mark as processed
                                    _a.sent();
                                    isNewTaskBool = isNewTask_1 === true;
                                    sendPromptPromise = deepseek_controller_1.DeepSeekController.sendPrompt(tabId_1, systemPrompt_1 || null, userPrompt_1, requestId_1, isNewTaskBool);
                                    sendPromptPromise
                                        .then(function (success) {
                                        if (success) {
                                            setTimeout(function () {
                                                browserAPI.storage.local.remove([requestKey_1]);
                                            }, 120000);
                                        }
                                        else {
                                            console.error("[ServiceWorker] \u274C Failed to send prompt, notifying backend...");
                                            browserAPI.storage.local.set({
                                                wsOutgoingMessage: {
                                                    connectionId: connectionId,
                                                    data: {
                                                        type: "promptResponse",
                                                        requestId: requestId_1,
                                                        tabId: tabId_1,
                                                        success: false,
                                                        error: "Failed to send prompt to DeepSeek tab",
                                                        errorType: "SEND_FAILED",
                                                        details: {
                                                            tabId: tabId_1,
                                                            userPromptLength: userPrompt_1.length,
                                                            hasSystemPrompt: !!systemPrompt_1,
                                                            timestamp: Date.now(),
                                                        },
                                                    },
                                                    timestamp: Date.now(),
                                                },
                                            });
                                            browserAPI.storage.local.remove([requestKey_1]);
                                        }
                                    })
                                        .catch(function (error) {
                                        console.error("[ServiceWorker] \u274C Exception in DeepSeekController.sendPrompt:", error);
                                        browserAPI.storage.local.remove([requestKey_1]);
                                    });
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_2 = _a.sent();
                                    console.error("[ServiceWorker] \u274C Exception in sendPrompt handler:", error_2);
                                    browserAPI.storage.local.remove([requestKey_1]);
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); })();
                }
            };
            // Process each connection's messages
            for (var _i = 0, _a = Object.entries(messages); _i < _a.length; _i++) {
                var _b = _a[_i], connectionId = _b[0], msgArray = _b[1];
                _loop_1(connectionId, msgArray);
            }
        }
        if (changes.wsIncomingRequest) {
            var request_1 = changes.wsIncomingRequest.newValue;
            if (!request_1) {
                return;
            }
            if (request_1.type === "getAvailableTabs") {
                (function () { return __awaiter(_this, void 0, void 0, function () {
                    var requestId_2, connectionId_1, availableTabs_1, error_3;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 3, , 4]);
                                requestId_2 = request_1.requestId, connectionId_1 = request_1.connectionId;
                                // Sử dụng tabStateManager instance đã tạo ở đầu file
                                if (!tabStateManager) {
                                    console.error("[ServiceWorker] TabStateManager not available!");
                                    throw new Error("TabStateManager not initialized");
                                }
                                return [4 /*yield*/, tabStateManager.getAllTabStates()];
                            case 1:
                                availableTabs_1 = _a.sent();
                                // Send response via wsOutgoingMessage
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: connectionId_1,
                                                data: {
                                                    type: "availableTabs",
                                                    requestId: requestId_2,
                                                    tabs: availableTabs_1,
                                                    timestamp: Date.now(),
                                                },
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                console.error("[ServiceWorker] Error sending availableTabs response:", browserAPI.runtime.lastError);
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 2:
                                // Send response via wsOutgoingMessage
                                _a.sent();
                                // Clean up request
                                browserAPI.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 4];
                            case 3:
                                error_3 = _a.sent();
                                console.error("[ServiceWorker] ❌ Error processing getAvailableTabs:", error_3);
                                // Send error response
                                browserAPI.storage.local.set({
                                    wsOutgoingMessage: {
                                        connectionId: request_1.connectionId,
                                        data: {
                                            type: "availableTabs",
                                            requestId: request_1.requestId,
                                            success: false,
                                            error: error_3 instanceof Error ? error_3.message : String(error_3),
                                            timestamp: Date.now(),
                                        },
                                        timestamp: Date.now(),
                                    },
                                });
                                // Clean up request
                                browserAPI.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); })();
            }
            if (request_1.type === "cleanupFolderLink") {
                var folderPath_1 = request_1.folderPath;
                if (!folderPath_1) {
                    console.error("[ServiceWorker] ❌ cleanupFolderLink missing folderPath");
                    chrome.storage.local.remove(["wsIncomingRequest"]);
                    return;
                }
                (function () { return __awaiter(_this, void 0, void 0, function () {
                    var error_4;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                if (!tabStateManager) {
                                    console.error("[ServiceWorker] ❌ TabStateManager not available for cleanup!");
                                    chrome.storage.local.remove(["wsIncomingRequest"]);
                                    return [2 /*return*/];
                                }
                                return [4 /*yield*/, tabStateManager.unlinkFolder(folderPath_1)];
                            case 1:
                                _a.sent();
                                chrome.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 3];
                            case 2:
                                error_4 = _a.sent();
                                console.error("[ServiceWorker] ❌ Error processing cleanupFolderLink:", error_4);
                                chrome.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); })();
            }
            if (request_1.type === "getTabsByFolder") {
                var folderPath_2 = request_1.folderPath;
                var requestId_3 = request_1.requestId;
                var connectionId_2 = request_1.connectionId;
                if (!folderPath_2 || !requestId_3 || !connectionId_2) {
                    console.error("[ServiceWorker] ❌ getTabsByFolder missing required fields");
                    chrome.storage.local.remove(["wsIncomingRequest"]);
                    return;
                }
                (function () { return __awaiter(_this, void 0, void 0, function () {
                    var matchingTabs_1, error_5;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 3, , 4]);
                                if (!tabStateManager) {
                                    console.error("[ServiceWorker] ❌ TabStateManager not available!");
                                    throw new Error("TabStateManager not initialized");
                                }
                                return [4 /*yield*/, tabStateManager.getTabsByFolder(folderPath_2)];
                            case 1:
                                matchingTabs_1 = _a.sent();
                                return [4 /*yield*/, new Promise(function (resolve, reject) {
                                        browserAPI.storage.local.set({
                                            wsOutgoingMessage: {
                                                connectionId: connectionId_2,
                                                data: {
                                                    type: "availableTabs",
                                                    requestId: requestId_3,
                                                    tabs: matchingTabs_1,
                                                    timestamp: Date.now(),
                                                },
                                                timestamp: Date.now(),
                                            },
                                        }, function () {
                                            if (browserAPI.runtime.lastError) {
                                                console.error("[ServiceWorker] ❌ Error sending getTabsByFolder response:", browserAPI.runtime.lastError);
                                                reject(browserAPI.runtime.lastError);
                                                return;
                                            }
                                            resolve();
                                        });
                                    })];
                            case 2:
                                _a.sent();
                                chrome.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 4];
                            case 3:
                                error_5 = _a.sent();
                                console.error("[ServiceWorker] ❌ Error processing getTabsByFolder:", error_5);
                                browserAPI.storage.local.set({
                                    wsOutgoingMessage: {
                                        connectionId: request_1.connectionId,
                                        data: {
                                            type: "availableTabs",
                                            requestId: request_1.requestId,
                                            success: false,
                                            tabs: [],
                                            error: error_5 instanceof Error ? error_5.message : String(error_5),
                                            timestamp: Date.now(),
                                        },
                                        timestamp: Date.now(),
                                    },
                                });
                                chrome.storage.local.remove(["wsIncomingRequest"]);
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); })();
            }
        }
    });
    // Unified Message Listener - handles all actions
    browserAPI.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
        // Handle WebSocket connect/disconnect directly
        if (message.action === "connectWebSocket") {
            (function () { return __awaiter(_this, void 0, void 0, function () {
                var result, error_6;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, wsManager.connect()];
                        case 1:
                            result = _a.sent();
                            // Validate result structure
                            if (!result || typeof result.success !== "boolean") {
                                console.error("[ServiceWorker] \u274C Invalid result structure:", result);
                                console.error("[ServiceWorker] \uD83D\uDD0D Result type: ".concat(typeof result));
                                sendResponse({ success: false, error: "Invalid connect result" });
                                return [2 /*return*/];
                            }
                            return [3 /*break*/, 3];
                        case 2:
                            error_6 = _a.sent();
                            console.error("[ServiceWorker] \u274C Connect exception:", error_6);
                            console.error("[ServiceWorker] \uD83D\uDD0D Exception type: ".concat(error_6 instanceof Error ? error_6.constructor.name : typeof error_6));
                            sendResponse({
                                success: false,
                                error: error_6 instanceof Error ? error_6.message : String(error_6),
                            });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); })();
            return true; // CRITICAL: Keep channel open for async response
        }
        if (message.action === "disconnectWebSocket") {
            var result = wsManager.disconnect();
            sendResponse(result);
            return true;
        }
        if (message.action === "ws.sendResponse") {
            var success = wsManager.sendResponse(message.data);
            sendResponse({ success: success });
            return true;
        }
        if (message.action === "ws.incomingPrompt") {
            deepseek_controller_1.DeepSeekController.sendPrompt(message.tabId, message.prompt, message.requestId).then(function (success) {
                sendResponse({ success: success });
            });
            return true;
        }
        if (message.action === "ws.incomingPrompt") {
            deepseek_controller_1.DeepSeekController.sendPrompt(message.tabId, message.prompt, message.requestId).then(function (success) {
                sendResponse({ success: success });
            });
            return true;
        }
        if (message.action === "getWSConnectionInfo") {
            // 🔥 CRITICAL FIX: Sử dụng Promise-based async handler
            (function () { return __awaiter(_this, void 0, void 0, function () {
                var result, states, connectionIds, connectionId, state, error_7;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, new Promise(function (resolve, reject) {
                                    browserAPI.storage.local.get(["wsStates"], function (data) {
                                        if (browserAPI.runtime.lastError) {
                                            reject(browserAPI.runtime.lastError);
                                            return;
                                        }
                                        resolve(data || {});
                                    });
                                })];
                        case 1:
                            result = _a.sent();
                            states = (result === null || result === void 0 ? void 0 : result.wsStates) || {};
                            connectionIds = Object.keys(states);
                            if (connectionIds.length > 0) {
                                connectionId = connectionIds[0];
                                state = states[connectionId];
                                // 🔥 CRITICAL: Return FULL state object từ storage
                                sendResponse({
                                    success: true,
                                    state: {
                                        id: state.id,
                                        port: state.port,
                                        url: state.url,
                                        status: state.status,
                                        lastConnected: state.lastConnected,
                                    },
                                });
                            }
                            else {
                                sendResponse({
                                    success: false,
                                    error: "No WebSocket connection found",
                                });
                            }
                            return [3 /*break*/, 3];
                        case 2:
                            error_7 = _a.sent();
                            console.error("[ServiceWorker] ❌ Error in getWSConnectionInfo:", error_7);
                            sendResponse({
                                success: false,
                                error: error_7 instanceof Error ? error_7.message : String(error_7),
                            });
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); })();
            return true; // CRITICAL: Keep channel open for async response
        }
        // DeepSeek controller handlers
        switch (message.action) {
            case "getTabStates":
                (function () { return __awaiter(_this, void 0, void 0, function () {
                    var tabStates, responseData, error_8, responseData;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, tabStateManager.getAllTabStates()];
                            case 1:
                                tabStates = _a.sent();
                                responseData = { success: true, tabStates: tabStates };
                                sendResponse(responseData);
                                return [3 /*break*/, 3];
                            case 2:
                                error_8 = _a.sent();
                                console.error("[ServiceWorker] ❌ Error in getTabStates:", error_8);
                                console.error("[ServiceWorker] 🔍 Error details:", {
                                    type: error_8 instanceof Error
                                        ? error_8.constructor.name
                                        : typeof error_8,
                                    message: error_8 instanceof Error ? error_8.message : String(error_8),
                                    stack: error_8 instanceof Error ? error_8.stack : undefined,
                                });
                                responseData = {
                                    success: false,
                                    error: error_8 instanceof Error ? error_8.message : String(error_8),
                                };
                                sendResponse(responseData);
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); })();
                return true;
            case "deepseek.clickNewChat":
                deepseek_controller_1.DeepSeekController.clickNewChatButton(message.tabId).then(function (success) {
                    sendResponse({ success: success });
                });
                return true;
            case "deepseek.isDeepThinkEnabled":
                deepseek_controller_1.DeepSeekController.isDeepThinkEnabled(message.tabId).then(function (enabled) {
                    sendResponse({ enabled: enabled });
                });
                return true;
            case "deepseek.toggleDeepThink":
                deepseek_controller_1.DeepSeekController.toggleDeepThink(message.tabId, message.enable).then(function (success) {
                    sendResponse({ success: success });
                });
                return true;
            case "deepseek.sendPrompt":
                deepseek_controller_1.DeepSeekController.sendPrompt(message.tabId, message.prompt, message.requestId).then(function (success) {
                    sendResponse({ success: success });
                });
                return true;
            case "deepseek.stopGeneration":
                deepseek_controller_1.DeepSeekController.stopGeneration(message.tabId).then(function (success) {
                    sendResponse({ success: success });
                });
                return true;
            case "deepseek.getLatestResponse":
                deepseek_controller_1.DeepSeekController.getLatestResponse(message.tabId).then(function (response) {
                    sendResponse({ response: response });
                });
                return true;
            case "deepseek.createNewChat":
                deepseek_controller_1.DeepSeekController.createNewChat(message.tabId).then(function (success) {
                    sendResponse({ success: success });
                });
                return true;
            case "deepseek.getChatTitle":
                deepseek_controller_1.DeepSeekController.getChatTitle(message.tabId).then(function (title) {
                    sendResponse({ title: title });
                });
                return true;
            case "deepseek.isGenerating":
                deepseek_controller_1.DeepSeekController.isGenerating(message.tabId).then(function (generating) {
                    sendResponse({ generating: generating });
                });
                return true;
            case "deepseek.getCurrentInput":
                deepseek_controller_1.DeepSeekController.getCurrentInput(message.tabId).then(function (input) {
                    sendResponse({ input: input });
                });
                return true;
            case "unlinkTabFromFolder":
                (function () { return __awaiter(_this, void 0, void 0, function () {
                    var success, error_9;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                if (!tabStateManager) {
                                    console.error("[ServiceWorker] \u274C TabStateManager not available!");
                                    sendResponse({
                                        success: false,
                                        error: "TabStateManager not initialized",
                                    });
                                    return [2 /*return*/];
                                }
                                return [4 /*yield*/, tabStateManager.unlinkTabFromFolder(message.tabId)];
                            case 1:
                                success = _a.sent();
                                sendResponse({ success: success });
                                return [3 /*break*/, 3];
                            case 2:
                                error_9 = _a.sent();
                                console.error("[ServiceWorker] \u274C Exception in unlinkTabFromFolder:", error_9);
                                console.error("[ServiceWorker] \uD83D\uDD0D Error details:", {
                                    type: error_9 instanceof Error
                                        ? error_9.constructor.name
                                        : typeof error_9,
                                    message: error_9 instanceof Error ? error_9.message : String(error_9),
                                    stack: error_9 instanceof Error ? error_9.stack : undefined,
                                });
                                sendResponse({
                                    success: false,
                                    error: error_9 instanceof Error ? error_9.message : String(error_9),
                                });
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); })();
                return true;
            case "getAvailableTabs":
                return true;
            default:
                messageHandler.handleMessage(message, sendResponse);
                return true;
        }
    });
    // Initialize on startup
    containerManager.initializeContainers();
})();
