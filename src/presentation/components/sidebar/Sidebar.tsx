import React, { useState, useEffect, useRef } from "react";
import TabCard from "./TabCard";
import CustomButton from "../common/CustomButton";
import MenuDrawer from "./MenuDrawer";
import WebSocketDrawer from "./WebSocketDrawer";
import { Settings } from "lucide-react";
import { BackgroundHealth } from "@/shared/lib/background-health";

interface TabStateResponse {
  success: boolean;
  tabStates?: any[];
  error?: string;
}

const Sidebar: React.FC = () => {
  const [tabs, setTabs] = useState<any[]>([]);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showWebSocketDrawer, setShowWebSocketDrawer] = useState(false);
  const [ports, setPorts] = useState<
    Array<{ port: number; isConnected: boolean }>
  >([]);
  const [, setActiveTabs] = useState<Set<string>>(new Set());

  // 🔥 NEW: Use ref for synchronous access to optimistic state
  const optimisticBusyTabsRef = useRef<Set<number>>(new Set());
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const initializeSidebar = async () => {
      // 🔥 FIX: Dùng BackgroundHealth.waitForReady() thay vì delay cứng
      const isReady = await BackgroundHealth.waitForReady();

      if (!isReady) {
        console.error("[Sidebar] ❌ Background script failed to initialize");
        return;
      }

      // Load tabs với retry
      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
        try {
          await loadTabs();
          success = true;
        } catch (error) {
          retries--;

          if (retries > 0) {
            // Exponential backoff: 1s, 2s
            await new Promise((resolve) =>
              setTimeout(resolve, (4 - retries) * 1000)
            );
          }
        }
      }

      if (!success) {
        console.error("[Sidebar] ❌ Failed to load tabs after all retries");
      }

      const port = chrome.runtime.connect({ name: "zenTab-sidebar" });

      return () => {
        port.disconnect();
      };
    };

    initializeSidebar();

    const messageListener = (message: any) => {
      // 🔥 Handle optimistic updates for request lifecycle
      if (message.action === "requestStarted" && message.tabId) {
        optimisticBusyTabsRef.current.add(message.tabId);
        forceUpdate({}); // Trigger re-render
      }

      if (message.action === "requestCompleted" && message.tabId) {
        optimisticBusyTabsRef.current.delete(message.tabId);
        forceUpdate({}); // Trigger re-render
      }

      if (message.action === "tabsUpdated") {
        loadTabs();
        setTimeout(() => {
          loadTabs();
        }, 200);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const tabCreatedListener = () => {
      loadTabs();
    };

    const tabRemovedListener = () => {
      loadTabs();
    };

    const tabUpdatedListener = (
      _tabId: number,
      changeInfo: { status?: string; url?: string; title?: string },
      tab: chrome.tabs.Tab
    ) => {
      if (
        changeInfo.status === "complete" &&
        tab.url?.includes("deepseek.com")
      ) {
        setTimeout(() => {
          loadTabs();
        }, 1000);
      }
    };

    chrome.tabs.onCreated.addListener(tabCreatedListener);
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onCreated.removeListener(tabCreatedListener);
      chrome.tabs.onRemoved.removeListener(tabRemovedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
    };
  }, []);

  const loadTabs = async () => {
    try {
      const response = await BackgroundHealth.sendMessage<TabStateResponse>(
        { action: "getTabStates" },
        {
          maxRetries: 3,
          timeout: 5000,
          waitForReady: true,
        }
      );

      if (!response) {
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      if (!response.success) {
        setTabs([]);
        setActiveTabs(new Set());
        return;
      }

      const tabStates = response.tabStates || [];

      // 🔥 MERGE: Combine backend state with optimistic state
      const mergedTabs = tabStates.map((tab: any) => {
        // If tab is in optimistic busy set, override status to "busy"
        if (optimisticBusyTabsRef.current.has(tab.tabId)) {
          return {
            ...tab,
            status: "busy",
          };
        }
        return tab;
      });

      setTabs(mergedTabs);

      const activeTabIds: Set<string> = new Set(
        tabStates.map((t: any) => String(t.tabId))
      );

      setActiveTabs(activeTabIds);
    } catch (error) {
      console.error(`[Sidebar] ❌ loadTabs exception:`, error);
      setTabs([]);
      setActiveTabs(new Set());
    }
  };

  const handleAddPort = async (port: number) => {
    // Check if port already exists
    if (ports.some((p) => p.port === port)) {
    }

    // Try to connect first
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);

      ws.onopen = () => {};

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "connection-established") {
            // Add to list after successful connection
            setPorts((prev) => [...prev, { port, isConnected: true }]);

            // 🔥 CRITICAL: Send current tab list to Zen

            const tabsData = tabs.map((tab) => ({
              tabId: tab.tabId,
              url: tab.url,
              title: tab.title,
              status: tab.status,
              provider: tab.provider,
            }));

            ws.send(
              JSON.stringify({
                type: "focusedTabsUpdate",
                data: tabsData,
                timestamp: Date.now(),
              })
            );
          } else if (message.type === "focusedTabsUpdate") {
          } else if (message.type === "requestFocusedTabs") {
            // Zen is requesting tab list

            const tabsData = tabs.map((tab) => ({
              tabId: tab.tabId,
              url: tab.url,
              title: tab.title,
              status: tab.status,
              provider: tab.provider,
            }));

            ws.send(
              JSON.stringify({
                type: "focusedTabsUpdate",
                data: tabsData,
                timestamp: Date.now(),
              })
            );
          }
        } catch (error) {
          console.error(
            `[Sidebar] ❌ Error parsing message from port ${port}:`,
            error
          );
        }
      };

      ws.onerror = (error) => {
        console.error(`[Sidebar] ❌ WebSocket error on port ${port}:`, error);
      };

      ws.onclose = () => {
        // Remove from list when connection closes
        setPorts((prev) => prev.filter((p) => p.port !== port));
      };

      // Wait for connection to open
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Connection timeout"));
        }, 5000);

        ws.addEventListener(
          "open",
          () => {
            clearTimeout(timeout);
            resolve(null);
          },
          { once: true }
        );

        ws.addEventListener(
          "error",
          () => {
            clearTimeout(timeout);
            reject(new Error("Connection failed"));
          },
          { once: true }
        );
      });
    } catch (error) {
      console.error(`[Sidebar] ❌ Failed to connect to port ${port}:`, error);
      // Don't add to list if connection failed
    }
  };

  const handleRemovePort = async (port: number) => {
    // TODO: Implement disconnect logic
    setPorts((prev) => prev.filter((p) => p.port !== port));
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-background relative flex flex-col">
      {/* Tab List */}
      <div className="flex-1 overflow-y-auto p-2">
        {tabs.map((tab) => (
          <TabCard key={tab.tabId} tab={tab} />
        ))}

        {tabs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4">
              <span className="text-3xl">🌐</span>
            </div>
            <p className="text-text-secondary text-sm">No AI chat tabs open</p>
            <p className="text-text-secondary/70 text-xs mt-1 px-4">
              Open DeepSeek, ChatGPT, Claude, Gemini, or Grok to get started!
            </p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center px-4">
              <span className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
                🤖 DeepSeek
              </span>
              <span className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded">
                💬 ChatGPT
              </span>
              <span className="text-xs px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded">
                🧠 Claude
              </span>
              <span className="text-xs px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded">
                ✨ Gemini
              </span>
              <span className="text-xs px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded">
                ⚡ Grok
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Buttons - Bottom Right */}
      <div className="fixed bottom-2 right-2 z-40 flex flex-col gap-2">
        <CustomButton
          variant="ghost"
          size="sm"
          icon={Settings}
          onClick={() => setShowMenuDrawer(true)}
          aria-label="Open menu"
          className="!p-3 !text-lg"
          children={undefined}
        />
      </div>

      {/* Drawers */}
      <MenuDrawer
        isOpen={showMenuDrawer}
        onClose={() => setShowMenuDrawer(false)}
        onOpenWebSocketManager={() => setShowWebSocketDrawer(true)}
      />
      <WebSocketDrawer
        isOpen={showWebSocketDrawer}
        onClose={() => setShowWebSocketDrawer(false)}
        ports={ports}
        onAddPort={handleAddPort}
        onRemovePort={handleRemovePort}
      />
    </div>
  );
};

export default Sidebar;
