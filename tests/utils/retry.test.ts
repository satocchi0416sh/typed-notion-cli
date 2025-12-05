import { describe, it, expect, vi } from 'vitest';
import { withRetry, calculateBackoffDelay, isRetryableError } from '../../src/utils/retry';

describe('retry utilities', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxAttempts: 3,
        backoffMs: 100,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary error'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation, {
        maxAttempts: 3,
        backoffMs: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('network error'));

      await expect(
        withRetry(operation, {
          maxAttempts: 2,
          backoffMs: 10,
          shouldRetry: () => true,
        })
      ).rejects.toThrow('Operation failed after 2 attempts: network error');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff', () => {
      expect(calculateBackoffDelay(1, { baseDelayMs: 100 })).toBe(100);
      expect(calculateBackoffDelay(2, { baseDelayMs: 100 })).toBe(200);
      expect(calculateBackoffDelay(3, { baseDelayMs: 100 })).toBe(400);
    });

    it('should respect max delay', () => {
      const delay = calculateBackoffDelay(10, {
        baseDelayMs: 100,
        maxDelayMs: 1000,
      });

      expect(delay).toBeLessThanOrEqual(1000);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Network timeout'))).toBe(true);
      expect(isRetryableError(new Error('Internal server error'))).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
      expect(isRetryableError(new Error('Not found'))).toBe(false);
    });
  });
});
