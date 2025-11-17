import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import MotionCustomDrawer from "../common/CustomDrawer";
import CustomButton from "../common/CustomButton";
import CustomInput from "../common/CustomInput";
import CustomCombobox from "../common/CustomCombobox";
import { Send, Trash2, RefreshCw } from "lucide-react";
import { getBrowserAPI } from "@/shared/lib/browser-api";

interface TestDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DeepSeekTab {
  tabId: number;
  containerName: string;
  title: string;
}

const TestDrawer: React.FC<TestDrawerProps> = ({ isOpen, onClose }) => {
  const [tabs, setTabs] = useState<DeepSeekTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadDeepSeekTabs();
    }
  }, [isOpen]);

  const loadDeepSeekTabs = async () => {
    try {
      const browserAPI = getBrowserAPI();

      // Đọc selected tabs từ storage
      const result = await new Promise<any>((resolve) => {
        chrome.storage.local.get(["zenTabSelectedTabs"], (data) => {
          resolve(data || {});
        });
      });

      const selectedTabs = result?.zenTabSelectedTabs || {};

      // Lấy containers
      const containers = await browserAPI.contextualIdentities.query({});

      // Build danh sách tabs
      const deepSeekTabs: DeepSeekTab[] = [];

      for (const [cookieStoreId, tabId] of Object.entries(selectedTabs)) {
        try {
          const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
            browserAPI.tabs.get(tabId as number, (result: chrome.tabs.Tab) => {
              if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
                return;
              }
              resolve(result);
            });
          });

          const container = containers.find(
            (c: any) => c.cookieStoreId === cookieStoreId
          );

          if (tab && container) {
            deepSeekTabs.push({
              tabId: tab.id!,
              containerName: container.name,
              title: tab.title || "Untitled",
            });
          }
        } catch (error) {
          console.error("[TestDrawer] Failed to get tab:", error);
        }
      }

      setTabs(deepSeekTabs);

      // Auto-select first tab if available
      if (deepSeekTabs.length > 0 && !selectedTabId) {
        setSelectedTabId(String(deepSeekTabs[0].tabId));
      }
    } catch (error) {
      console.error("[TestDrawer] Failed to load tabs:", error);
      setError("Failed to load DeepSeek tabs");
    }
  };

  const handleSend = async () => {
    if (!selectedTabId || !prompt.trim()) {
      setError("Please select a tab and enter a prompt");
      return;
    }

    setIsSending(true);
    setError("");
    setResponse("");

    try {
      const requestId = `test-${Date.now()}`;
      const tabId = parseInt(selectedTabId);

      // Send prompt
      const result = await chrome.runtime.sendMessage({
        action: "deepseek.sendPrompt",
        tabId,
        prompt: prompt.trim(),
        requestId,
      });

      // ✅ Kiểm tra kỹ result trước khi truy cập property
      if (!result || !result.success) {
        setError("Failed to send prompt to DeepSeek");
        setIsSending(false);
        return;
      }

      // Poll for response
      let attempts = 0;
      const maxAttempts = 180; // 3 minutes

      const pollResponse = async () => {
        attempts++;

        if (attempts > maxAttempts) {
          setError("Timeout waiting for response");
          setIsSending(false);
          return;
        }

        // Check if still generating
        const generatingResult = await chrome.runtime.sendMessage({
          action: "deepseek.isGenerating",
          tabId,
        });

        if (generatingResult.generating && attempts < 3) {
          setTimeout(pollResponse, 1000);
          return;
        }

        if (!generatingResult.generating && attempts >= 3) {
          // AI finished, get response
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const responseResult = await chrome.runtime.sendMessage({
            action: "deepseek.getLatestResponse",
            tabId,
          });

          if (responseResult.response) {
            setResponse(responseResult.response);
            setIsSending(false);
          } else {
            setTimeout(pollResponse, 1000);
          }
        } else {
          setTimeout(pollResponse, 1000);
        }
      };

      setTimeout(pollResponse, 3000);
    } catch (error) {
      console.error("[TestDrawer] Send failed:", error);
      setError(error instanceof Error ? error.message : "Failed to send");
      setIsSending(false);
    }
  };

  const handleClear = () => {
    setPrompt("");
    setResponse("");
    setError("");
  };

  const tabOptions = tabs.map((tab) => ({
    value: String(tab.tabId),
    label: `${tab.containerName} - ${tab.title}`,
  }));

  const drawerContent = (
    <MotionCustomDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Test DeepSeek Chat"
      subtitle="Send test prompts to DeepSeek tabs"
      direction="right"
      size="full"
      animationType="slide"
      enableBlur={false}
      closeOnOverlayClick={true}
      showCloseButton={true}
    >
      <div className="h-full flex flex-col bg-drawer-background">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tab Selection */}
          <div>
            <CustomCombobox
              label="Select DeepSeek Tab"
              value={selectedTabId}
              options={tabOptions}
              onChange={(value) => setSelectedTabId(value as string)}
              placeholder="Choose a tab..."
              size="md"
              required
            />
          </div>

          {/* Prompt Input */}
          <div>
            <CustomInput
              label="Prompt"
              value={prompt}
              onChange={setPrompt}
              placeholder="Enter your prompt here..."
              multiline
              rows={5}
              maxLength={5000}
              showCharCount
              required
              variant="primary"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <CustomButton
              variant="primary"
              size="md"
              icon={Send}
              onClick={handleSend}
              loading={isSending}
              disabled={!selectedTabId || !prompt.trim() || isSending}
              className="flex-1"
            >
              {isSending ? "Sending..." : "Send Prompt"}
            </CustomButton>

            <CustomButton
              variant="secondary"
              size="md"
              icon={Trash2}
              onClick={handleClear}
              disabled={isSending}
            >
              Clear
            </CustomButton>

            <CustomButton
              variant="secondary"
              size="md"
              icon={RefreshCw}
              onClick={loadDeepSeekTabs}
              disabled={isSending}
            >
              Refresh
            </CustomButton>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Response Display */}
          {response && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Response
              </label>
              <div className="p-4 bg-card-background border border-border-default rounded-lg">
                <pre className="text-sm text-text-primary whitespace-pre-wrap break-words font-mono">
                  {response}
                </pre>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isSending && !response && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Waiting for response from DeepSeek...
              </p>
            </div>
          )}

          {/* No Tabs Message */}
          {tabs.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-sm text-text-secondary">
                No DeepSeek tabs selected
              </p>
              <p className="text-xs text-text-secondary/70 mt-1">
                Please select tabs in the Tab Selection drawer first
              </p>
            </div>
          )}
        </div>
      </div>
    </MotionCustomDrawer>
  );

  return isOpen ? createPortal(drawerContent, document.body) : null;
};

export default TestDrawer;
