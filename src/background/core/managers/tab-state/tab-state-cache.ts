// src/background/core/managers/tab-state/tab-state-cache.ts

import { TabStateData } from "../../types/core/tab-state.types";

/**
 * Cache manager cho tab states
 */
export class TabStateCache {
  private cache: Map<number, { state: TabStateData; timestamp: number }> =
    new Map();
  private readonly CACHE_TTL = 10000; // 10 seconds
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Lấy state từ cache
   */
  public get(tabId: number): TabStateData | null {
    const cached = this.cache.get(tabId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    const cacheAge = now - cached.timestamp;

    if (cacheAge > this.CACHE_TTL) {
      this.cache.delete(tabId);
      return null;
    }

    return cached.state;
  }

  /**
   * Lưu state vào cache
   */
  public set(tabId: number, state: TabStateData): void {
    // Evict nếu cache quá lớn
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(tabId, {
      state: state,
      timestamp: Date.now(),
    });
  }

  /**
   * Xóa state khỏi cache
   */
  public delete(tabId: number): boolean {
    return this.cache.delete(tabId);
  }

  /**
   * Xóa tất cả cache
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache cho một tab hoặc tất cả
   */
  public invalidate(tabId?: number): void {
    if (tabId !== undefined) {
      this.delete(tabId);
    } else {
      this.clear();
    }
  }

  /**
   * Lấy tất cả cached tab IDs
   */
  public getCachedTabIds(): number[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  public getStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldest(): void {
    let oldestKey: number | null = null;
    let oldestTimestamp = Date.now();

    const entries = Array.from(this.cache.entries());
    for (const [tabId, data] of entries) {
      if (data.timestamp < oldestTimestamp) {
        oldestTimestamp = data.timestamp;
        oldestKey = tabId;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
    }
  }
}
