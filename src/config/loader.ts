import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import {
  CLIConfig,
  EnvironmentConfig,
  validateConfig,
  validateEnvironment,
  ValidationResult,
} from './validator.js';
import { ConfigurationError } from '../utils/error-handling.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CLIConfig> = {
  output: './src/lib/notion-schema.ts',
  formatting: {
    usePrettier: true,
  },
  retry: {
    maxAttempts: 3,
    backoffMs: 1000,
  },
};

/**
 * Load configuration from file
 */
export async function loadConfig(configPath?: string): Promise<CLIConfig> {
  const resolvedPath = resolveConfigPath(configPath);

  if (!existsSync(resolvedPath)) {
    throw new ConfigurationError(
      `Configuration file not found: ${resolvedPath}`,
      'Run "typed-notion init" to create a configuration file'
    );
  }

  try {
    // Import the configuration file as an ES module
    const configUrl = pathToFileURL(resolvedPath).href;
    const configModule = await import(configUrl);

    // Get the default export
    const configData = configModule.default || configModule;

    // Merge with defaults and validate
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...configData,
      formatting: {
        ...DEFAULT_CONFIG.formatting,
        ...configData.formatting,
      },
      retry: {
        ...DEFAULT_CONFIG.retry,
        ...configData.retry,
      },
    };

    const validation = validateConfig(mergedConfig);
    if (!validation.success) {
      throw new ConfigurationError(
        `Invalid configuration: ${validation.errors?.join(', ')}`,
        'Check your typed-notion.config.ts file for syntax errors'
      );
    }

    return validation.data!;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    throw new ConfigurationError(
      `Failed to load configuration from ${resolvedPath}`,
      'Check that the file exists and has valid TypeScript syntax',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load environment configuration
 */
export function loadEnvironment(): EnvironmentConfig {
  const env = {
    NOTION_TOKEN: process.env.NOTION_TOKEN,
    NOTION_API_VERSION: process.env.NOTION_API_VERSION || '2025-09-03',
  };

  const validation = validateEnvironment(env);
  if (!validation.success) {
    throw new ConfigurationError(
      `Invalid environment configuration: ${validation.errors?.join(', ')}`,
      'Set the NOTION_TOKEN environment variable with your Notion integration token'
    );
  }

  return validation.data!;
}

/**
 * Resolve configuration file path
 */
function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    return resolve(configPath);
  }

  // Look for configuration files in order of preference
  const configFiles = [
    'typed-notion.config.ts',
    'typed-notion.config.js',
    'typed-notion.config.mjs',
  ];

  const cwd = process.cwd();

  for (const configFile of configFiles) {
    const fullPath = resolve(cwd, configFile);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Default to TypeScript config if none found
  return resolve(cwd, 'typed-notion.config.ts');
}

/**
 * Get configuration file path without loading it
 */
export function getConfigPath(configPath?: string): string {
  return resolveConfigPath(configPath);
}

/**
 * Check if configuration file exists
 */
export function configExists(configPath?: string): boolean {
  const resolvedPath = resolveConfigPath(configPath);
  return existsSync(resolvedPath);
}

/**
 * Validate configuration file without loading it
 */
export async function validateConfigFile(
  configPath?: string
): Promise<ValidationResult<CLIConfig>> {
  try {
    const config = await loadConfig(configPath);
    return { success: true, data: config };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { success: false, errors: [error.message] };
    }

    return {
      success: false,
      errors: [
        `Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Get default configuration for initialization
 */
export function getDefaultConfig(): Partial<CLIConfig> {
  return {
    output: './src/lib/notion-schema.ts',
    databases: {
      // Will be populated during init or first pull
    },
    formatting: {
      usePrettier: true,
    },
    retry: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
  };
}

/**
 * Format configuration file content for writing
 */
export function formatConfigForWrite(config: Partial<CLIConfig>): string {
  return `import { defineConfig } from 'typed-notion-cli';

export default defineConfig(${JSON.stringify(config, null, 2)});
`;
}

/**
 * Create a minimal configuration template
 */
export function createConfigTemplate(): string {
  const template = getDefaultConfig();

  return `import { defineConfig } from 'typed-notion-cli';

export default defineConfig({
  // Output path for generated schema files
  output: '${template.output}',
  
  // Database configurations - will be populated when you run 'pull' command
  databases: {
    // Example:
    // projects: {
    //   dataSourceId: 'src_abc123def456', // Preferred for new API
    //   // databaseId: '12345678-1234-5678-9abc-123456789abc', // Legacy format
    // },
  },
  
  // Code formatting options
  formatting: {
    usePrettier: true,
    // prettierConfig: './.prettierrc', // Optional: path to Prettier config
  },
  
  // API retry configuration
  retry: {
    maxAttempts: 3,
    backoffMs: 1000, // Initial backoff in milliseconds
  },
});
`;
}
