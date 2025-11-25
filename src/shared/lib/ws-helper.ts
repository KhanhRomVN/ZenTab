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
      // Log API Provider trước khi connect
      const storageResult = await new Promise<any>((resolve) => {
        chrome.storage.local.get(["apiProvider"], (data: any) => {
          resolve(data || {});
        });
      });
      const apiProvider = storageResult?.apiProvider || "";

      const response = await chrome.runtime.sendMessage({
        action: "connectWebSocket",
      });

      // ✅ FIX: Nếu response invalid, đợi storage state thay đổi thay vì retry message
      if (
        !response ||
        typeof response !== "object" ||
        typeof response.success !== "boolean"
      ) {
        console.warn(
          "[WSHelper] ⚠️ Invalid response, waiting for storage state change..."
        );

        // Đợi tối đa 3 giây để storage state thay đổi
        const maxWaitTime = 3000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, 200));

          // Kiểm tra storage state
          const state = await this.getConnectionState();
          if (state && state.status === "connected") {
            return { success: true };
          }

          if (state && state.status === "error") {
            return { success: false, error: "Connection failed" };
          }
        }

        // Timeout sau 3 giây
        return {
          success: false,
          error: "Connection timeout - no storage state change detected",
        };
      }

      return response;
    } catch (error) {
      console.error("[WSHelper] Connect error:", error);
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
