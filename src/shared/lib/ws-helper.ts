// src/shared/lib/ws-helper.ts

export interface WSConnectionState {
  id: string;
  port: number;
  url: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastConnected?: number;
}

export class WSHelper {
  static async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[WSHelper] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(
        `[WSHelper] 🚀 CONNECT() CALLED - Starting connection flow...`
      );
      console.log(`[WSHelper] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // 🔥 STEP 1: CLEAN SLATE - Xóa toàn bộ state cũ trước khi connect
      console.log(
        `[WSHelper] 🧹 STEP 1: Clearing old storage (wsStates, wsMessages, wsOutgoingMessage)...`
      );

      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(
          ["wsStates", "wsMessages", "wsOutgoingMessage"],
          () => {
            console.log(`[WSHelper] ✅ Storage cleared successfully`);
            resolve();
          }
        );
      });

      // Small delay để đảm bảo storage đã clear
      console.log(`[WSHelper] ⏱️ Waiting 100ms for storage clear to settle...`);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 🔥 STEP 2: Gửi connect message (sẽ tạo state MỚI hoàn toàn)
      console.log(
        `[WSHelper] 📤 STEP 2: Sending connectWebSocket message to service worker...`
      );
      const response = await chrome.runtime.sendMessage({
        action: "connectWebSocket",
      });
      console.log(
        `[WSHelper] 📥 Received response from service worker:`,
        response
      );

      // 🔥 STEP 3: Validate response structure
      if (
        !response ||
        typeof response !== "object" ||
        typeof response.success !== "boolean"
      ) {
        console.warn(
          "[WSHelper] ⚠️ Invalid response structure, verifying via storage..."
        );
        console.warn(`[WSHelper] 🔍 Response type: ${typeof response}`);
        console.warn(`[WSHelper] 🔍 Response value:`, response);

        // Đợi backend ghi state vào storage (tối đa 2s)
        const maxWaitTime = 2000;
        const pollInterval = 200;
        const startTime = Date.now();

        console.log(
          `[WSHelper] 🔄 Starting storage polling (max ${maxWaitTime}ms, interval ${pollInterval}ms)...`
        );

        let pollCount = 0;
        while (Date.now() - startTime < maxWaitTime) {
          pollCount++;
          console.log(`[WSHelper] 🔄 Poll attempt #${pollCount}...`);

          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const state = await this.getConnectionState();
          console.log(`[WSHelper] 📊 Poll result:`, state);

          if (state && state.status === "connected") {
            console.log(
              `[WSHelper] ✅ Connection state found in storage (connected) after ${pollCount} polls`
            );
            return { success: true };
          }

          if (state && state.status === "error") {
            console.error("[WSHelper] ❌ Connection error in storage");
            return { success: false, error: "Connection failed" };
          }
        }

        console.error(
          `[WSHelper] ⏱️ Timeout waiting for connection state (${pollCount} polls)`
        );
        return {
          success: false,
          error: "Connection timeout - no state update detected",
        };
      }

      // 🔥 STEP 4: Response hợp lệ → return ngay
      if (response.success) {
        console.log("[WSHelper] ✅ Connection successful (from response)");
        console.log(`[WSHelper] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[WSHelper] 🎉 CONNECT() COMPLETED SUCCESSFULLY`);
        console.log(`[WSHelper] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      } else {
        console.error("[WSHelper] ❌ Connection failed:", response.error);
        console.log(`[WSHelper] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      }

      return response;
    } catch (error) {
      console.error("[WSHelper] ❌ Connect exception:", error);
      console.error(
        `[WSHelper] 🔍 Exception type: ${
          error instanceof Error ? error.constructor.name : typeof error
        }`
      );
      console.error(
        `[WSHelper] 🔍 Exception message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ngắt kết nối WebSocket
   */
  static async disconnect(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "disconnectWebSocket",
      });
      return response || { success: false, error: "No response" };
    } catch (error) {
      console.error("[WSHelper] Disconnect error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Lấy trạng thái connection hiện tại
   */
  static async getConnectionState(): Promise<WSConnectionState | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getWSConnectionInfo",
      });

      if (response && response.success && response.state) {
        return response.state;
      }

      // Fallback: Đọc trực tiếp từ storage với Promise wrapper
      const storageResult = await new Promise<any>((resolve, reject) => {
        chrome.storage.local.get(["wsStates"], (data: any) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(data || {});
        });
      });

      const states = storageResult?.wsStates || {};
      const connectionIds = Object.keys(states);
      if (connectionIds.length > 0) {
        const connectionId = connectionIds[0];
        const stateData = states[connectionId];

        // 🔥 CRITICAL FIX: Validate stateData structure trước khi return
        if (!stateData || typeof stateData !== "object") {
          console.error(
            `[WSHelper] ❌ Invalid stateData structure:`,
            stateData
          );
          return null;
        }

        // 🔥 FIX: Return với fallback values (KHÔNG hardcode URL)
        return {
          id: stateData.id || connectionId,
          port: stateData.port || 0, // 0 = chưa config
          url: stateData.url || "", // Empty = chưa config
          status: stateData.status || "disconnected",
          lastConnected: stateData.lastConnected,
        };
      }

      return null;
    } catch (error) {
      console.error("[WSHelper] ❌ Get state error:", error);

      // Fallback: Try reading from storage even on error với Promise wrapper
      try {
        const storageResult = await new Promise<any>((resolve, reject) => {
          chrome.storage.local.get(["wsStates"], (data: any) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(data || {});
          });
        });

        const states = storageResult?.wsStates || {};
        const connectionIds = Object.keys(states);

        if (connectionIds.length > 0) {
          const connectionId = connectionIds[0];
          const stateData = states[connectionId];

          // 🔥 CRITICAL FIX: Validate và return với fallback values (KHÔNG hardcode)
          if (!stateData || typeof stateData !== "object") {
            console.error(
              `[WSHelper] ❌ Invalid fallback stateData:`,
              stateData
            );
            return null;
          }

          return {
            id: stateData.id || connectionId,
            port: stateData.port || 0, // 0 = chưa config
            url: stateData.url || "", // Empty = chưa config
            status: stateData.status || "disconnected",
            lastConnected: stateData.lastConnected,
          };
        }
      } catch (fallbackError) {
        console.error(
          "[WSHelper] ❌ Fallback storage read also failed:",
          fallbackError
        );
      }

      return null;
    }
  }

  /**
   * Subscribe to connection state changes (single connection)
   */
  static subscribeToState(
    callback: (state: WSConnectionState | null) => void
  ): () => void {
    const listener = (changes: any, areaName: string) => {
      if (areaName !== "local") return;

      if (changes.wsStates) {
        const states = changes.wsStates.newValue || {};
        const connectionIds = Object.keys(states);

        if (connectionIds.length > 0) {
          callback(states[connectionIds[0]]);
        } else {
          callback(null);
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);

    // Load initial state
    chrome.storage.local.get(["wsStates"], (result) => {
      const states = result.wsStates || {};
      const connectionIds = Object.keys(states);

      if (connectionIds.length > 0) {
        callback(states[connectionIds[0]]);
      } else {
        callback(null);
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }
}
