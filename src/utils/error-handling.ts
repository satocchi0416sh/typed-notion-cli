import chalk from 'chalk';

/**
 * Custom CLI error class with enhanced error information
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly suggestion?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends CLIError {
  constructor(message: string, suggestion?: string, cause?: Error) {
    super(message, 1, suggestion, cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * API-related errors
 */
export class NotionAPIError extends CLIError {
  constructor(message: string, suggestion?: string, cause?: Error) {
    super(message, 2, suggestion, cause);
    this.name = 'NotionAPIError';
  }
}

/**
 * File system related errors
 */
export class FileSystemError extends CLIError {
  constructor(message: string, suggestion?: string, cause?: Error) {
    super(message, 3, suggestion, cause);
    this.name = 'FileSystemError';
  }
}

/**
 * Schema validation errors
 */
export class SchemaValidationError extends CLIError {
  constructor(message: string, suggestion?: string, cause?: Error) {
    super(message, 4, suggestion, cause);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Retry-related errors
 */
export class RetryableError extends CLIError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    cause?: Error
  ) {
    super(message, 5, retryAfter ? `Retry after ${retryAfter} seconds` : undefined, cause);
    this.name = 'RetryableError';
  }
}

/**
 * Format error messages with consistent styling
 */
export function formatError(error: Error): string {
  if (error instanceof CLIError) {
    let formatted = chalk.red(`✗ ${error.message}`);

    if (error.suggestion) {
      formatted += `\n${chalk.yellow(`💡 ${error.suggestion}`)}`;
    }

    if (error.cause) {
      formatted += `\n${chalk.gray(`Caused by: ${error.cause.message}`)}`;
    }

    return formatted;
  }

  return chalk.red(`✗ Unexpected error: ${error.message}`);
}

/**
 * Format success messages
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${message}`);
}

/**
 * Format warning messages
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

/**
 * Format info messages
 */
export function formatInfo(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  if (error instanceof NotionAPIError && error.cause) {
    // Check for specific API error codes that are retryable
    const errorMessage = error.cause.message.toLowerCase();
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('connection')
    );
  }

  return false;
}

/**
 * Extract meaningful error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error occurred';
}

/**
 * Create a CLIError from an unknown error
 */
export function createCLIError(error: unknown, context: string, suggestion?: string): CLIError {
  const message = `${context}: ${getErrorMessage(error)}`;
  const cause = error instanceof Error ? error : undefined;

  return new CLIError(message, 1, suggestion, cause);
}

/**
 * Common error scenarios with actionable suggestions
 */
export const ERROR_SCENARIOS = {
  INVALID_TOKEN: {
    message: 'Invalid or expired Notion token',
    suggestion:
      'Check your NOTION_TOKEN in .env file and ensure it starts with "secret_". Generate a new token at https://www.notion.so/my-integrations',
  },
  MISSING_PERMISSIONS: {
    message: 'Insufficient permissions to access Notion database',
    suggestion:
      'Share the database with your integration in Notion. Go to database settings → Add connections → Select your integration',
  },
  DATABASE_NOT_FOUND: {
    message: 'Database or data source not found',
    suggestion:
      'Verify the database ID/data source ID is correct and the integration has access. Run "typed-notion pull" to discover available sources',
  },
  NETWORK_ERROR: {
    message: 'Network connection failed',
    suggestion:
      'Check your internet connection and try again. If behind a proxy, configure npm proxy settings',
  },
  CONFIG_FILE_MISSING: {
    message: 'Configuration file not found',
    suggestion: 'Run "typed-notion init" to create a new configuration file',
  },
  CONFIG_FILE_INVALID: {
    message: 'Configuration file is invalid',
    suggestion:
      'Check the syntax of your typed-notion.config.ts file. Run "typed-notion init --force" to recreate it',
  },
  ENV_FILE_MISSING: {
    message: 'Environment file (.env) not found',
    suggestion: 'Create a .env file with NOTION_TOKEN=your_token_here or run "typed-notion init"',
  },
  OUTPUT_DIRECTORY_ERROR: {
    message: 'Cannot write to output directory',
    suggestion: 'Check directory permissions and ensure the output path in your config is writable',
  },
  SCHEMA_GENERATION_FAILED: {
    message: 'Schema generation failed',
    suggestion:
      'Check the database structure in Notion. Ensure all properties have valid names and types',
  },
  VALIDATION_FAILED: {
    message: 'Schema validation failed',
    suggestion:
      'Your local schema is out of sync with Notion. Run "typed-notion pull" to update schemas or use --fix flag',
  },
} as const;

/**
 * Create specific error with pre-defined scenarios
 */
export function createScenarioError(
  scenario: keyof typeof ERROR_SCENARIOS,
  additionalContext?: string
): CLIError {
  const { message, suggestion } = ERROR_SCENARIOS[scenario];
  const fullMessage = additionalContext ? `${message}: ${additionalContext}` : message;
  return new CLIError(fullMessage, 1, suggestion);
}

/**
 * Enhanced error formatter with context and troubleshooting
 */
export function formatDetailedError(error: Error, command?: string): string {
  let formatted = formatError(error);

  if (command) {
    formatted += `\n${chalk.gray(`Command: ${command}`)}`;
  }

  formatted += `\n${chalk.gray('For more help, visit: https://github.com/your-org/typed-notion-cli/docs')}`;

  return formatted;
}
