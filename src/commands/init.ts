import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NotionClientWrapper } from '../api/notion-client.js';
import { DataSourceClient } from '../api/data-source-client.js';
import { writeConfigFile, writeEnvFile, writeGitignoreFile } from '../utils/file-system.js';
import {
  generateConfigTemplate,
  generateEnvTemplate,
  generateGitignoreTemplate,
} from '../templates/index.js';
import { ConfigurationError, formatError } from '../utils/error-handling.js';
import type { EnvironmentConfig } from '../config/validator.js';

interface InitOptions {
  token?: string;
  dataSource?: string;
  database?: string;
  force?: boolean;
  minimal?: boolean;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new Typed Notion project')
    .option('-t, --token <token>', 'Notion integration token')
    .option('-s, --data-source <id>', 'Data source ID (2025-09-03 format: src_xxx)')
    .option('-d, --database <id>', 'Database ID (legacy format)')
    .option('-f, --force', 'Overwrite existing configuration', false)
    .option('-m, --minimal', 'Create minimal configuration without prompts', false)
    .action(async (options: InitOptions) => {
      try {
        await handleInitCommand(options);
      } catch (error) {
        console.error(formatError(error instanceof Error ? error : new Error(String(error))));
        process.exit(1);
      }
    });
}

async function handleInitCommand(options: InitOptions): Promise<void> {
  console.log(chalk.blue('\n🚀 Initializing Typed Notion CLI\n'));

  // Check for existing configuration
  const configPath = join(process.cwd(), 'typed-notion.config.ts');
  // const envPath = join(process.cwd(), '.env');

  if (!options.force) {
    if (existsSync(configPath)) {
      throw new ConfigurationError(
        'Configuration file already exists',
        'Use --force to overwrite or run from a different directory'
      );
    }
  }

  // Minimal setup - just create basic files
  if (options.minimal) {
    await createMinimalSetup(options);
    return;
  }

  // Interactive setup
  const config = await promptForConfiguration(options);

  // Validate Notion access if token provided
  if (config.token) {
    await validateNotionAccess(config);
  }

  // Generate and write files
  await generateProjectFiles(config);

  console.log(chalk.green('\n✅ Typed Notion CLI initialized successfully!\n'));
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray('  1. Set your NOTION_TOKEN in .env'));
  console.log(chalk.gray('  2. Run: typed-notion pull'));
  console.log(chalk.gray('  3. Import generated types in your code'));
}

interface ProjectConfig {
  token?: string | undefined;
  dataSourceId?: string | undefined;
  databaseId?: string | undefined;
  projectName: string;
  createEnv: boolean;
  createGitignore: boolean;
}

async function promptForConfiguration(options: InitOptions): Promise<ProjectConfig> {
  const questions: prompts.PromptObject[] = [];

  // Project name
  questions.push({
    type: 'text',
    name: 'projectName',
    message: 'Project name:',
    initial: 'my-notion-project',
  });

  // Notion token
  if (!options.token) {
    questions.push({
      type: 'password',
      name: 'token',
      message: 'Notion integration token (optional, press Enter to skip):',
    });
  }

  // Data source selection
  questions.push({
    type: 'select',
    name: 'sourceType',
    message: 'How do you want to configure your data source?',
    choices: [
      { title: 'Data Source ID (2025-09-03 API)', value: 'dataSource' },
      { title: 'Database ID (Legacy)', value: 'database' },
      { title: 'Browse available sources', value: 'browse' },
      { title: 'Skip for now', value: 'skip' },
    ],
  });

  // Environment file
  questions.push({
    type: 'confirm',
    name: 'createEnv',
    message: 'Create .env file?',
    initial: true,
  });

  // Gitignore file
  questions.push({
    type: 'confirm',
    name: 'createGitignore',
    message: 'Create/update .gitignore?',
    initial: true,
  });

  const answers = await prompts(questions);

  // Handle data source selection
  let dataSourceId: string | undefined;
  let databaseId: string | undefined;

  if (answers.sourceType === 'dataSource') {
    const sourceAnswer = await prompts({
      type: 'text',
      name: 'dataSourceId',
      message: 'Enter Data Source ID (format: src_xxx):',
      validate: (value: string) => {
        if (!value) return 'Data Source ID is required';
        if (!value.startsWith('src_')) return 'Data Source ID must start with "src_"';
        return true;
      },
    });
    dataSourceId = sourceAnswer.dataSourceId;
  } else if (answers.sourceType === 'database') {
    const dbAnswer = await prompts({
      type: 'text',
      name: 'databaseId',
      message: 'Enter Database ID:',
      validate: (value: string) => {
        if (!value) return 'Database ID is required';
        return true;
      },
    });
    databaseId = dbAnswer.databaseId;
  } else if (answers.sourceType === 'browse' && (answers.token || options.token)) {
    const selected = await browseDataSources(answers.token || options.token);
    if (selected) {
      dataSourceId = selected;
    }
  }

  return {
    token: options.token || answers.token,
    dataSourceId: options.dataSource || dataSourceId,
    databaseId: options.database || databaseId,
    projectName: answers.projectName,
    createEnv: answers.createEnv,
    createGitignore: answers.createGitignore,
  };
}

