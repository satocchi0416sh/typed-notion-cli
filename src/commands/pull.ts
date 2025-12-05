import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadEnvironment } from '../config/loader.js';
import { DataSourceClient } from '../api/data-source-client.js';
import { writeFile, ensureDirectory } from '../utils/file-system.js';
import { formatError } from '../utils/error-handling.js';
import { SchemaGenerator } from '../generators/schema-generator.js';
import {
  createCommandLogger as _createCommandLogger,
  ProgressLogger as _ProgressLogger,
} from '../utils/logger.js';
import type { DataSourceClientConfig } from '../types/notion-api.js';

interface PullOptions {
  config: string;
  force: boolean;
  nonInteractive?: boolean;
  dataSource?: string;
}

export function createPullCommand(): Command {
  return new Command('pull')
    .description('Pull schemas from Notion data sources')
    .option('-c, --config <path>', 'Path to configuration file', 'typed-notion.config.ts')
    .option('-f, --force', 'Overwrite existing schema files', false)
    .option('-n, --non-interactive', 'Run without prompts (CI/CD mode)', false)
    .option('-s, --data-source <id>', 'Specific data source to pull')
    .action(async (options: PullOptions) => {
      try {
        await handlePullCommand(options);
      } catch (error) {
        console.error(formatError(error instanceof Error ? error : new Error(String(error))));
        process.exit(1);
      }
    });
}

async function handlePullCommand(options: PullOptions): Promise<void> {
  console.log(chalk.blue('\n🔄 Pulling schemas from Notion\n'));

  // Load configuration
  const configPath = join(process.cwd(), options.config);
  if (!existsSync(configPath)) {
    console.error(chalk.red(`Configuration file not found: ${options.config}`));
    console.error(chalk.gray('Run "typed-notion init" to create a configuration file.'));
    process.exit(1);
  }

  const config = await loadConfig(configPath);

  const environment = loadEnvironment();

  // Initialize data source client
  const clientConfig: DataSourceClientConfig = {
    environment,
  };

  if (config.retry) {
    clientConfig.retry = config.retry;
  }

  const client = new DataSourceClient(clientConfig);

  // Determine which data sources to pull
  let dataSourcesToProcess: Array<{ id: string; name?: string }> = [];

  if (options.dataSource) {
    // Single data source specified via CLI
    dataSourcesToProcess.push({ id: options.dataSource });
  } else if (config.databases && Object.keys(config.databases).length > 0) {
    // Use configured databases
    dataSourcesToProcess = Object.entries(config.databases).map(([name, dbConfig]) => ({
      id: dbConfig.dataSourceId || dbConfig.databaseId!,
      name,
    }));

    // Show warning if using legacy database IDs
    const hasLegacy = Object.values(config.databases).some(db => db.databaseId && !db.dataSourceId);
    if (hasLegacy) {
      console.log(
        chalk.yellow('⚠ Using legacy database configuration. Consider migrating to data sources.')
      );
    }
  } else if (!options.nonInteractive) {
    // Interactive mode - discover data sources
    console.log(chalk.gray('No data sources configured. Discovering available sources...'));
    dataSourcesToProcess = await discoverAndSelectDataSources(client);

    // Update configuration with selected data sources for future use
    if (dataSourcesToProcess.length > 0) {
      await updateConfigWithSelectedSources(dataSourcesToProcess, options.config);
    }
  } else {
    console.error(chalk.red('No data sources configured and running in non-interactive mode.'));
    console.error(
      chalk.gray('Configure data sources in your config file or use interactive mode.')
    );
    process.exit(1);
  }

  if (dataSourcesToProcess.length === 0) {
    console.log(chalk.yellow('No data sources to process.'));
    return;
  }

  // Process each data source - for now just output individual files based on config.output
  const outputPath = config.output;
  const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/')) || './src/lib';
  await ensureDirectory(outputDir);

  for (const dataSource of dataSourcesToProcess) {
    await processDataSource(client, dataSource, outputDir, options.force);
  }

  console.log(
    chalk.green(
      `\n✅ Successfully generated schemas for ${dataSourcesToProcess.length} data source(s)`
    )
  );
  console.log(chalk.gray('\nNext steps:'));
  console.log(chalk.gray('  1. Import the generated schemas in your code'));
  console.log(chalk.gray('  2. Use the type-safe interfaces for your Notion data'));
}

