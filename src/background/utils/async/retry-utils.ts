// src/background/utils/async/retry-utils.ts

/**
 * Retry Utilities - Helper functions cho retry operations với exponential backoff
 */
export class RetryUtils {
  /**
   * Default retry options
   */
  static readonly DEFAULT_OPTIONS = {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 5000,
    backoffFactor: 2,
    jitter: true,
  };

  /**
   * Retry một async function với exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<T> {
    const config = { ...RetryUtils.DEFAULT_OPTIONS, ...options };
    let lastError: Error;
    let delay = config.initialDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Nếu là lần retry cuối cùng, throw error
        if (attempt === config.maxRetries) {
          throw this.wrapError(lastError, attempt);
        }

        // Tính toán delay với jitter nếu enabled
        const currentDelay = config.jitter ? this.addJitter(delay) : delay;

        // Chờ delay
        await this.delay(currentDelay);

        // Tính toán delay cho lần tiếp theo
        delay = Math.min(delay * config.backoffFactor, config.maxDelay);
      }
    }

    throw lastError!;
  }

  /**
   * Retry với điều kiện custom
   */
  static async retryWithCondition<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: Error, attempt: number) => boolean,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<T> {
    const config = { ...RetryUtils.DEFAULT_OPTIONS, ...options };
    let lastError: Error;
    let delay = config.initialDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Kiểm tra nếu nên retry
        if (attempt === config.maxRetries || !shouldRetry(lastError, attempt)) {
          throw this.wrapError(lastError, attempt);
        }

        // Tính toán delay với jitter nếu enabled
        const currentDelay = config.jitter ? this.addJitter(delay) : delay;

        // Chờ delay
        await this.delay(currentDelay);

        // Tính toán delay cho lần tiếp theo
        delay = Math.min(delay * config.backoffFactor, config.maxDelay);
      }
    }

    throw lastError!;
  }

  /**
   * Retry với timeout
   */
  static async retryWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<T> {
    const timeoutError = new Error(`Operation timed out after ${timeoutMs}ms`);

    return this.retryWithCondition(
      async () => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(timeoutError), timeoutMs);
        });

        return Promise.race([fn(), timeoutPromise]);
      },
      (error) => error === timeoutError,
      options
    );
  }

  /**
   * Retry cho network requests
   */
  static async retryRequest<T>(
    requestFn: () => Promise<Response>,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<T> {
    return this.retryWithCondition(
      async () => {
        const response = await requestFn();

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json() as Promise<T>;
      },
      (error) => {
        // Retry cho network errors và server errors (5xx)
        const message = error.message;
        return (
          message.includes("NetworkError") ||
          message.includes("Failed to fetch") ||
          message.includes("HTTP 5")
        );
      },
      options
    );
  }

  /**
   * Batch retry cho multiple operations
   */
  static async batchRetry<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<void> {
    const promises = items.map((item) =>
      this.retry(() => fn(item), options).catch((error) => {
        console.error(`[RetryUtils] Failed to process item:`, error);
        throw error;
      })
    );

    await Promise.all(promises);
  }

  /**
   * Sequential retry cho multiple operations
   */
  static async sequentialRetry<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): Promise<void> {
    for (const item of items) {
      await this.retry(() => fn(item), options).catch((error) => {
        console.error(`[RetryUtils] Failed to process item:`, error);
        throw error;
      });
    }
  }

  /**
   * Retry với circuit breaker pattern
   */
  static createCircuitBreaker(
    options: {
      failureThreshold?: number;
      resetTimeout?: number;
      halfOpenMaxAttempts?: number;
    } = {}
  ) {
    const config = {
      failureThreshold: 5,
      resetTimeout: 30000, // 30 seconds
      halfOpenMaxAttempts: 3,
      ...options,
    };

    let state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
    let failureCount = 0;
    let lastFailureTime = 0;
    let halfOpenAttempts = 0;

    return {
      async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Kiểm tra circuit breaker state
        if (state === "OPEN") {
          const now = Date.now();
          if (now - lastFailureTime > config.resetTimeout) {
            state = "HALF_OPEN";
            halfOpenAttempts = 0;
          } else {
            throw new Error("Circuit breaker is OPEN");
          }
        }

        if (
          state === "HALF_OPEN" &&
          halfOpenAttempts >= config.halfOpenMaxAttempts
        ) {
          state = "OPEN";
          lastFailureTime = Date.now();
          throw new Error("Circuit breaker is OPEN");
        }

        try {
          const result = await fn();

          // Reset trên success
          if (state === "HALF_OPEN") {
            halfOpenAttempts++;
            if (halfOpenAttempts >= config.halfOpenMaxAttempts) {
              state = "CLOSED";
              failureCount = 0;
            }
          } else {
            failureCount = 0;
          }

          return result;
        } catch (error) {
          failureCount++;
          lastFailureTime = Date.now();

          if (state === "HALF_OPEN") {
            state = "OPEN";
          } else if (failureCount >= config.failureThreshold) {
            state = "OPEN";
          }

          throw error;
        }
      },

      getState() {
        return state;
      },

      getFailureCount() {
        return failureCount;
      },

      reset() {
        state = "CLOSED";
        failureCount = 0;
        halfOpenAttempts = 0;
      },
    };
  }

  /**
   * Helper để thêm jitter vào delay
   */
  private static addJitter(delay: number): number {
    // Thêm random jitter ±20%
    const jitter = 0.2;
    const randomFactor = 1 + (Math.random() * 2 * jitter - jitter);
    return Math.floor(delay * randomFactor);
  }

  /**
   * Helper để delay
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wrap error với attempt information
   */
  private static wrapError(error: Error, attempt: number): Error {
    const wrappedError = new Error(
      `Failed after ${attempt + 1} attempts: ${error.message}`
    );
    wrappedError.stack = error.stack;
    wrappedError.name = error.name;
    return wrappedError;
  }

  /**
   * Tính toán delay cho attempt cụ thể
   */
  static calculateDelay(
    attempt: number,
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ): number {
    const config = { ...RetryUtils.DEFAULT_OPTIONS, ...options };
    let delay = config.initialDelay;

    for (let i = 0; i < attempt; i++) {
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    }

    if (config.jitter) {
      delay = this.addJitter(delay);
    }

    return delay;
  }

  /**
   * Create retry policy
   */
  static createPolicy(
    options: Partial<typeof RetryUtils.DEFAULT_OPTIONS> = {}
  ) {
    const config = { ...RetryUtils.DEFAULT_OPTIONS, ...options };

    return {
      async execute<T>(fn: () => Promise<T>): Promise<T> {
        return RetryUtils.retry(fn, config);
      },

      async executeWithCondition<T>(
        fn: () => Promise<T>,
        shouldRetry: (error: Error, attempt: number) => boolean
      ): Promise<T> {
        return RetryUtils.retryWithCondition(fn, shouldRetry, config);
      },

      getConfig() {
        return { ...config };
      },
    };
  }
}