async function browseDataSources(token: string): Promise<string | undefined> {
  console.log(chalk.gray('\nFetching available data sources...'));

  const client = new DataSourceClient({
    environment: {
      NOTION_TOKEN: token,
      NOTION_API_VERSION: '2022-06-28',
    },
  });

  try {
    const sources = await client.listDataSources();

    if (sources.length === 0) {
      console.log(
        chalk.yellow('No data sources found. Make sure your integration has access to databases.')
      );
      return undefined;
    }

    const answer = await prompts({
      type: 'select',
      name: 'dataSourceId',
      message: 'Select a data source:',
      choices: sources.map(source => ({
        title: `${source.name} (${source.id})`,
        value: source.id,
      })),
    });

    return answer.dataSourceId;
  } catch (error) {
    console.log(
      chalk.yellow(
        'Failed to fetch data sources:',
        error instanceof Error ? error.message : 'Unknown error'
      )
    );
    return undefined;
  }
}

async function validateNotionAccess(config: ProjectConfig): Promise<void> {
  if (!config.token) return;

  console.log(chalk.gray('\nValidating Notion access...'));

  const environment: EnvironmentConfig = {
    NOTION_TOKEN: config.token,
    NOTION_API_VERSION: '2022-06-28',
  };

  const client = new NotionClientWrapper({ environment });

  try {
    await client.validateAccess();
    console.log(chalk.green('✓ Notion access validated'));

    // Validate specific data source/database if provided
    if (config.dataSourceId || config.databaseId) {
      const sourceClient = new DataSourceClient({ environment });

      if (config.dataSourceId) {
        const hasAccess = await sourceClient.validateDataSourceAccess(config.dataSourceId);
        if (!hasAccess) {
          console.log(chalk.yellow(`⚠ Cannot access data source: ${config.dataSourceId}`));
        } else {
          console.log(chalk.green(`✓ Data source access confirmed: ${config.dataSourceId}`));
        }
      }

      if (config.databaseId) {
        const hasAccess = await sourceClient.validateDatabaseAccess(config.databaseId);
        if (!hasAccess) {
          console.log(chalk.yellow(`⚠ Cannot access database: ${config.databaseId}`));
        } else {
          console.log(chalk.green(`✓ Database access confirmed: ${config.databaseId}`));
        }
      }
    }
  } catch (error) {
    console.log(chalk.yellow('⚠ Failed to validate Notion access:'));
    console.log(chalk.gray(error instanceof Error ? error.message : 'Unknown error'));
  }
}

async function generateProjectFiles(config: ProjectConfig): Promise<void> {
  console.log(chalk.gray('\nGenerating project files...'));

  // Generate configuration file
  const configContent = generateConfigTemplate({
    projectName: config.projectName,
    dataSourceId: config.dataSourceId,
    databaseId: config.databaseId,
    notionToken: config.token,
  });

  await writeConfigFile('typed-notion.config.ts', configContent);
  console.log(chalk.green('✓ Created typed-notion.config.ts'));

  // Generate .env file if requested
  if (config.createEnv) {
    const envContent = generateEnvTemplate(config.token);
    await writeEnvFile('.env', envContent);
    console.log(chalk.green('✓ Created .env'));
  }

  // Generate/update .gitignore if requested
  if (config.createGitignore) {
    const gitignoreContent = generateGitignoreTemplate();
    await writeGitignoreFile('.gitignore', gitignoreContent);
    console.log(chalk.green('✓ Updated .gitignore'));
  }
}

async function createMinimalSetup(options: InitOptions): Promise<void> {
  console.log(chalk.gray('Creating minimal configuration...'));

  // Generate minimal config
  const configContent = generateConfigTemplate({
    dataSourceId: options.dataSource,
    databaseId: options.database,
    notionToken: options.token,
  });

  await writeConfigFile('typed-notion.config.ts', configContent);
  console.log(chalk.green('✓ Created typed-notion.config.ts'));

  // Always create .env in minimal mode
  const envContent = generateEnvTemplate(options.token);
  await writeEnvFile('.env', envContent);
  console.log(chalk.green('✓ Created .env'));

  console.log(chalk.green('\n✅ Minimal setup complete!'));
  console.log(chalk.gray('\nEdit typed-notion.config.ts to customize your configuration.'));
}