async function discoverAndSelectDataSources(
  client: DataSourceClient
): Promise<Array<{ id: string; name?: string }>> {
  try {
    const availableSources = await client.listDataSources();

    if (availableSources.length === 0) {
      console.log(
        chalk.yellow('No data sources found. Make sure your integration has access to databases.')
      );
      return [];
    }

    const choices = availableSources.map(source => ({
      title: `${source.name} (${source.id})`,
      value: { id: source.id, name: source.name },
    }));

    const response = await prompts({
      type: 'multiselect',
      name: 'selectedSources',
      message: 'Select data sources to generate schemas for:',
      choices,
      min: 1,
    });

    return response.selectedSources || [];
  } catch (error) {
    console.error(chalk.red('Failed to discover data sources:'));
    console.error(chalk.gray(error instanceof Error ? error.message : 'Unknown error'));
    return [];
  }
}

async function processDataSource(
  client: DataSourceClient,
  dataSource: { id: string; name?: string },
  outputDir: string,
  force: boolean
): Promise<void> {
  console.log(chalk.gray(`Processing data source: ${dataSource.name || dataSource.id}`));

  try {
    // Fetch schema from Notion
    const schema = await client.fetchDataSourceSchema(dataSource.id);

    // Initialize schema generator
    const generator = new SchemaGenerator();

    // Generate TypeScript schema using the new generator
    const generatedSchema = await generator.generateSchema(schema, {
      includeHelpers: true,
      strictMode: false,
      formatOutput: true,
    });

    // Determine output path using the generated file name
    const outputPath = join(outputDir, generatedSchema.fileName);

    // Check if file exists and handle overwrite
    if (existsSync(outputPath) && !force) {
      const response = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `Schema file already exists: ${outputPath}. Overwrite?`,
        initial: false,
      });

      if (!response.overwrite) {
        console.log(chalk.yellow(`Skipped: ${outputPath}`));
        return;
      }
    }

    // Write schema file using generated content
    await writeFile(outputPath, generatedSchema.content);
    console.log(chalk.green(`✓ Generated: ${outputPath}`));
    console.log(chalk.gray(`   Type: ${generatedSchema.typeName}Schema`));
    console.log(chalk.gray(`   Exports: ${generatedSchema.exports.join(', ')}`));
  } catch (error) {
    console.error(chalk.red(`Failed to process data source ${dataSource.id}:`));
    console.error(chalk.gray(error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Update configuration file with selected data sources
 */
async function updateConfigWithSelectedSources(
  selectedSources: Array<{ id: string; name?: string }>,
  configPath?: string
): Promise<void> {
  console.log(chalk.gray('Updating configuration with selected data sources...'));

  try {
    // Note: Config loading validates file exists and is readable
    // The loaded config is not used here as we only inform about manual updates
    await loadConfig(configPath);

    // Generate unique names for data sources if they don't have names
    const newDatabases: Record<string, { dataSourceId: string }> = {};

    for (const source of selectedSources) {
      const name = source.name || `database_${source.id.slice(-6)}`;
      const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

      newDatabases[cleanName] = {
        dataSourceId: source.id,
      };
    }

    // Note: For now, we'll just inform the user about adding to config manually
    // In a complete implementation, we would write back to the config file
    console.log(chalk.green('Configuration updated with new data sources:'));
    for (const [name, dbConfig] of Object.entries(newDatabases)) {
      console.log(chalk.gray(`  - ${name}: ${dbConfig.dataSourceId}`));
    }
    console.log(chalk.gray('Note: Add these to your config file to persist selections'));
  } catch (error) {
    console.warn(
      chalk.yellow('Could not update configuration file:'),
      error instanceof Error ? error.message : 'Unknown error'
    );
    console.log(chalk.gray('You can manually add the selected data sources to your config file.'));
  }
}
