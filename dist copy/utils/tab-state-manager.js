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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.TabStateManager = void 0;
/**
 * 🔒 Simple Mutex Lock với auto-timeout để tránh deadlock
 */
var StorageMutex = /** @class */ (function () {
    function StorageMutex() {
        this.queue = [];
        this.locked = false;
        this.LOCK_TIMEOUT = 5000; // 5 seconds max lock time
        this.lockTimestamp = 0;
    }
    StorageMutex.prototype.acquire = function () {
        return __awaiter(this, void 0, void 0, function () {
            var lockAge;
            var _this = this;
            return __generator(this, function (_a) {
                // 🆕 CRITICAL: Check for stale lock (deadlock prevention)
                if (this.locked && this.lockTimestamp > 0) {
                    lockAge = Date.now() - this.lockTimestamp;
                    if (lockAge > this.LOCK_TIMEOUT) {
                        console.error("[StorageMutex] \u26A0\uFE0F Detected stale lock (".concat(lockAge, "ms old), force releasing..."));
                        this.forceRelease();
                    }
                }
                return [2 /*return*/, new Promise(function (resolve) {
                        if (!_this.locked) {
                            _this.locked = true;
                            _this.lockTimestamp = Date.now();
                            resolve();
                        }
                        else {
                            _this.queue.push(resolve);
                        }
                    })];
            });
        });
    };
    StorageMutex.prototype.release = function () {
        this.lockTimestamp = 0;
        if (this.queue.length > 0) {
            var next = this.queue.shift();
            if (next) {
                this.lockTimestamp = Date.now();
                next();
            }
        }
        else {
            this.locked = false;
        }
    };
    /**
     * 🆕 Force release lock (emergency deadlock recovery)
     */
    StorageMutex.prototype.forceRelease = function () {
        this.locked = false;
        this.lockTimestamp = 0;
        // Process all queued requests
        while (this.queue.length > 0) {
            var next = this.queue.shift();
            if (next) {
                next();
                break; // Only process one, let others queue normally
            }
        }
    };
    return StorageMutex;
}());
var TabStateManager = /** @class */ (function () {
    function TabStateManager() {
        this.STORAGE_KEY = "zenTabStates";
        this.isEnabled = false;
        this.tabStateCache = new Map();
        this.CACHE_TTL = 2000; // 10 seconds
        this.storageMutex = new StorageMutex();
        this.initializationLocks = new Map();
        this.enable();
        this.startAutoRecovery();
        this.setupTabListeners();
    }
    TabStateManager.getInstance = function () {
        if (!TabStateManager.instance) {
            TabStateManager.instance = new TabStateManager();
        }
        return TabStateManager.instance;
    };
    TabStateManager.prototype.setupTabListeners = function () {
        var _this = this;
        // Listen for new tabs created
        chrome.tabs.onCreated.addListener(function (tab) {
            var _a, _b, _c, _d, _e, _f;
            if (((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek.com")) ||
                ((_b = tab.pendingUrl) === null || _b === void 0 ? void 0 : _b.includes("deepseek.com")) ||
                ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("chatgpt.com")) ||
                ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("openai.com")) ||
                ((_e = tab.pendingUrl) === null || _e === void 0 ? void 0 : _e.includes("chatgpt.com")) ||
                ((_f = tab.pendingUrl) === null || _f === void 0 ? void 0 : _f.includes("openai.com"))) {
                // Wait for tab to fully load before initializing
                setTimeout(function () {
                    _this.initializeNewTab(tab.id);
                }, 2000);
            }
        });
        // Listen for tab URL changes (when user navigates to DeepSeek)
        chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
            var _a, _b, _c;
            if (changeInfo.status === "complete" &&
                (((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek.com")) ||
                    ((_b = tab.url) === null || _b === void 0 ? void 0 : _b.includes("chatgpt.com")) ||
                    ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("openai.com")))) {
                // Đọc trực tiếp từ storage thay vì gọi getTabState() (tránh warn)
                chrome.storage.session.get([_this.STORAGE_KEY], function (result) {
                    var states = (result && result[_this.STORAGE_KEY]) || {};
                    var existingState = states[tabId];
                    if (!existingState) {
                        // Initialize tab và broadcast update ngay lập tức
                        _this.initializeNewTab(tabId).then(function () {
                            // Notify UI về tab mới sau khi init xong
                            setTimeout(function () {
                                _this.notifyUIUpdate();
                            }, 200);
                        });
                    }
                });
            }
        });
        // Listen for tab removal (cleanup)
        chrome.tabs.onRemoved.addListener(function (tabId) {
            _this.invalidateCache(tabId);
            _this.removeTabState(tabId);
        });
    };
    /**
     * Kiểm tra xem tab có phải sleep tab không
     * Dựa vào:
     * 1. Tab bị discarded (tab.discarded === true)
     * 2. Title chứa emoji "💤" (do Auto Tab Discard extension thêm vào)
     */
    TabStateManager.prototype.isSleepTab = function (tab) {
        // Check 1: Tab discarded property
        if (tab.discarded === true) {
            return true;
        }
        // Check 2: Title chứa "💤"
        var title = tab.title || "";
        if (title.includes("💤")) {
            return true;
        }
        return false;
    };
    TabStateManager.prototype.getCachedState = function (tabId) {
        var cached = this.tabStateCache.get(tabId);
        if (!cached) {
            return null;
        }
        var now = Date.now();
        var cacheAge = now - cached.timestamp;
        if (cacheAge > this.CACHE_TTL) {
            this.tabStateCache.delete(tabId);
            return null;
        }
        return cached.state;
    };
    TabStateManager.prototype.setCachedState = function (tabId, state) {
        this.tabStateCache.set(tabId, {
            state: state,
            timestamp: Date.now(),
        });
    };
    TabStateManager.prototype.initializeNewTab = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var existingLock, lockError_1, stateCheck, checkStates, resolveLock, lockPromise, timeoutId, tab, existingStateCheck, existingStates, isSleepTab, initialStatus, abortController_1, timeoutId_1, buttonCheckPromise, timeoutPromise, buttonState, error_1, result, states_1, newState, verifyResult, verifyStates, verifiedState, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        existingLock = this.initializationLocks.get(tabId);
                        if (!existingLock) return [3 /*break*/, 6];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, existingLock];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        lockError_1 = _a.sent();
                        console.error("[TabStateManager] \u274C Lock wait error for tab ".concat(tabId, ":"), lockError_1);
                        return [3 /*break*/, 4];
                    case 4: return [4 /*yield*/, new Promise(function (resolve, reject) {
                            chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                    return;
                                }
                                resolve(data || {});
                            });
                        })];
                    case 5:
                        stateCheck = _a.sent();
                        checkStates = (stateCheck && stateCheck[this.STORAGE_KEY]) || {};
                        if (checkStates[tabId]) {
                            return [2 /*return*/];
                        }
                        else {
                            console.warn("[TabStateManager] \u26A0\uFE0F Lock released but state NOT found for tab ".concat(tabId, ", continuing init..."));
                        }
                        _a.label = 6;
                    case 6:
                        lockPromise = new Promise(function (resolve) {
                            resolveLock = resolve;
                        });
                        this.initializationLocks.set(tabId, lockPromise);
                        timeoutId = setTimeout(function () {
                            var lock = _this.initializationLocks.get(tabId);
                            if (lock === lockPromise) {
                                console.warn("[TabStateManager] \u26A0\uFE0F Initialization lock timeout for tab ".concat(tabId, ", force cleaning..."));
                                _this.initializationLocks.delete(tabId);
                            }
                        }, 10000);
                        _a.label = 7;
                    case 7:
                        _a.trys.push([7, 19, 20, 21]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.tabs.get(tabId, function (result) {
                                    if (chrome.runtime.lastError) {
                                        console.error("[TabStateManager] \u274C Tab ".concat(tabId, " not found:"), chrome.runtime.lastError.message);
                                        resolve(null);
                                        return;
                                    }
                                    resolve(result);
                                });
                            })];
                    case 8:
                        tab = _a.sent();
                        if (!tab) {
                            console.warn("[TabStateManager] \u26A0\uFE0F Tab ".concat(tabId, " not found, aborting initialization"));
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 9:
                        existingStateCheck = _a.sent();
                        existingStates = (existingStateCheck && existingStateCheck[this.STORAGE_KEY]) || {};
                        if (existingStates[tabId]) {
                            this.setCachedState(tabId, existingStates[tabId]);
                            return [2 /*return*/];
                        }
                        isSleepTab = this.isSleepTab(tab);
                        initialStatus = "free";
                        if (!isSleepTab) return [3 /*break*/, 10];
                        initialStatus = "sleep";
                        return [3 /*break*/, 15];
                    case 10:
                        abortController_1 = null;
                        timeoutId_1 = null;
                        _a.label = 11;
                    case 11:
                        _a.trys.push([11, 13, 14, 15]);
                        abortController_1 = new AbortController();
                        buttonCheckPromise = this.checkButtonState(tabId, abortController_1.signal);
                        timeoutPromise = new Promise(function (resolve) {
                            timeoutId_1 = setTimeout(function () {
                                if (abortController_1) {
                                    abortController_1.abort();
                                }
                                resolve({ isBusy: false });
                            }, 2000);
                        });
                        return [4 /*yield*/, Promise.race([
                                buttonCheckPromise,
                                timeoutPromise,
                            ])];
                    case 12:
                        buttonState = _a.sent();
                        if (timeoutId_1) {
                            clearTimeout(timeoutId_1);
                        }
                        initialStatus = buttonState.isBusy ? "busy" : "free";
                        return [3 /*break*/, 15];
                    case 13:
                        error_1 = _a.sent();
                        console.error("[TabStateManager] \u274C Button check error for tab ".concat(tabId, ":"), error_1);
                        initialStatus = "free";
                        return [3 /*break*/, 15];
                    case 14:
                        if (timeoutId_1) {
                            clearTimeout(timeoutId_1);
                        }
                        abortController_1 = null;
                        return [7 /*endfinally*/];
                    case 15: return [4 /*yield*/, new Promise(function (resolve, reject) {
                            chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                    return;
                                }
                                resolve(data || {});
                            });
                        })];
                    case 16:
                        result = _a.sent();
                        states_1 = (result && result[this.STORAGE_KEY]) || {};
                        newState = {
                            status: initialStatus,
                            requestId: null,
                            requestCount: 0,
                            folderPath: null,
                        };
                        states_1[tabId] = newState;
                        // Save updated states
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_1, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        console.error("[TabStateManager] \u274C Failed to save state for tab ".concat(tabId, ":"), chrome.runtime.lastError);
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 17:
                        // Save updated states
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 18:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifiedState = verifyStates[tabId];
                        if (verifiedState) {
                        }
                        else {
                            console.error("[TabStateManager] \u274C VERIFICATION FAILED for tab ".concat(tabId, " - state not found in storage!"));
                        }
                        // Invalidate cache to force UI refresh
                        this.invalidateCache(tabId);
                        setTimeout(function () {
                            _this.notifyUIUpdate();
                            setTimeout(function () {
                                _this.notifyUIUpdate();
                            }, 2000);
                        }, 100);
                        return [3 /*break*/, 21];
                    case 19:
                        error_2 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in initializeNewTab for tab ".concat(tabId, ":"), error_2);
                        console.error("[TabStateManager] \uD83D\uDD0D Error stack:", error_2 instanceof Error ? error_2.stack : "No stack trace");
                        return [3 /*break*/, 21];
                    case 20:
                        // 🔓 CRITICAL: Release lock và cleanup timeout
                        clearTimeout(timeoutId);
                        this.initializationLocks.delete(tabId);
                        resolveLock();
                        return [7 /*endfinally*/];
                    case 21: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.invalidateCache = function (tabId) {
        if (tabId !== undefined) {
            this.tabStateCache.delete(tabId);
        }
        else {
            this.tabStateCache.clear();
        }
    };
    TabStateManager.prototype.enable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.isEnabled = true;
                        return [4 /*yield*/, chrome.storage.session.set((_a = {}, _a[this.STORAGE_KEY] = {}, _a))];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.scanAndInitializeAllTabs()];
                    case 2:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.scanAndInitializeAllTabs = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tabs, result, allTabs, error_3, allTabs, fallbackError_1, states, _loop_1, this_1, i;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tabs = [];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 10]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({
                                    url: [
                                        "https://chat.deepseek.com/*",
                                        "https://*.deepseek.com/*",
                                        "*://chat.deepseek.com/*",
                                        "*://*.deepseek.com/*",
                                        "https://chatgpt.com/*",
                                        "https://*.chatgpt.com/*",
                                        "*://chatgpt.com/*",
                                        "*://*.openai.com/*",
                                    ],
                                }, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 2:
                        result = _a.sent();
                        tabs = Array.isArray(result) ? result : [];
                        if (!(tabs.length === 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({}, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        console.error("[TabStateManager] \u274C Broader query error:", chrome.runtime.lastError);
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 3:
                        allTabs = _a.sent();
                        tabs = Array.isArray(allTabs)
                            ? allTabs.filter(function (tab) {
                                var _a, _b, _c, _d, _e, _f;
                                return ((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek.com")) ||
                                    ((_b = tab.title) === null || _b === void 0 ? void 0 : _b.includes("DeepSeek")) ||
                                    ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("deepseek")) ||
                                    ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("chatgpt.com")) ||
                                    ((_e = tab.url) === null || _e === void 0 ? void 0 : _e.includes("openai.com")) ||
                                    ((_f = tab.title) === null || _f === void 0 ? void 0 : _f.includes("ChatGPT"));
                            })
                            : [];
                        _a.label = 4;
                    case 4: return [3 /*break*/, 10];
                    case 5:
                        error_3 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in scan query:", error_3);
                        _a.label = 6;
                    case 6:
                        _a.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({}, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 7:
                        allTabs = _a.sent();
                        tabs = Array.isArray(allTabs)
                            ? allTabs.filter(function (tab) {
                                var _a, _b, _c, _d, _e;
                                return ((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek")) ||
                                    ((_b = tab.title) === null || _b === void 0 ? void 0 : _b.includes("DeepSeek")) ||
                                    ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("chatgpt.com")) ||
                                    ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("openai.com")) ||
                                    ((_e = tab.title) === null || _e === void 0 ? void 0 : _e.includes("ChatGPT"));
                            })
                            : [];
                        return [3 /*break*/, 9];
                    case 8:
                        fallbackError_1 = _a.sent();
                        return [2 /*return*/];
                    case 9: return [3 /*break*/, 10];
                    case 10:
                        if (tabs.length === 0) {
                            return [2 /*return*/];
                        }
                        states = {};
                        _loop_1 = function (i) {
                            var tab, isSleepTab, abortController_2, timeoutId_2, buttonCheckPromise, timeoutPromise, buttonState, determinedStatus, buttonError_1;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        tab = tabs[i];
                                        if (!tab.id) {
                                            return [2 /*return*/, "continue"];
                                        }
                                        _b.label = 1;
                                    case 1:
                                        _b.trys.push([1, 6, , 7]);
                                        isSleepTab = this_1.isSleepTab(tab);
                                        if (isSleepTab) {
                                            states[tab.id] = {
                                                status: "sleep",
                                                requestId: null,
                                                requestCount: 0,
                                                folderPath: null,
                                            };
                                            return [2 /*return*/, "continue"];
                                        }
                                        abortController_2 = null;
                                        timeoutId_2 = null;
                                        _b.label = 2;
                                    case 2:
                                        _b.trys.push([2, , 4, 5]);
                                        abortController_2 = new AbortController();
                                        buttonCheckPromise = this_1.checkButtonState(tab.id, abortController_2.signal);
                                        timeoutPromise = new Promise(function (resolve) {
                                            timeoutId_2 = setTimeout(function () {
                                                if (abortController_2) {
                                                    abortController_2.abort(); // ✅ Cancel button check
                                                }
                                                resolve({ isBusy: false });
                                            }, 2000);
                                        });
                                        return [4 /*yield*/, Promise.race([
                                                buttonCheckPromise,
                                                timeoutPromise,
                                            ])];
                                    case 3:
                                        buttonState = _b.sent();
                                        // ✅ Cleanup timeout nếu button check win
                                        if (timeoutId_2) {
                                            clearTimeout(timeoutId_2);
                                        }
                                        determinedStatus = buttonState.isBusy ? "busy" : "free";
                                        states[tab.id] = {
                                            status: determinedStatus,
                                            requestId: null,
                                            requestCount: 0,
                                            folderPath: null,
                                        };
                                        return [3 /*break*/, 5];
                                    case 4:
                                        // ✅ Cleanup resources
                                        if (timeoutId_2) {
                                            clearTimeout(timeoutId_2);
                                        }
                                        abortController_2 = null;
                                        return [7 /*endfinally*/];
                                    case 5: return [3 /*break*/, 7];
                                    case 6:
                                        buttonError_1 = _b.sent();
                                        // Default to free state if check fails
                                        states[tab.id] = {
                                            status: "free",
                                            requestId: null,
                                            requestCount: 0,
                                            folderPath: null,
                                        };
                                        return [3 /*break*/, 7];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        i = 0;
                        _a.label = 11;
                    case 11:
                        if (!(i < tabs.length)) return [3 /*break*/, 14];
                        return [5 /*yield**/, _loop_1(i)];
                    case 12:
                        _a.sent();
                        _a.label = 13;
                    case 13:
                        i++;
                        return [3 /*break*/, 11];
                    case 14: return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var _a;
                            chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states, _a), function () {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                    return;
                                }
                                resolve();
                            });
                        })];
                    case 15:
                        _a.sent();
                        // 🆕 VERIFICATION: Đọc lại từ storage để verify
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 16:
                        // 🆕 VERIFICATION: Đọc lại từ storage để verify
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                    case 17:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.checkButtonState = function (tabId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var browserAPI_1, scriptCode_1, result, buttonState, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                            return [2 /*return*/, { isBusy: false, uncertain: true }];
                        }
                        browserAPI_1 = typeof globalThis.browser !== "undefined"
                            ? globalThis.browser
                            : chrome;
                        scriptCode_1 = "\n      (function() {\n        const sendButton = document.querySelector(\".ds-icon-button._7436101\");\n        \n        if (!sendButton) {\n          return { isBusy: false, reason: \"button_not_found\", uncertain: true };\n        }\n\n        const isButtonDisabled = \n          sendButton.hasAttribute(\"disabled\") ||\n          sendButton.getAttribute(\"aria-disabled\") === \"true\" ||\n          sendButton.classList.contains(\"ds-icon-button--disabled\");\n\n        const svg = sendButton.querySelector(\"svg\");\n        const path = svg?.querySelector(\"path\");\n        const pathData = path?.getAttribute(\"d\") || \"\";\n\n        const isStopIcon = pathData.includes(\"M2 4.88006\") && pathData.includes(\"C2 3.68015\");\n        const isSendIcon = pathData.includes(\"M8.3125 0.981648\") && pathData.includes(\"9.2627 1.4338\");\n\n        if (isStopIcon && !isButtonDisabled) {\n          return { isBusy: true, reason: \"stop_icon_ai_responding\", uncertain: false };\n        }\n\n        if (isSendIcon || (isStopIcon && isButtonDisabled)) {\n          return { isBusy: false, reason: \"send_icon_or_disabled_stop_icon\", uncertain: false };\n        }\n\n        return { isBusy: !isButtonDisabled, reason: \"fallback_by_disabled_state\", uncertain: true };\n      })();\n    ";
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                                    reject(new Error("Aborted"));
                                    return;
                                }
                                browserAPI_1.tabs.executeScript(tabId, { code: scriptCode_1 }, function (results) {
                                    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                                        reject(new Error("Aborted"));
                                        return;
                                    }
                                    if (browserAPI_1.runtime.lastError) {
                                        reject(browserAPI_1.runtime.lastError);
                                        return;
                                    }
                                    resolve(results);
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        buttonState = (Array.isArray(result) && result[0]) || {
                            isBusy: false,
                            reason: "no_result",
                            uncertain: true,
                        };
                        return [2 /*return*/, {
                                isBusy: buttonState.isBusy,
                                uncertain: buttonState.uncertain || false,
                            }];
                    case 2:
                        error_4 = _a.sent();
                        if (error_4 instanceof Error && error_4.message === "Aborted") {
                            return [2 /*return*/, { isBusy: false, uncertain: true }];
                        }
                        // Return uncertain state instead of assuming "free"
                        return [2 /*return*/, { isBusy: false, uncertain: true }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.getAllTabStates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, states, _i, _a, _b, tabIdStr, state, tabId, tabs, result_1, allTabs, error_5, allTabs, fallbackError_2, tabStates;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 50); })];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 2:
                        result = _c.sent();
                        states = (result && result[this.STORAGE_KEY]) || {};
                        for (_i = 0, _a = Object.entries(states); _i < _a.length; _i++) {
                            _b = _a[_i], tabIdStr = _b[0], state = _b[1];
                            tabId = parseInt(tabIdStr);
                            this.setCachedState(tabId, state);
                        }
                        tabs = [];
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 7, , 12]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({
                                    url: [
                                        "https://chat.deepseek.com/*",
                                        "https://*.deepseek.com/*",
                                        "*://chat.deepseek.com/*",
                                        "*://*.deepseek.com/*",
                                        "https://chatgpt.com/*",
                                        "https://*.chatgpt.com/*",
                                        "*://chatgpt.com/*",
                                        "*://*.openai.com/*",
                                    ],
                                }, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 4:
                        result_1 = _c.sent();
                        tabs = Array.isArray(result_1) ? result_1 : [];
                        if (!(tabs.length === 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({}, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 5:
                        allTabs = _c.sent();
                        tabs = Array.isArray(allTabs)
                            ? allTabs.filter(function (tab) {
                                var _a, _b, _c, _d, _e, _f;
                                return ((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek.com")) ||
                                    ((_b = tab.title) === null || _b === void 0 ? void 0 : _b.includes("DeepSeek")) ||
                                    ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("deepseek")) ||
                                    ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("chatgpt.com")) ||
                                    ((_e = tab.url) === null || _e === void 0 ? void 0 : _e.includes("openai.com")) ||
                                    ((_f = tab.title) === null || _f === void 0 ? void 0 : _f.includes("ChatGPT"));
                            })
                            : [];
                        _c.label = 6;
                    case 6: return [3 /*break*/, 12];
                    case 7:
                        error_5 = _c.sent();
                        _c.label = 8;
                    case 8:
                        _c.trys.push([8, 10, , 11]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.tabs.query({}, function (queriedTabs) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(queriedTabs || []);
                                });
                            })];
                    case 9:
                        allTabs = _c.sent();
                        tabs = Array.isArray(allTabs)
                            ? allTabs.filter(function (tab) {
                                var _a, _b, _c, _d, _e;
                                return ((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes("deepseek")) ||
                                    ((_b = tab.title) === null || _b === void 0 ? void 0 : _b.includes("DeepSeek")) ||
                                    ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("chatgpt.com")) ||
                                    ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("openai.com")) ||
                                    ((_e = tab.title) === null || _e === void 0 ? void 0 : _e.includes("ChatGPT"));
                            })
                            : [];
                        return [3 /*break*/, 11];
                    case 10:
                        fallbackError_2 = _c.sent();
                        return [2 /*return*/, []];
                    case 11: return [3 /*break*/, 12];
                    case 12:
                        if (tabs.length === 0) {
                            return [2 /*return*/, []];
                        }
                        tabStates = tabs.map(function (tab) {
                            var state = states[tab.id] || {
                                status: "free",
                                requestCount: 0,
                                folderPath: null,
                            };
                            // Override status nếu phát hiện sleep tab (real-time check)
                            var isSleepTab = _this.isSleepTab(tab);
                            var actualStatus = isSleepTab ? "sleep" : state.status;
                            var canAccept = _this.canAcceptRequest(__assign(__assign({}, state), { status: actualStatus }));
                            return {
                                tabId: tab.id,
                                containerName: "Tab ".concat(tab.id),
                                title: tab.title || "Untitled",
                                url: tab.url,
                                status: actualStatus,
                                canAccept: canAccept,
                                requestCount: state.requestCount || 0,
                                folderPath: state.folderPath || null,
                            };
                        });
                        return [2 /*return*/, tabStates];
                }
            });
        });
    };
    TabStateManager.prototype.canAcceptRequest = function (state) {
        // Tab chỉ có thể nhận request khi status là "free"
        // Status "busy" hoặc "sleep" đều KHÔNG thể nhận request
        if (state.status !== "free") {
            return false;
        }
        return true;
    };
    /**
     * 🔒 PUBLIC method with mutex lock
     */
    TabStateManager.prototype.markTabBusy = function (tabId, requestId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.storageMutex.acquire()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, this.markTabBusyInternal(tabId, requestId)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        this.storageMutex.release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🔓 INTERNAL method WITHOUT mutex
     */
    TabStateManager.prototype.markTabBusyInternal = function (tabId, requestId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_2, currentState, verifyResult, verifyStates, verifyState, error_6;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _b.sent();
                        states_2 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_2[tabId] || {
                            requestCount: 0,
                            folderPath: null,
                        };
                        states_2[tabId] = {
                            status: "busy",
                            requestId: requestId,
                            requestCount: (currentState.requestCount || 0) + 1,
                            folderPath: (_a = currentState.folderPath) !== null && _a !== void 0 ? _a : null,
                        };
                        // 🔥 CRITICAL: Wrap storage.set() để đảm bảo async completion
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_2, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        // 🔥 CRITICAL: Wrap storage.set() để đảm bảo async completion
                        _b.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _b.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState && verifyState.status === "busy") {
                            this.invalidateCache(tabId);
                            // 🔥 NEW: Notify UI immediately after marking BUSY
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            console.error("[TabStateManager] \u274C Failed to mark tab ".concat(tabId, " as BUSY - verification failed"));
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_6 = _b.sent();
                        console.error("[TabStateManager] \u274C Exception in markTabSleep for tab ".concat(tabId, ":"), error_6);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 🔒 PUBLIC method with mutex lock
     */
    TabStateManager.prototype.markTabFree = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.storageMutex.acquire()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, this.markTabFreeInternal(tabId)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        this.storageMutex.release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.markTabFreeInternal = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_3, currentState, verifyResult, verifyStates, verifyState, error_7;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_3 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_3[tabId] || {
                            requestCount: 0,
                            folderPath: null,
                        };
                        states_3[tabId] = {
                            status: "free",
                            requestId: null,
                            requestCount: currentState.requestCount || 0,
                            folderPath: currentState.folderPath || null,
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_3, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        this.invalidateCache(tabId);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState && verifyState.status === "free") {
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            console.error("[TabStateManager] \u274C Failed to mark tab ".concat(tabId, " as FREE - verification failed"));
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_7 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in markTabFree for tab ".concat(tabId, ":"), error_7);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.markTabSleep = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_4, currentState, verifyResult, verifyStates, verifyState, error_8;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_4 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_4[tabId] || {
                            requestCount: 0,
                            folderPath: null,
                        };
                        // Set status = "sleep", giữ nguyên các field khác
                        states_4[tabId] = {
                            status: "sleep",
                            requestId: null,
                            requestCount: currentState.requestCount || 0,
                            folderPath: currentState.folderPath || null,
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_4, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        this.invalidateCache(tabId);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState && verifyState.status === "sleep") {
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_8 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in markTabSleep for tab ".concat(tabId, ":"), error_8);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.wakeUpTab = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_5, currentState, verifyResult, verifyStates, verifyState, error_9;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_5 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_5[tabId];
                        if (!currentState) {
                            return [2 /*return*/, false];
                        }
                        if (currentState.status !== "sleep") {
                            return [2 /*return*/, false];
                        }
                        // Set status = "free"
                        states_5[tabId] = __assign(__assign({}, currentState), { status: "free", requestId: null });
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_5, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        this.invalidateCache(tabId);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        // ✅ ĐÚNG: Sau khi wake up, status phải là "free"
                        if (verifyState && verifyState.status === "free") {
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_9 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in markTabSleep for tab ".concat(tabId, ":"), error_9);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.markTabFreeWithFolder = function (tabId, folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_6, currentState, verifyResult, verifyStates, verifyState, error_10;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // 🔥 CRITICAL: Use mutex lock to prevent race conditions
                    return [4 /*yield*/, this.storageMutex.acquire()];
                    case 1:
                        // 🔥 CRITICAL: Use mutex lock to prevent race conditions
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, 7, 8]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        result = _a.sent();
                        states_6 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_6[tabId] || {
                            requestCount: 0,
                            folderPath: null,
                        };
                        states_6[tabId] = {
                            status: "free",
                            requestId: null,
                            requestCount: currentState.requestCount || 0,
                            folderPath: folderPath,
                        };
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_6, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 4:
                        _a.sent();
                        this.invalidateCache(tabId);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 5:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState &&
                            verifyState.status === "free" &&
                            verifyState.folderPath === folderPath) {
                            this.invalidateCache(tabId);
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 8];
                    case 6:
                        error_10 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in markTabSleep for tab ".concat(tabId, ":"), error_10);
                        return [2 /*return*/, false];
                    case 7:
                        // 🔓 CRITICAL: Release mutex lock
                        this.storageMutex.release();
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.linkTabToFolder = function (tabId, folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_7, currentState, verifyResult, verifyStates, verifyState, error_11;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_7 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_7[tabId] || {
                            status: "free",
                            requestCount: 0,
                            requestId: null,
                            folderPath: null,
                        };
                        states_7[tabId] = __assign(__assign({}, currentState), { folderPath: folderPath });
                        // 🔥 CRITICAL: Đợi storage.set() hoàn thành VÀ verify
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_7, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        // 🔥 CRITICAL: Đợi storage.set() hoàn thành VÀ verify
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState && verifyState.folderPath === folderPath) {
                            this.invalidateCache(tabId);
                            return [2 /*return*/, true];
                        }
                        else {
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_11 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in linkTabToFolder for tab ".concat(tabId, ":"), error_11);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.unlinkTabFromFolder = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_8, currentState, verifyResult, verifyStates, verifyState, error_12;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_8 = (result && result[this.STORAGE_KEY]) || {};
                        currentState = states_8[tabId];
                        if (!currentState) {
                            console.warn("[TabStateManager] \u26A0\uFE0F Tab ".concat(tabId, " state not found, cannot unlink folder"));
                            return [2 /*return*/, false];
                        }
                        // Remove folderPath
                        states_8[tabId] = __assign(__assign({}, currentState), { folderPath: null });
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_8, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 3:
                        verifyResult = _a.sent();
                        verifyStates = (verifyResult && verifyResult[this.STORAGE_KEY]) || {};
                        verifyState = verifyStates[tabId];
                        if (verifyState && verifyState.folderPath === null) {
                            this.invalidateCache(tabId);
                            this.notifyUIUpdate();
                            return [2 /*return*/, true];
                        }
                        else {
                            console.error("[TabStateManager] \u274C Failed to verify folder unlink for tab ".concat(tabId));
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_12 = _a.sent();
                        console.error("[TabStateManager] \u274C Exception in unlinkTabFromFolder for tab ".concat(tabId, ":"), error_12);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.unlinkFolder = function (folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states, unlinkedCount, _i, _a, _b, tabIdStr, state, tabState, tabId, PromptController, error_13, error_14;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 8, , 9]);
                        return [4 /*yield*/, chrome.storage.session.get([this.STORAGE_KEY])];
                    case 1:
                        result = _d.sent();
                        states = (result && result[this.STORAGE_KEY]) || {};
                        unlinkedCount = 0;
                        for (_i = 0, _a = Object.entries(states); _i < _a.length; _i++) {
                            _b = _a[_i], tabIdStr = _b[0], state = _b[1];
                            tabState = state;
                            if (tabState.folderPath === folderPath) {
                                tabId = parseInt(tabIdStr);
                                states[tabId] = __assign(__assign({}, tabState), { folderPath: null });
                                this.invalidateCache(tabId);
                                unlinkedCount++;
                            }
                        }
                        if (!(unlinkedCount > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, chrome.storage.session.set((_c = {}, _c[this.STORAGE_KEY] = states, _c))];
                    case 2:
                        _d.sent();
                        _d.label = 3;
                    case 3:
                        _d.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return __importStar(require("../deepseek/prompt-controller")); })];
                    case 4:
                        PromptController = (_d.sent()).PromptController;
                        return [4 /*yield*/, PromptController.clearTokensForFolder(folderPath)];
                    case 5:
                        _d.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        error_13 = _d.sent();
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/, true];
                    case 8:
                        error_14 = _d.sent();
                        return [2 /*return*/, false];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.getTabsByFolder = function (folderPath) {
        return __awaiter(this, void 0, void 0, function () {
            var allTabs, matchingTabs, error_15;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getAllTabStates()];
                    case 1:
                        allTabs = _a.sent();
                        matchingTabs = allTabs.filter(function (tab) {
                            return tab.folderPath === folderPath &&
                                tab.status === "free" &&
                                tab.canAccept;
                        });
                        return [2 /*return*/, matchingTabs];
                    case 2:
                        error_15 = _a.sent();
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.getTabState = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var cachedState, cacheAge, result, tabCheckStart_1, tab, retryResult, retryStates, retryState, states, state, lockError_2, tabGetStartTime_1, tab, retryResult, retryStates, retryState, fallbackError_3, error_16;
            var _a, _b, _c, _d, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        cachedState = this.getCachedState(tabId);
                        if (cachedState) {
                            cacheAge = Date.now() - (((_a = this.tabStateCache.get(tabId)) === null || _a === void 0 ? void 0 : _a.timestamp) || 0);
                            if (cacheAge < this.CACHE_TTL) {
                                return [2 /*return*/, cachedState];
                            }
                            else {
                                this.tabStateCache.delete(tabId);
                            }
                        }
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 21, , 22]);
                        return [4 /*yield*/, chrome.storage.session.get([this.STORAGE_KEY])];
                    case 2:
                        result = _h.sent();
                        if (!(!result || typeof result !== "object")) return [3 /*break*/, 7];
                        console.error("[TabStateManager] \u274C Invalid storage.session.get() result:", {
                            resultType: typeof result,
                            resultValue: result,
                            isNull: result === null,
                            isUndefined: result === undefined,
                            storageKey: this.STORAGE_KEY,
                        });
                        // Try fallback initialization if tab exists
                        console.warn("[TabStateManager] \u26A0\uFE0F Invalid storage result - attempting EMERGENCY initialization...");
                        console.warn("[TabStateManager] \uD83D\uDD0D Storage diagnostic:", {
                            resultType: typeof result,
                            resultValue: result,
                            hasStorageKey: result && result[this.STORAGE_KEY],
                            storageKey: this.STORAGE_KEY,
                        });
                        tabCheckStart_1 = Date.now();
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.tabs.get(tabId, function (result) {
                                    var callbackTime = Date.now();
                                    var duration = callbackTime - tabCheckStart_1;
                                    if (chrome.runtime.lastError) {
                                        console.error("[TabStateManager] \u274C Tab ".concat(tabId, " NOT FOUND (").concat(duration, "ms):"), chrome.runtime.lastError);
                                        resolve(null);
                                        return;
                                    }
                                    resolve(result);
                                });
                            })];
                    case 3:
                        tab = _h.sent();
                        if (!(tab &&
                            (((_b = tab.url) === null || _b === void 0 ? void 0 : _b.includes("deepseek.com")) ||
                                ((_c = tab.url) === null || _c === void 0 ? void 0 : _c.includes("chatgpt.com")) ||
                                ((_d = tab.url) === null || _d === void 0 ? void 0 : _d.includes("openai.com"))))) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.initializeNewTab(tabId)];
                    case 4:
                        _h.sent();
                        return [4 /*yield*/, chrome.storage.session.get([
                                this.STORAGE_KEY,
                            ])];
                    case 5:
                        retryResult = _h.sent();
                        if (retryResult &&
                            typeof retryResult === "object" &&
                            retryResult[this.STORAGE_KEY]) {
                            retryStates = retryResult[this.STORAGE_KEY] || {};
                            retryState = retryStates[tabId] || null;
                            if (retryState) {
                                this.setCachedState(tabId, retryState);
                                return [2 /*return*/, retryState];
                            }
                        }
                        _h.label = 6;
                    case 6: return [2 /*return*/, null];
                    case 7:
                        states = result[this.STORAGE_KEY] || {};
                        state = states[tabId] || null;
                        if (state) {
                            this.setCachedState(tabId, state);
                            return [2 /*return*/, state];
                        }
                        if (!this.initializationLocks.has(tabId)) return [3 /*break*/, 11];
                        _h.label = 8;
                    case 8:
                        _h.trys.push([8, 10, , 11]);
                        return [4 /*yield*/, this.initializationLocks.get(tabId)];
                    case 9:
                        _h.sent();
                        return [3 /*break*/, 11];
                    case 10:
                        lockError_2 = _h.sent();
                        console.error("[TabStateManager] \u274C Lock wait error:", lockError_2);
                        return [3 /*break*/, 11];
                    case 11:
                        _h.trys.push([11, 19, , 20]);
                        tabGetStartTime_1 = Date.now();
                        return [4 /*yield*/, new Promise(function (resolve) {
                                chrome.tabs.get(tabId, function (result) {
                                    var callbackTime = Date.now();
                                    var duration = callbackTime - tabGetStartTime_1;
                                    if (chrome.runtime.lastError) {
                                        console.error("[TabStateManager] \u274C TAB ".concat(tabId, " NOT FOUND via tabs.get:"), {
                                            error: chrome.runtime.lastError.message,
                                            duration: "".concat(duration, "ms"),
                                            callbackTime: callbackTime,
                                            startTime: tabGetStartTime_1,
                                        });
                                        console.error("[TabStateManager] \uD83D\uDD0D LastError details:", chrome.runtime.lastError);
                                        resolve(null);
                                        return;
                                    }
                                    resolve(result);
                                });
                            })];
                    case 12:
                        tab = _h.sent();
                        if (!(tab &&
                            (((_e = tab.url) === null || _e === void 0 ? void 0 : _e.includes("deepseek.com")) ||
                                ((_f = tab.url) === null || _f === void 0 ? void 0 : _f.includes("chatgpt.com")) ||
                                ((_g = tab.url) === null || _g === void 0 ? void 0 : _g.includes("openai.com"))))) return [3 /*break*/, 17];
                        if (!this.initializationLocks.has(tabId)) return [3 /*break*/, 14];
                        return [4 /*yield*/, this.initializationLocks.get(tabId)];
                    case 13:
                        _h.sent();
                        _h.label = 14;
                    case 14: 
                    // Force initialize
                    return [4 /*yield*/, this.initializeNewTab(tabId)];
                    case 15:
                        // Force initialize
                        _h.sent();
                        return [4 /*yield*/, chrome.storage.session.get([
                                this.STORAGE_KEY,
                            ])];
                    case 16:
                        retryResult = _h.sent();
                        retryStates = (retryResult && retryResult[this.STORAGE_KEY]) || {};
                        retryState = retryStates[tabId] || null;
                        if (retryState) {
                            this.setCachedState(tabId, retryState);
                            return [2 /*return*/, retryState];
                        }
                        else {
                            console.error("[TabStateManager] \u274C Still no state after aggressive initialization for tab ".concat(tabId));
                            console.error("[TabStateManager] \uD83D\uDCCA Storage contents after initialization:", retryStates);
                        }
                        return [3 /*break*/, 18];
                    case 17:
                        console.warn("[TabStateManager] \u26A0\uFE0F Tab ".concat(tabId, " is NOT a valid AI chat tab or doesn't exist"));
                        _h.label = 18;
                    case 18: return [3 /*break*/, 20];
                    case 19:
                        fallbackError_3 = _h.sent();
                        console.error("[TabStateManager] \u274C Aggressive fallback failed:", fallbackError_3);
                        return [3 /*break*/, 20];
                    case 20: return [2 /*return*/, null];
                    case 21:
                        error_16 = _h.sent();
                        console.error("[TabStateManager] \u274C Exception in getTabState:", error_16);
                        return [2 /*return*/, null];
                    case 22: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.getEnabled = function () {
        return this.isEnabled;
    };
    TabStateManager.prototype.startAutoRecovery = function () {
        var _this = this;
        setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.autoRecoverStuckTabs()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, 10000); // Run every 10 seconds
    };
    TabStateManager.prototype.autoRecoverStuckTabs = function () {
        return __awaiter(this, void 0, void 0, function () {
            var result, states, recoveredCount, _i, _a, _b, tabIdStr, state, tabState, tabId, buttonState, freeSuccess, error_17;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.isEnabled) {
                            return [2 /*return*/];
                        }
                        this.invalidateCache();
                        return [4 /*yield*/, this.storageMutex.acquire()];
                    case 1:
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 9, 10, 11]);
                        return [4 /*yield*/, chrome.storage.session.get([this.STORAGE_KEY])];
                    case 3:
                        result = _c.sent();
                        states = (result && result[this.STORAGE_KEY]) || {};
                        recoveredCount = 0;
                        _i = 0, _a = Object.entries(states);
                        _c.label = 4;
                    case 4:
                        if (!(_i < _a.length)) return [3 /*break*/, 8];
                        _b = _a[_i], tabIdStr = _b[0], state = _b[1];
                        tabState = state;
                        tabId = parseInt(tabIdStr);
                        if (!(tabState.status === "busy")) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.checkButtonState(tabId)];
                    case 5:
                        buttonState = _c.sent();
                        if (!!buttonState.isBusy) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.markTabFreeInternal(tabId)];
                    case 6:
                        freeSuccess = _c.sent();
                        if (freeSuccess) {
                            recoveredCount++;
                        }
                        _c.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 4];
                    case 8:
                        if (recoveredCount > 0) {
                            this.notifyUIUpdate();
                        }
                        return [3 /*break*/, 11];
                    case 9:
                        error_17 = _c.sent();
                        return [3 /*break*/, 11];
                    case 10:
                        this.storageMutex.release();
                        return [7 /*endfinally*/];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.forceResetTab = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.invalidateCache(tabId);
                        return [4 /*yield*/, this.markTabFree(tabId)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    TabStateManager.prototype.removeTabState = function (tabId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, states_9, error_18;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                chrome.storage.session.get([_this.STORAGE_KEY], function (data) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve(data || {});
                                });
                            })];
                    case 1:
                        result = _a.sent();
                        states_9 = (result && result[this.STORAGE_KEY]) || {};
                        if (!states_9[tabId]) return [3 /*break*/, 3];
                        delete states_9[tabId];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                var _a;
                                chrome.storage.session.set((_a = {}, _a[_this.STORAGE_KEY] = states_9, _a), function () {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                        return;
                                    }
                                    resolve();
                                });
                            })];
                    case 2:
                        _a.sent();
                        this.notifyUIUpdate();
                        _a.label = 3;
                    case 3: return [3 /*break*/, 5];
                    case 4:
                        error_18 = _a.sent();
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    TabStateManager.prototype.notifyUIUpdate = function () {
        try {
            var messagePayload_1 = {
                action: "tabsUpdated",
                timestamp: Date.now(),
            };
            // Strategy: Use callback + Promise wrapper for reliability
            var sendWithCallback_1 = function () {
                return new Promise(function (resolve) {
                    chrome.runtime.sendMessage(messagePayload_1, function () {
                        if (chrome.runtime.lastError) {
                            resolve(false);
                            return;
                        }
                        resolve(true);
                    });
                });
            };
            // Try callback-based approach with timeout
            var timeoutMs_1 = 1000;
            var sendPromise = Promise.race([
                sendWithCallback_1(),
                new Promise(function (resolve) {
                    return setTimeout(function () { return resolve(false); }, timeoutMs_1);
                }),
            ]);
            sendPromise
                .then(function (success) {
                if (!success) {
                    // Retry after short delay
                    setTimeout(function () {
                        sendWithCallback_1();
                    }, 500);
                }
            })
                .catch(function () {
                // Silent error handling
            });
        }
        catch (error) {
            // Silent error handling
        }
    };
    return TabStateManager;
}());
exports.TabStateManager = TabStateManager;
if (typeof globalThis !== "undefined") {
    globalThis.TabStateManager = TabStateManager;
}
