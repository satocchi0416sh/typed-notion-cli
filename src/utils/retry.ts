import { RetryableError } from './error-handling.js';
import type { RetryConfig } from '../config/validator.js';

export interface RetryOptions extends RetryConfig {
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

export interface ExponentialBackoffOptions {
  baseDelayMs: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

/**
 * Execute an operation with automatic retry on failure
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, backoffMs, onRetry, shouldRetry = isRetryableError } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!shouldRetry(lastError) || attempt === maxAttempts) {
        throw lastError;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Calculate delay with exponential backoff
      const delay = calculateBackoffDelay(attempt, {
        baseDelayMs: backoffMs,
        jitter: true,
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Calculate exponential backoff delay with optional jitter
 */
export function calculateBackoffDelay(attempt: number, options: ExponentialBackoffOptions): number {
  const { baseDelayMs, maxDelayMs = 30000, jitter = false } = options;

  // Calculate exponential delay
  let delay = baseDelayMs * Math.pow(2, attempt - 1);

  // Apply maximum delay cap
  delay = Math.min(delay, maxDelayMs);

  // Add jitter to prevent thundering herd
  if (jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.round(delay);
}

/**
 * Default function to determine if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  // Check if explicitly marked as retryable
  if (error instanceof RetryableError) {
    return true;
  }

  // Check for common retryable error patterns
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'rate limit',
    'rate_limit',
    'too many requests',
    'timeout',
    'timed out',
    'network',
    'econnreset',
    'econnrefused',
    'socket hang up',
    'internal server error',
    'service unavailable',
    '502',
    '503',
    '504',
    'gateway',
    'temporary',
    'throttle',
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => global.setTimeout(resolve, ms));
}

/**
 * Create a rate limiter that ensures operations don't exceed a specified rate
 */
export class RateLimiter {
  private readonly queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private readonly maxConcurrent: number = 3,
    private readonly minDelayMs: number = 100
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for available slot
    await this.waitForSlot();

    this.running++;

    try {
      const result = await operation();

      // Ensure minimum delay between operations
      await sleep(this.minDelayMs);

      return result;
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  private waitForSlot(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

/**
 * Decorator to add retry logic to a class method
 */
export function Retryable(options: RetryOptions) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}
