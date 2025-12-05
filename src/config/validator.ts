import { z } from 'zod';

/**
 * Database configuration schema
 */
export const DatabaseConfigSchema = z
  .object({
    dataSourceId: z
      .string()
      .regex(/^src_[a-zA-Z0-9]+$/, 'Data source ID must match format: src_*')
      .optional(),
    databaseId: z
      .string()
      .regex(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
        'Database ID must be a valid UUID'
      )
      .optional(),
  })
  .refine(data => data.dataSourceId || data.databaseId, {
    message: 'Either dataSourceId or databaseId must be provided',
    path: ['dataSourceId'],
  });

/**
 * Formatting configuration schema
 */
export const FormattingConfigSchema = z.object({
  usePrettier: z.boolean().default(true),
  prettierConfig: z.string().optional(),
});

/**
 * Retry configuration schema
 */
export const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10).default(3),
  backoffMs: z.number().min(100).max(10000).default(1000),
});

/**
 * Main CLI configuration schema
 */
export const CLIConfigSchema = z.object({
  output: z
    .string()
    .min(1, 'Output path cannot be empty')
    .refine(path => path.endsWith('.ts'), 'Output path must be a TypeScript file (.ts extension)')
    .default('./src/lib/notion-schema.ts'),

  databases: z
    .record(z.string(), DatabaseConfigSchema)
    .refine(
      databases => Object.keys(databases).length > 0,
      'At least one database configuration is required'
    ),

  formatting: FormattingConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
});

/**
 * Environment configuration schema
 */
export const EnvironmentConfigSchema = z.object({
  NOTION_TOKEN: z
    .string()
    .min(1, 'Notion token cannot be empty')
    .startsWith('secret_', 'Notion token must start with "secret_"'),

  NOTION_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'API version must be in YYYY-MM-DD format')
    .default('2025-09-03'),
});

/**
 * TypeScript type definitions for configuration
 */
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type FormattingConfig = z.infer<typeof FormattingConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type CLIConfig = z.infer<typeof CLIConfigSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate CLI configuration
 */
export function validateConfig(config: unknown): ValidationResult<CLIConfig> {
  try {
    const validated = CLIConfigSchema.parse(config);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => {
        const path = err.path.join('.');
        let message = err.message;

        // Enhance error messages with specific guidance
        if (path === 'output') {
          message += '. Example: "./src/lib/notion-schema.ts"';
        } else if (path.startsWith('databases')) {
          message += '. Check your database configuration format';
        } else if (path.includes('dataSourceId')) {
          message += '. Format should be "src_xxxxx" (get from Notion integration)';
        } else if (path.includes('databaseId')) {
          message += '. Format should be a UUID (legacy format - consider using dataSourceId)';
        }

        return `${path}: ${message}`;
      });
      return { success: false, errors };
    }

    return {
      success: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Validate environment configuration
 */
export function validateEnvironment(env: unknown): ValidationResult<EnvironmentConfig> {
  try {
    const validated = EnvironmentConfigSchema.parse(env);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      return { success: false, errors };
    }

    return {
      success: false,
      errors: [
        `Environment validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Check if configuration is using legacy database ID format
 */
export function hasLegacyConfiguration(config: CLIConfig): boolean {
  return Object.values(config.databases).some(
    dbConfig => dbConfig.databaseId && !dbConfig.dataSourceId
  );
}

/**
 * Get databases that need migration from legacy format
 */
export function getLegacyDatabases(config: CLIConfig): Array<[string, DatabaseConfig]> {
  return Object.entries(config.databases).filter(
    ([, dbConfig]) => dbConfig.databaseId && !dbConfig.dataSourceId
  );
}

/**
 * Validate file path is within project bounds
 */
export function validateOutputPath(
  outputPath: string,
  projectRoot: string
): ValidationResult<string> {
  const normalizedOutput = outputPath.replace(/\\/g, '/');
  const normalizedRoot = projectRoot.replace(/\\/g, '/');

  // Check for directory traversal
  if (normalizedOutput.includes('..')) {
    return {
      success: false,
      errors: ['Output path cannot contain directory traversal (..)'],
    };
  }

  // Check if path is within project
  if (!normalizedOutput.startsWith('/') && !normalizedOutput.startsWith(normalizedRoot)) {
    // Relative path is okay
    return { success: true, data: normalizedOutput };
  }

  if (normalizedOutput.startsWith(normalizedRoot)) {
    return { success: true, data: normalizedOutput };
  }

  return {
    success: false,
    errors: ['Output path must be within project directory'],
  };
}
