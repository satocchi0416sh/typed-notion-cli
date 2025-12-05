#!/usr/bin/env node

import { Command } from 'commander';
import { setTimeout } from 'node:timers';
import { createInitCommand } from './commands/init.js';
import { createPullCommand } from './commands/pull.js';
import { createValidateCommand } from './commands/validate.js';
import { CLIError } from './utils/error-handling.js';

// ANSI escape codes for terminal styling
const style = {
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Effects
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',

  // Reset
  reset: '\x1b[0m',

  // Cursor control
  clear: '\x1b[2J\x1b[0;0H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',

  // Movement
  up: (n: number) => `\x1b[${n}A`,
  down: (n: number) => `\x1b[${n}B`,
  left: (n: number) => `\x1b[${n}D`,
  right: (n: number) => `\x1b[${n}C`,
};

// Check if colors should be disabled
const NO_COLOR = process.env.NO_COLOR === '1' || !process.stdout.isTTY;

// Style wrapper function that respects NO_COLOR
function stylize(text: string, ...codes: string[]): string {
  if (NO_COLOR) return text;
  return codes.join('') + text + style.reset;
}

// Utility functions for styled output
const colors = {
  error: (text: string) => stylize(text, style.red, style.bold),
  success: (text: string) => stylize(text, style.green, style.bold),
  warning: (text: string) => stylize(text, style.yellow, style.bold),
  info: (text: string) => stylize(text, style.blue),
  dim: (text: string) => stylize(text, style.gray),
  accent: (text: string) => stylize(text, style.cyan, style.bold),
  highlight: (text: string) => stylize(text, style.magenta, style.bold),
};

// Boot sequence animation
async function bootSequence(): Promise<void> {
  if (NO_COLOR) return; // Skip animations if colors disabled

  const frames = ['▰▱▱▱▱', '▰▰▱▱▱', '▰▰▰▱▱', '▰▰▰▰▱', '▰▰▰▰▰'];

  process.stdout.write(style.hideCursor);
  process.stdout.write(colors.dim('Initializing TYPED-NOTION CLI '));

  for (let i = 0; i < frames.length; i++) {
    process.stdout.write(colors.accent(frames[i]!));
    await new Promise(resolve => setTimeout(resolve, 200));
    if (i < frames.length - 1) {
      process.stdout.write('\b'.repeat(5));
    }
  }

  process.stdout.write(` ${colors.success('✓')}\n`);
  process.stdout.write(style.showCursor);
}

// Enhanced banner with ANSI styling
function createBanner(): string {
  if (NO_COLOR) {
    return `
█████████████████████████████████████████████████████████████
█                                                           █
█                    TYPED NOTION CLI                       █
█     Type-Safe Schema Generation for Notion Databases      █
█                                                           █
█████████████████████████████████████████████████████████████
  `;
  }

  const borderLine = stylize(
    '█████████████████████████████████████████████████████████████',
    style.cyan,
    style.bold
  );
  const emptyLine = stylize(
    '█                                                           █',
    style.cyan,
    style.bold
  );

  const titleLine = [
    stylize('█                    ', style.cyan, style.bold),
    stylize('TYPED NOTION CLI', style.white, style.bold, style.underline),
    stylize('                       █', style.cyan, style.bold),
  ].join('');

  const subtitleLine = [
    stylize('█     ', style.cyan, style.bold),
    stylize('Type-Safe Schema Generation for Notion Databases', style.green, style.italic),
    stylize('      █', style.cyan, style.bold),
  ].join('');

  return ['', borderLine, emptyLine, titleLine, subtitleLine, emptyLine, borderLine, ''].join('\n');
}

// Enhanced examples with styling
function createExamples(): string {
  const exampleCommands = [
    ['$ typed-notion init', '# Initialize a new project'],
    ['$ typed-notion pull', '# Generate schemas from Notion'],
    ['$ typed-notion validate', '# Validate existing schemas'],
    ['$ typed-notion pull --force', '# Overwrite existing schemas'],
    ['$ typed-notion validate --fix', '# Auto-fix schema differences'],
  ];

  const envVars = [
    ['NOTION_TOKEN', 'Your Notion integration token (required)'],
    ['LOG_LEVEL', 'Logging level (debug|info|warn|error)'],
    ['ENABLE_FILE_LOGGING', 'Enable file logging (true|false)'],
  ];

  const examples = [
    '',
    colors.highlight('Examples:'),
    ...exampleCommands.map(
      ([cmd, desc]) =>
        `  ${colors.accent(cmd!)}${' '.repeat(Math.max(2, 30 - cmd!.length))}${colors.dim(desc!)}`
    ),
    '',
    colors.highlight('Environment Variables:'),
    ...envVars.map(
      ([name, desc]) =>
        `  ${colors.info(name!)}${' '.repeat(Math.max(2, 20 - name!.length))}${colors.dim(desc!)}`
    ),
    '',
    colors.highlight('Documentation:'),
    `  ${stylize('https://github.com/your-org/typed-notion-cli', style.underline, style.blue)}`,
    '',
  ];

  return examples.join('\n');
}

const program = new Command();

program
  .name('typed-notion')
  .description('CLI tool for generating type-safe TypeScript schemas from Notion data sources')
  .version('0.1.0')
  .usage('[command] [options]')
  .helpOption('-h, --help', 'Display help for command')
  .addHelpText('before', createBanner())
  .addHelpText('after', createExamples());

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createPullCommand());
program.addCommand(createValidateCommand());

// Global error handler
program.exitOverride(err => {
  if (err instanceof CLIError) {
    // eslint-disable-next-line no-console
    console.error(colors.error(`Error: ${err.message}`));
    if (err.suggestion) {
      // eslint-disable-next-line no-console
      console.error(colors.warning(`Suggestion: ${err.suggestion}`));
    }
    process.exit(err.exitCode);
  }
  throw err;
});

// Initialize CLI with boot sequence
async function initializeCLI(): Promise<void> {
  // Show boot sequence for a cool hacker-style experience
  await bootSequence();

  // Parse command line arguments
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CLIError) {
      // eslint-disable-next-line no-console
      console.error(colors.error(`Error: ${error.message}`));
      if (error.suggestion) {
        // eslint-disable-next-line no-console
        console.error(colors.warning(`Suggestion: ${error.suggestion}`));
      }
      process.exit(error.exitCode);
    } else {
      // eslint-disable-next-line no-console
      console.error(colors.error('Unexpected error:'), error);
      process.exit(1);
    }
  }
}

// Start the CLI
initializeCLI().catch(error => {
  // eslint-disable-next-line no-console
  console.error(colors.error('Failed to initialize CLI:'), error);
  process.exit(1);
});
