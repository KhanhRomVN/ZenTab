// src/background/utils/async/promise-utils.ts

/**
 * Promise Utilities - Helper functions cho promise operations
 */
export class PromiseUtils {
  /**
   * Retry một function với exponential backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      shouldRetry?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 100,
      maxDelay = 5000,
      backoffFactor = 2,
      shouldRetry = () => true,
    } = options;

    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        console.warn(
          `[PromiseUtils] ⚠️ Attempt ${
            attempt + 1
          } failed, retrying in ${delay}ms:`,
          error
        );

        await this.delay(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Timeout một promise
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string
  ): Promise<T> {
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
   * Delay execution
   */
  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Run promises sequentially
   */
  static async sequential<T>(
    items: T[],
    fn: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      await fn(items[i], i);
    }
  }

  /**
   * Batch process items
   */
  static async batchProcess<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    batchSize: number = 5
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(fn));
      results.push(...batchResults);
    }

    return results;
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
   * Throttle function
   */
  static throttle<T extends (...args: any[]) => any>(
    fn: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;

        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }

  /**
   * Memoize async function
   */
  static memoizeAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    ttl: number = 60000 // 1 minute default
  ): T {
    const cache = new Map<string, { value: any; timestamp: number }>();

    return (async (...args: Parameters<T>): Promise<any> => {
      const key = JSON.stringify(args);
      const cached = cache.get(key);

      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }

      const result = await fn(...args);
      cache.set(key, { value: result, timestamp: Date.now() });

      // Cleanup old entries
      const now = Date.now();
      for (const [cacheKey, entry] of cache.entries()) {
        if (now - entry.timestamp > ttl) {
          cache.delete(cacheKey);
        }
      }

      return result;
    }) as T;
  }

  /**
   * Create cancellable promise
   */
  static createCancellablePromise<T>(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
      onCancel: (callback: () => void) => void
    ) => void
  ): { promise: Promise<T>; cancel: () => void } {
    let cancelCallback: (() => void) | null = null;
    let isCancelled = false;

    const promise = new Promise<T>((resolve, reject) => {
      executor(
        (value) => {
          if (!isCancelled) {
            resolve(value);
          }
        },
        (reason) => {
          if (!isCancelled) {
            reject(reason);
          }
        },
        (callback) => {
          cancelCallback = callback;
        }
      );
    });

    return {
      promise,
      cancel: () => {
        isCancelled = true;
        if (cancelCallback) {
          cancelCallback();
        }
      },
    };
  }

  /**
   * Promise pool với concurrency limit
   */
  static async promisePool<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency: number = 5
  ): Promise<R[]> {
    const results: R[] = [];
    const executing = new Set<Promise<any>>();

    for (const item of items) {
      const promise = fn(item).then((result) => {
        results.push(result);
        executing.delete(promise);
      });

      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
