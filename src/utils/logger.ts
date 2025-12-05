/**
 * Comprehensive logging system for the CLI
 */

import chalk from 'chalk';
import { writeFile, ensureDirectory } from './file-system.js';
import { join } from 'node:path';
import { appendFile } from 'node:fs/promises';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  command?: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerOptions {
  level: LogLevel;
  enableFileLogging: boolean;
  logDirectory: string;
  enableColors: boolean;
  includeTimestamp: boolean;
  command?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 1, // Same as info for filtering
};

const LOG_COLORS: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
};

const LOG_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
  success: '✓',
};

/**
 * Advanced CLI logger with file output and structured logging
 */
export class Logger {
  private options: LoggerOptions;
  private logEntries: LogEntry[] = [];

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: 'info',
      enableFileLogging: false,
      logDirectory: './logs',
      enableColors: true,
      includeTimestamp: true,
      ...options,
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  /**
   * Log a success message
   */
  success(message: string, context?: Record<string, unknown>): void {
    this.log('success', message, context);
  }

  /**
   * Log operation start
   */
  startOperation(operationName: string, context?: Record<string, unknown>): void {
    this.info(`Starting ${operationName}`, context);
  }

  /**
   * Log operation completion
   */
  completeOperation(
    operationName: string,
    duration?: number,
    context?: Record<string, unknown>
  ): void {
    const message = duration
      ? `Completed ${operationName} in ${duration.toFixed(2)}ms`
      : `Completed ${operationName}`;
    this.success(message, context);
  }

  /**
   * Log operation failure
   */
  failOperation(operationName: string, error: Error, context?: Record<string, unknown>): void {
    this.error(`Failed ${operationName}`, error, context);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check if this log level should be output
    if (LOG_LEVELS[level] < LOG_LEVELS[this.options.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.options.command && { command: this.options.command }),
      ...(context && { context }),
      ...(error && { error }),
    };

    this.logEntries.push(entry);

    // Console output
    this.outputToConsole(entry);

    // File output
    if (this.options.enableFileLogging) {
      this.outputToFile(entry).catch(err => {
        console.error(chalk.red('Failed to write to log file:'), err.message);
      });
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const { level, message, timestamp, context, error } = entry;

    // Build console message
    let consoleMessage = '';

    // Timestamp
    if (this.options.includeTimestamp) {
      const time = new Date(timestamp).toLocaleTimeString();
      consoleMessage += chalk.gray(`[${time}] `);
    }

    // Icon and level
    const icon = LOG_ICONS[level];
    consoleMessage += `${icon} `;

    // Message with color
    if (this.options.enableColors) {
      consoleMessage += LOG_COLORS[level](message);
    } else {
      consoleMessage += message;
    }

    // Context
    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(', ');
      consoleMessage += chalk.gray(` (${contextStr})`);
    }

    // Output to console
    // eslint-disable-next-line no-console
    console.log(consoleMessage);

    // Error details
    if (error) {
      // eslint-disable-next-line no-console
      console.log(chalk.gray(`  Error: ${error.message}`));
      if (entry.level === 'debug' && error.stack) {
        // eslint-disable-next-line no-console
        console.log(chalk.gray(`  Stack: ${error.stack}`));
      }
    }
  }

  /**
   * Output log entry to file
   */
  private async outputToFile(entry: LogEntry): Promise<void> {
    try {
      await ensureDirectory(this.options.logDirectory);

      const logFileName = `typed-notion-${new Date().toISOString().split('T')[0]}.log`;
      const logFilePath = join(this.options.logDirectory, logFileName);

      const logLine = `${JSON.stringify(entry)}\n`;

      // Append to log file
      await appendFile(logFilePath, logLine);
    } catch (error) {
      // Don't throw here to avoid recursive logging
      // eslint-disable-next-line no-console
      console.error('Failed to write log file:', error);
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Set command context
   */
  setCommand(command: string): void {
    this.options.command = command;
  }

  /**
   * Enable/disable file logging
   */
  setFileLogging(enabled: boolean, directory?: string): void {
    this.options.enableFileLogging = enabled;
    if (directory) {
      this.options.logDirectory = directory;
    }
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.logEntries];
  }

  /**
   * Get entries by level
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.logEntries.filter(entry => entry.level === level);
  }

  /**
   * Get entries by command
   */
  getEntriesByCommand(command: string): LogEntry[] {
    return this.logEntries.filter(entry => entry.command === command);
  }

  /**
   * Clear log entries
   */
  clearEntries(): void {
    this.logEntries = [];
  }

  /**
   * Generate summary report
   */
  generateSummary(): string {
    const summary = {
      total: this.logEntries.length,
      debug: this.getEntriesByLevel('debug').length,
      info: this.getEntriesByLevel('info').length,
      warn: this.getEntriesByLevel('warn').length,
      error: this.getEntriesByLevel('error').length,
      success: this.getEntriesByLevel('success').length,
    };

    return [
      chalk.bold('📊 Log Summary:'),
      `  Total entries: ${summary.total}`,
      `  Debug: ${summary.debug}`,
      `  Info: ${summary.info}`,
      `  Warnings: ${summary.warn}`,
      `  Errors: ${summary.error}`,
      `  Success: ${summary.success}`,
    ].join('\n');
  }

  /**
   * Export logs to file
   */
  async exportLogs(filePath: string): Promise<void> {
    const content = this.logEntries.map(entry => JSON.stringify(entry)).join('\n');

    await ensureDirectory(join(filePath, '..'));
    await writeFile(filePath, content);
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  logDirectory: process.env.LOG_DIRECTORY || './logs',
  enableColors: process.stdout.isTTY && process.env.NO_COLOR !== '1',
});

/**
 * Create a logger for a specific command
 */
export function createCommandLogger(command: string, options: Partial<LoggerOptions> = {}): Logger {
  return new Logger({
    ...options,
    command,
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  });
}

/**
 * Logger middleware for command timing
 */
export function withLogging<T extends unknown[], R>(
  operationName: string,
  fn: (...args: T) => Promise<R>,
  loggerInstance: Logger = logger
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = performance.now();

    loggerInstance.startOperation(operationName);

    try {
      const result = await fn(...args);
      const duration = performance.now() - startTime;
      loggerInstance.completeOperation(operationName, duration);
      return result;
    } catch (error) {
      loggerInstance.failOperation(operationName, error as Error);
      throw error;
    }
  };
}

/**
 * Progress logger for long operations
 */
export class ProgressLogger {
  private logger: Logger;
  private operationName: string;
  private total: number;
  private current: number = 0;

  constructor(operationName: string, total: number, loggerInstance: Logger = logger) {
    this.logger = loggerInstance;
    this.operationName = operationName;
    this.total = total;

    this.logger.info(`Starting ${operationName}`, { total });
  }

  /**
   * Update progress
   */
  update(increment: number = 1, message?: string): void {
    this.current += increment;
    const percentage = Math.round((this.current / this.total) * 100);

    const progressMessage = message || `Progress: ${this.current}/${this.total}`;
    this.logger.debug(`${this.operationName}: ${progressMessage} (${percentage}%)`);
  }

  /**
   * Complete the progress
   */
  complete(message?: string): void {
    const finalMessage = message || `Completed ${this.operationName}`;
    this.logger.success(finalMessage, {
      total: this.total,
      completed: this.current,
    });
  }

  /**
   * Fail the progress
   */
  fail(error: Error): void {
    this.logger.failOperation(this.operationName, error, {
      total: this.total,
      completed: this.current,
    });
  }
}
