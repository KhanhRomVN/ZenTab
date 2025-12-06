// src/background/utils/async/timeout-utils.ts

/**
 * Timeout Utilities - Helper functions cho timeout operations
 */
export class TimeoutUtils {
  /**
   * Timeout một promise
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
    if (timeoutMs <= 0) {
      return promise;
    }

    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            timeoutMessage || `Operation timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Timeout với fallback value
   */
  static async withTimeoutOrDefault<T>(
    promise: Promise<T>,
    timeoutMs: number,
    defaultValue: T,
    timeoutMessage?: string
  ): Promise<T> {
    try {
      return await this.withTimeout(promise, timeoutMs, timeoutMessage);
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return defaultValue;
      }
      throw error;
    }
  }

  /**
   * Timeout với retry
   */
  static async withTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    retryOptions?: {
      maxRetries?: number;
      initialDelay?: number;
      backoffFactor?: number;
    }
  ): Promise<T> {
    const options = {
      maxRetries: 3,
      initialDelay: 100,
      backoffFactor: 2,
      ...retryOptions,
    };

    let lastError: Error;
    let delay = options.initialDelay;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await this.withTimeout(fn(), timeoutMs);
      } catch (error) {
        lastError = error as Error;

        if (attempt === options.maxRetries) {
          throw lastError;
        }

        // Chỉ retry nếu là timeout error
        if (error instanceof Error && !error.message.includes("timed out")) {
          throw error;
        }

        await this.delay(delay);
        delay = Math.min(delay * options.backoffFactor, 5000);
      }
    }

    throw lastError!;
  }

  /**
   * Batch timeout cho multiple promises
   */
  static async batchWithTimeout<T>(
    promises: Promise<T>[],
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<(T | Error)[]> {
    const timeoutPromise = this.delay(timeoutMs).then(() => {
      throw new Error(
        timeoutMessage || `Batch operation timed out after ${timeoutMs}ms`
      );
    });

    const results = await Promise.allSettled(
      promises.map((p) => Promise.race([p, timeoutPromise]))
    );

    return results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      }
    });
  }

  /**
   * Debounce function
   */
  static debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        fn(...args);
        timeoutId = null;
      }, delay);
    };
  }

  /**
   * Debounce với immediate execution
   */
  static debounceImmediate<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
    immediate: boolean = false
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastCallTime = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();

      if (immediate && (!timeoutId || now - lastCallTime > delay)) {
        fn(...args);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        if (!immediate) {
          fn(...args);
        }
        timeoutId = null;
      }, delay);

      lastCallTime = now;
    };
  }

  /**
   * Throttle function
   */
  static throttle<T extends (...args: any[]) => any>(
    fn: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;
    let lastCallTime = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();

      if (!inThrottle || now - lastCallTime >= limit) {
        fn(...args);
        inThrottle = true;
        lastCallTime = now;

        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }

  /**
   * Throttle với leading và trailing edge
   */
  static throttleWithOptions<T extends (...args: any[]) => any>(
    fn: T,
    limit: number,
    options: { leading?: boolean; trailing?: boolean } = {}
  ): (...args: Parameters<T>) => void {
    const { leading = true, trailing = true } = options;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastCallTime = 0;
    let lastArgs: Parameters<T> | null = null;

    const execute = (args: Parameters<T>) => {
      fn(...args);
      lastCallTime = Date.now();
      timeoutId = null;
    };

    return (...args: Parameters<T>) => {
      const now = Date.now();

      if (!lastCallTime && !leading) {
        lastCallTime = now;
      }

      const remaining = limit - (now - lastCallTime);

      lastArgs = args;

      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        execute(args);
      } else if (trailing && !timeoutId) {
        timeoutId = setTimeout(() => {
          if (lastArgs) {
            execute(lastArgs);
          }
        }, remaining);
      }
    };
  }

  /**
   * Tạo cancellable timeout
   */
  static createCancellableTimeout(
    timeoutMs: number,
    callback: () => void
  ): { cancel: () => void } {
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      timeoutId = null;
      callback();
    }, timeoutMs);

    return {
      cancel: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      },
    };
  }

  /**
   * Tạo interval với timeout
   */
  static createIntervalWithTimeout(
    fn: () => void,
    intervalMs: number,
    timeoutMs?: number
  ): { start: () => void; stop: () => void } {
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let stopFn: (() => void) | null = null;

    stopFn = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    return {
      start: () => {
        if (intervalId) return;

        intervalId = setInterval(fn, intervalMs);

        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            if (stopFn) {
              stopFn();
            }
          }, timeoutMs);
        }
      },
      stop: stopFn,
    };
  }

  /**
   * Kiểm tra nếu operation mất quá nhiều thời gian
   */
  static async measureExecutionTime<T>(
    fn: () => Promise<T>,
    warningThresholdMs: number = 1000
  ): Promise<{ result: T; executionTime: number; wasSlow: boolean }> {
    const startTime = Date.now();
    const result = await fn();
    const executionTime = Date.now() - startTime;
    const wasSlow = executionTime > warningThresholdMs;
    return { result, executionTime, wasSlow };
  }

  /**
   * Tạo promise với timeout và progress updates
   */
  static createTimedPromise<T>(
    promiseFn: () => Promise<T>,
    timeoutMs: number,
    progressIntervalMs: number = 1000
  ): {
    promise: Promise<T>;
    cancel: () => void;
    getRemainingTime: () => number;
    getElapsedTime: () => number;
  } {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | null = null;
    let progressIntervalId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const promise = new Promise<T>((resolve, reject) => {
      // Main timeout
      timeoutId = setTimeout(() => {
        if (!isCancelled) {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Progress updates
      progressIntervalId = setInterval(() => {}, progressIntervalMs);

      // Execute the actual promise
      promiseFn()
        .then((result) => {
          if (!isCancelled) {
            resolve(result);
          }
        })
        .catch((error) => {
          if (!isCancelled) {
            reject(error);
          }
        });
    });

    return {
      promise,
      cancel: () => {
        isCancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (progressIntervalId) {
          clearInterval(progressIntervalId);
          progressIntervalId = null;
        }
      },
      getRemainingTime: () => {
        const elapsed = Date.now() - startTime;
        return Math.max(0, timeoutMs - elapsed);
      },
      getElapsedTime: () => Date.now() - startTime,
    };
  }

  /**
   * Delay execution
   */
  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Delay với progress callback
   */
  static delayWithProgress(
    ms: number,
    progressCallback?: (progress: number) => void,
    intervalMs: number = 100
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let intervalId: NodeJS.Timeout | null = null;

      if (progressCallback) {
        intervalId = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / ms, 1);
          progressCallback(progress);
        }, intervalMs);
      }

      setTimeout(() => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        if (progressCallback) {
          progressCallback(1);
        }
        resolve();
      }, ms);
    });
  }

  /**
   * Race multiple promises với individual timeouts
   */
  static async raceWithIndividualTimeouts<T>(
    promises: Array<{
      promise: Promise<T>;
      timeoutMs: number;
      timeoutMessage?: string;
    }>
  ): Promise<{ result: T; index: number; time: number }> {
    const startTime = Date.now();
    const timeoutPromises = promises.map((p, index) =>
      this.withTimeout(p.promise, p.timeoutMs, p.timeoutMessage)
        .then((result) => ({
          result,
          index,
          time: Date.now() - startTime,
        }))
        .catch((error) => {
          throw { error, index };
        })
    );

    try {
      return await Promise.race(timeoutPromises);
    } catch (error) {
      // Nếu tất cả promises fail, throw error tổng hợp
      const allResults = await Promise.allSettled(timeoutPromises);
      const allErrors = allResults
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => {
          const reason = r.reason as { error: Error; index: number };
          return reason.error;
        });

      if (allErrors.length === promises.length) {
        throw new Error(
          `All promises failed: ${allErrors.map((e) => e.message).join(", ")}`
        );
      }

      throw error;
    }
  }

  /**
   * Kiểm tra nếu timeout đã hết hạn
   */
  static isTimeoutExpired(startTime: number, timeoutMs: number): boolean {
    return Date.now() - startTime > timeoutMs;
  }

  /**
   * Tính toán remaining time
   */
  static getRemainingTime(startTime: number, timeoutMs: number): number {
    const elapsed = Date.now() - startTime;
    return Math.max(0, timeoutMs - elapsed);
  }
}
