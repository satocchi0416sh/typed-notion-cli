import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig, loadEnvironment } from '../config/loader.js';
import { DataSourceClient } from '../api/data-source-client.js';
import { SchemaGenerator } from '../generators/schema-generator.js';
import { formatError } from '../utils/error-handling.js';
import type { DataSourceClientConfig } from '../types/notion-api.js';
import type { CLIConfig, DatabaseConfig } from '../config/validator.js';

interface ValidateOptions {
  config: string;
  schema?: string;
  fix: boolean;
}

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate local schemas against current Notion database structures')
    .option('-c, --config <path>', 'Path to configuration file', 'typed-notion.config.ts')
    .option('-s, --schema <path>', 'Path to specific schema file to validate')
    .option('--fix', 'Automatically update schemas that are out of sync', false)
    .action(async (options: ValidateOptions) => {
      try {
        await validateSchemas(options);
      } catch (error) {
        console.error(chalk.red('Failed to validate schemas:'));
        console.error(formatError(error instanceof Error ? error : new Error(String(error))));
        process.exit(1);
      }
    });
}

async function validateSchemas(options: ValidateOptions): Promise<void> {
  console.log(chalk.blue('🔍 Validating schemas against Notion data sources...'));

  // Load configuration and environment
  const config = await loadConfig(options.config);
  const environment = loadEnvironment();

  // Setup API client
  const clientConfig: DataSourceClientConfig = {
    environment,
  };

  const client = new DataSourceClient(clientConfig);
  const generator = new SchemaGenerator();

  // Determine which schemas to validate
  const schemasToValidate = options.schema
    ? [{ path: options.schema, name: 'custom' }]
    : getConfiguredSchemas(config);

  if (schemasToValidate.length === 0) {
    console.log(chalk.yellow('No schemas found to validate.'));
    console.log(chalk.gray('Configure data sources in your config file.'));
    return;
  }

  let hasErrors = false;
  const results: Array<{ name: string; status: 'valid' | 'invalid' | 'error'; issues?: string[] }> =
    [];

  for (const schemaInfo of schemasToValidate) {
    console.log(chalk.gray(`Validating ${schemaInfo.name}...`));

    try {
      const validation = await validateSingleSchema(
        client,
        generator,
        schemaInfo,
        config,
        options.fix
      );

      results.push(validation);

      if (validation.status === 'invalid') {
        hasErrors = true;
        console.log(chalk.red(`✗ ${schemaInfo.name}: Schema out of sync`));
        if (validation.issues) {
          for (const issue of validation.issues) {
            console.log(chalk.gray(`  - ${issue}`));
          }
        }
      } else if (validation.status === 'valid') {
        console.log(chalk.green(`✓ ${schemaInfo.name}: Schema is up to date`));
      }
    } catch (error) {
      hasErrors = true;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        name: schemaInfo.name,
        status: 'error',
        issues: [errorMessage],
      });
      console.log(chalk.red(`✗ ${schemaInfo.name}: Validation error`));
      console.log(chalk.gray(`  - ${errorMessage}`));
    }
  }

  // Summary report
  console.log(''); // Empty line
  console.log(chalk.bold('Validation Summary:'));

  const valid = results.filter(r => r.status === 'valid').length;
  const invalid = results.filter(r => r.status === 'invalid').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(chalk.green(`✓ Valid: ${valid}`));
  if (invalid > 0) console.log(chalk.red(`✗ Out of sync: ${invalid}`));
  if (errors > 0) console.log(chalk.red(`⚠ Errors: ${errors}`));

  // Provide resolution suggestions
  if (hasErrors) {
    console.log(''); // Empty line
    console.log(chalk.yellow('Resolution suggestions:'));
    console.log(chalk.gray('  • Run "typed-notion pull" to update schemas'));
    console.log(chalk.gray('  • Use --fix flag to automatically update schemas'));
    console.log(chalk.gray('  • Check your Notion integration permissions'));

    process.exit(1);
  } else {
    console.log(chalk.green('\n🎉 All schemas are valid!'));
  }
}

