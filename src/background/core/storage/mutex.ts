// src/background/core/storage/mutex.ts

/**
 * 🔒 Simple Mutex Lock với auto-timeout để tránh deadlock
 */
export class StorageMutex {
  private queue: Array<() => void> = [];
  private locked = false;
  private readonly LOCK_TIMEOUT = 5000; // 5 seconds max lock time
  private lockTimestamp: number = 0;

  /**
   * Acquire mutex lock
   */
  public async acquire(): Promise<void> {
    // Check for stale lock (deadlock prevention)
    if (this.locked && this.lockTimestamp > 0) {
      const lockAge = Date.now() - this.lockTimestamp;
      if (lockAge > this.LOCK_TIMEOUT) {
        console.warn(
          "[StorageMutex] ⚠️ Detected stale lock, force releasing..."
        );
        this.forceRelease();
      }
    }

    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        this.lockTimestamp = Date.now();
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  /**
   * Release mutex lock
   */
  public release(): void {
    this.lockTimestamp = 0;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.lockTimestamp = Date.now();
        next();
      }
    } else {
      this.locked = false;
    }
  }

  /**
   * Check if mutex is locked
   */
  public isLocked(): boolean {
    return this.locked;
  }

  /**
   * Get lock age in milliseconds
   */
  public getLockAge(): number {
    if (!this.locked || this.lockTimestamp === 0) {
      return 0;
    }
    return Date.now() - this.lockTimestamp;
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Force release lock (emergency deadlock recovery)
   */
  private forceRelease(): void {
    this.locked = false;
    this.lockTimestamp = 0;

    // Process first queued request
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Execute function với mutex protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
