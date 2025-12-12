// src/background/core/managers/heartbeat/heartbeat-manager.ts

import { TabStateManager } from "../tab-state/tab-state-manager";

/**
 * HeartbeatManager - Manages periodic ping-pong heartbeat for active conversations
 *
 * Flow:
 * 1. First pong received → Start heartbeat
 * 2. Send ping every 5 seconds
 * 3. Monitor pong responses
 * 4. If no pong within timeout → Cleanup tab state
 */
export class HeartbeatManager {
  private static instance: HeartbeatManager | null = null;

  // Map: conversationId → interval ID
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  // Map: conversationId → last pong timestamp
  private lastPongTime: Map<string, number> = new Map();

  // Map: conversationId → tabId
  private conversationToTab: Map<string, number> = new Map();

  // Map: conversationId → folderPath
  private conversationToFolder: Map<string, string | null> = new Map();

  // Configuration
  private readonly PING_INTERVAL = 5000; // 5 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): HeartbeatManager {
    if (!HeartbeatManager.instance) {
      HeartbeatManager.instance = new HeartbeatManager();
    }
    return HeartbeatManager.instance;
  }

  /**
   * Start heartbeat for a conversation
   * Called when first pong is received
   */
  public async startHeartbeat(
    conversationId: string,
    tabId: number,
    folderPath: string | null
  ): Promise<void> {
    // Stop existing heartbeat if any
    this.stopHeartbeat(conversationId);

    // Store mappings
    this.conversationToTab.set(conversationId, tabId);
    this.conversationToFolder.set(conversationId, folderPath);
    this.lastPongTime.set(conversationId, Date.now());

    // Create interval to send ping every 5 seconds
    const interval = setInterval(() => {
      this.sendPing(conversationId, tabId);
      this.checkPongTimeout(conversationId, tabId);
    }, this.PING_INTERVAL);

    this.intervals.set(conversationId, interval);
  }

  /**
   * Stop heartbeat for a conversation
   */
  public stopHeartbeat(conversationId: string): void {
    const interval = this.intervals.get(conversationId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(conversationId);
      this.lastPongTime.delete(conversationId);
      this.conversationToTab.delete(conversationId);
      this.conversationToFolder.delete(conversationId);
    }
  }

  /**
   * Check if heartbeat is active for a conversation
   */
  public isHeartbeatActive(conversationId: string): boolean {
    return this.intervals.has(conversationId);
  }

  /**
   * Get heartbeat status for a conversation
   */
  public getHeartbeatStatus(conversationId: string): {
    active: boolean;
    lastPongTime?: number;
    folderPath?: string | null;
  } {
    const active = this.intervals.has(conversationId);

    if (!active) {
      return { active: false };
    }

    return {
      active: true,
      lastPongTime: this.lastPongTime.get(conversationId),
      folderPath: this.conversationToFolder.get(conversationId),
    };
  }

  /**
   * Handle pong received from Zen
   * Updates last pong timestamp
   */
  public handlePongReceived(conversationId: string): void {
    this.lastPongTime.set(conversationId, Date.now());
  }

  /**
   * Send ping to Zen via PromptController (reuse existing ping logic)
   */
  private async sendPing(conversationId: string, tabId: number): Promise<void> {
    try {
      // Get stored folderPath for this conversation
      const folderPath = this.conversationToFolder.get(conversationId) || null;

      // Call PromptController to send ping
      const { PromptController } = await import(
        "../../../ai-services/deepseek/prompt-controller"
      );

      // Use heartbeat requestId
      const requestId = `heartbeat-${Date.now()}`;

      await PromptController.sendPingToZen(
        tabId,
        requestId,
        conversationId,
        folderPath
      );
    } catch (error) {
      console.error(
        `[HeartbeatManager] ❌ Failed to send ping for conversation ${conversationId}:`,
        error
      );
    }
  }

  /**
   * Check if pong timeout occurred
   * If yes, cleanup tab state and stop heartbeat
   */
  private async checkPongTimeout(
    conversationId: string,
    tabId: number
  ): Promise<void> {
    const lastPong = this.lastPongTime.get(conversationId);
    if (!lastPong) return;

    const timeSinceLastPong = Date.now() - lastPong;

    if (timeSinceLastPong > this.PONG_TIMEOUT) {
      console.warn(
        `[HeartbeatManager] ⚠️ Pong timeout for conversation ${conversationId} (${timeSinceLastPong}ms) - cleaning up`
      );

      // Stop heartbeat
      this.stopHeartbeat(conversationId);

      // Cleanup tab state
      await this.cleanupTabState(tabId);
    }
  }

  /**
   * Cleanup tab state when heartbeat fails
   * - Unlink conversationId
   * - Unlink folderPath
   * - Mark tab as free
   */
  private async cleanupTabState(tabId: number): Promise<void> {
    try {
      const tabStateManager = TabStateManager.getInstance();

      // Unlink conversation
      await tabStateManager.unlinkTabFromConversation(tabId);

      // Unlink folder
      await tabStateManager.unlinkTabFromFolder(tabId);

      // Mark tab as free
      await tabStateManager.markTabFree(tabId);
    } catch (error) {
      console.error(
        `[HeartbeatManager] ❌ Failed to cleanup tab ${tabId}:`,
        error
      );
    }
  }
}