async function validateSingleSchema(
  client: DataSourceClient,
  generator: SchemaGenerator,
  schemaInfo: { path?: string; name: string; dataSourceId?: string },
  config: CLIConfig,
  autoFix: boolean
): Promise<{ name: string; status: 'valid' | 'invalid' | 'error'; issues?: string[] }> {
  const issues: string[] = [];

  try {
    // Get the data source ID from config or schema info
    const dataSourceId =
      schemaInfo.dataSourceId || findDataSourceIdForSchema(config, schemaInfo.name);

    if (!dataSourceId) {
      return {
        name: schemaInfo.name,
        status: 'error',
        issues: ['Data source ID not found in configuration'],
      };
    }

    // Fetch current schema from Notion
    const currentSchema = await client.fetchDataSourceSchema(dataSourceId);

    // Generate what the schema should look like
    const expectedSchema = await generator.generateSchema(currentSchema, {
      includeHelpers: true,
      strictMode: false,
      formatOutput: true,
    });

    // Check if local schema file exists
    const localSchemaPath = schemaInfo.path || getSchemaPathForDataSource(config, schemaInfo.name);

    if (!localSchemaPath || !existsSync(localSchemaPath)) {
      issues.push('Local schema file does not exist');

      if (autoFix && localSchemaPath) {
        // Auto-create missing schema file
        const { writeFile, ensureDirectory } = await import('../utils/file-system.js');
        await ensureDirectory(dirname(localSchemaPath));
        await writeFile(localSchemaPath, expectedSchema.content);
        console.log(chalk.yellow(`  → Created missing schema file: ${localSchemaPath}`));
        return { name: schemaInfo.name, status: 'valid' };
      }

      return { name: schemaInfo.name, status: 'invalid', issues };
    }

    // Compare local schema with expected schema
    const { readFile } = await import('node:fs/promises');
    const localContent = await readFile(localSchemaPath, 'utf-8');

    // Simple content comparison (could be enhanced with AST comparison)
    const differences = compareSchemaContent(localContent, expectedSchema.content);

    if (differences.length > 0) {
      issues.push(...differences);

      if (autoFix) {
        // Auto-update schema file
        const { writeFile } = await import('../utils/file-system.js');
        await writeFile(localSchemaPath, expectedSchema.content);
        console.log(chalk.yellow(`  → Updated schema file: ${localSchemaPath}`));
        return { name: schemaInfo.name, status: 'valid' };
      }

      return { name: schemaInfo.name, status: 'invalid', issues };
    }

    return { name: schemaInfo.name, status: 'valid' };
  } catch (error) {
    return {
      name: schemaInfo.name,
      status: 'error',
      issues: [error instanceof Error ? error.message : 'Unknown validation error'],
    };
  }
}

function getConfiguredSchemas(
  config: CLIConfig
): Array<{ name: string; dataSourceId: string; path?: string }> {
  if (!config.databases) return [];

  return Object.entries(config.databases)
    .map(([name, dbConfig]: [string, DatabaseConfig]) => {
      const dataSourceId = dbConfig.dataSourceId || dbConfig.databaseId;
      if (!dataSourceId) return null;

      const path = getSchemaPathForDataSource(config, name);
      return {
        name,
        dataSourceId,
        ...(path && { path }),
      };
    })
    .filter(
      (schema): schema is { name: string; dataSourceId: string; path?: string } => schema !== null
    );
}

function findDataSourceIdForSchema(config: CLIConfig, schemaName: string): string | undefined {
  if (!config.databases || !config.databases[schemaName]) return undefined;

  const dbConfig: DatabaseConfig = config.databases[schemaName];
  return dbConfig.dataSourceId || dbConfig.databaseId;
}

function getSchemaPathForDataSource(config: CLIConfig, schemaName: string): string | undefined {
  if (!config.output) return undefined;

  // Generate path based on schema name and output directory
  const outputDir = dirname(config.output);
  const fileName = `${schemaName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ts`;

  return join(outputDir, fileName);
}

function compareSchemaContent(local: string, expected: string): string[] {
  const differences: string[] = [];

  // Remove timestamps and generation comments for comparison
  const normalizeContent = (content: string) => {
    return content
      .replace(/\* Generated on:.*\n/g, '')
      .replace(/\* Generated:.*\n/g, '')
      .replace(/\/\/ Generated.*\n/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedLocal = normalizeContent(local);
  const normalizedExpected = normalizeContent(expected);

  if (normalizedLocal !== normalizedExpected) {
    differences.push('Schema structure differs from current Notion database');

    // Try to identify specific differences
    if (!local.includes('export interface')) {
      differences.push('Missing interface definition');
    }

    if (local.includes('unknown') !== expected.includes('unknown')) {
      differences.push('Formula type mappings have changed');
    }
  }

  return differences;
}
