/**
 * Performance monitoring and benchmarking utilities
 */

import chalk from 'chalk';

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  operationName: string;
}

export interface PerformanceBenchmark {
  name: string;
  targetTime: number; // milliseconds
  warningThreshold: number; // percentage of target time (e.g., 0.8 for 80%)
}

/**
 * Performance targets for CLI operations (in milliseconds)
 */
export const PERFORMANCE_TARGETS = {
  INIT_COMMAND: 60000, // 1 minute
  SCHEMA_GENERATION: 30000, // 30 seconds for 50 properties
  VALIDATION: 5000, // 5 seconds
  CONFIG_LOADING: 1000, // 1 second
  FILE_WRITE: 2000, // 2 seconds
  API_REQUEST: 10000, // 10 seconds for single request
} as const;

/**
 * Performance monitor class for tracking operation timing
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private activeOperations: Map<string, PerformanceMetrics> = new Map();

  /**
   * Start timing an operation
   */
  startOperation(name: string): string {
    const operationId = `${name}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const metrics: PerformanceMetrics = {
      startTime: performance.now(),
      operationName: name,
    };

    this.activeOperations.set(operationId, metrics);
    return operationId;
  }

  /**
   * End timing an operation and record metrics
   */
  endOperation(operationId: string): PerformanceMetrics | null {
    const metrics = this.activeOperations.get(operationId);
    if (!metrics) {
      return null;
    }

    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memoryUsage = this.getCurrentMemoryUsage();

    this.activeOperations.delete(operationId);
    this.metrics.push(metrics);

    return metrics;
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
    };
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific operation
   */
  getOperationMetrics(operationName: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.operationName === operationName);
  }

  /**
   * Clear all recorded metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    if (this.metrics.length === 0) {
      return chalk.gray('No performance metrics recorded');
    }

    let report = chalk.bold('Performance Report:\n');

    const operationGroups = this.groupMetricsByOperation();

    for (const [operationName, metrics] of operationGroups) {
      const avgDuration = metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length;
      const maxDuration = Math.max(...metrics.map(m => m.duration || 0));
      const minDuration = Math.min(...metrics.map(m => m.duration || 0));

      report += `\n${chalk.cyan(operationName)}:\n`;
      report += `  Executions: ${metrics.length}\n`;
      report += `  Average: ${avgDuration.toFixed(2)}ms\n`;
      report += `  Min: ${minDuration.toFixed(2)}ms\n`;
      report += `  Max: ${maxDuration.toFixed(2)}ms\n`;

      // Check against performance targets
      const target = this.getPerformanceTarget(operationName);
      if (target && avgDuration > target) {
        report += `  ${chalk.red('⚠ Exceeds target')} (${target}ms)\n`;
      } else if (target) {
        report += `  ${chalk.green('✓ Within target')} (${target}ms)\n`;
      }
    }

    return report;
  }

  /**
   * Group metrics by operation name
   */
  private groupMetricsByOperation(): Map<string, PerformanceMetrics[]> {
    const groups = new Map<string, PerformanceMetrics[]>();

    for (const metric of this.metrics) {
      const existing = groups.get(metric.operationName) || [];
      existing.push(metric);
      groups.set(metric.operationName, existing);
    }

    return groups;
  }

  /**
   * Get performance target for operation
   */
  private getPerformanceTarget(operationName: string): number | undefined {
    const normalized = operationName.toUpperCase().replace(/[^A-Z]/g, '_');
    return PERFORMANCE_TARGETS[normalized as keyof typeof PERFORMANCE_TARGETS];
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for timing function execution
 */
export function timed(operationName: string) {
  return function (_target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const operationId = performanceMonitor.startOperation(operationName || propertyKey);

      try {
        const result = await originalMethod.apply(this, args);
        const metrics = performanceMonitor.endOperation(operationId);

        if (metrics && metrics.duration) {
          // eslint-disable-next-line no-console
          console.log(chalk.gray(`${operationName}: ${metrics.duration.toFixed(2)}ms`));
        }

        return result;
      } catch (error) {
        performanceMonitor.endOperation(operationId);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Time a function execution
 */
export async function timeFunction<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const operationId = performanceMonitor.startOperation(operationName);

  try {
    const result = await fn();
    const metrics = performanceMonitor.endOperation(operationId);

    if (!metrics) {
      throw new Error('Failed to record performance metrics');
    }

    return { result, metrics };
  } catch (error) {
    performanceMonitor.endOperation(operationId);
    throw error;
  }
}

/**
 * Check if operation performance meets benchmark
 */
export function checkPerformanceBenchmark(
  metrics: PerformanceMetrics,
  benchmark: PerformanceBenchmark
): {
  passed: boolean;
  message: string;
  recommendation?: string;
} {
  const duration = metrics.duration || 0;
  const warningTime = benchmark.targetTime * benchmark.warningThreshold;

  if (duration <= warningTime) {
    return {
      passed: true,
      message: chalk.green(
        `✓ ${benchmark.name}: ${duration.toFixed(2)}ms (within target of ${benchmark.targetTime}ms)`
      ),
    };
  } else if (duration <= benchmark.targetTime) {
    return {
      passed: true,
      message: chalk.yellow(
        `⚠ ${benchmark.name}: ${duration.toFixed(2)}ms (close to target of ${benchmark.targetTime}ms)`
      ),
      recommendation: 'Consider optimization to improve performance',
    };
  } else {
    return {
      passed: false,
      message: chalk.red(
        `✗ ${benchmark.name}: ${duration.toFixed(2)}ms (exceeds target of ${benchmark.targetTime}ms)`
      ),
      recommendation: 'Performance optimization required',
    };
  }
}

/**
 * Format memory usage for display
 */
export function formatMemoryUsage(usage: {
  rss: number;
  heapUsed: number;
  heapTotal: number;
}): string {
  const formatBytes = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  return [
    `RSS: ${formatBytes(usage.rss)}`,
    `Heap Used: ${formatBytes(usage.heapUsed)}`,
    `Heap Total: ${formatBytes(usage.heapTotal)}`,
  ].join(' | ');
}
