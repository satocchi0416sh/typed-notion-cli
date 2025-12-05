/**
 * Code Formatter
 * Formats generated TypeScript code using Prettier
 */

import { format } from 'prettier';
import { NotionAPIError } from '../utils/error-handling.js';

export interface CodeFormatterOptions {
  /**
   * Whether to format TypeScript code
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom Prettier options (overrides defaults)
   */
  prettierOptions?: Record<string, unknown>;
}

export interface FormattingResult {
  formatted: string;
  changed: boolean;
  error?: string;
}

export class CodeFormatter {
  private readonly options: CodeFormatterOptions;
  private readonly defaultPrettierConfig: Record<string, unknown>;

  constructor(options: CodeFormatterOptions = {}) {
    this.options = {
      enabled: true,
      ...options,
    };

    // Default Prettier configuration for generated TypeScript files
    this.defaultPrettierConfig = {
      parser: 'typescript',
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      quoteProps: 'as-needed',
      trailingComma: 'es5',
      bracketSpacing: true,
      bracketSameLine: false,
      arrowParens: 'avoid',
      endOfLine: 'lf',
      ...this.options.prettierOptions,
    };
  }

  /**
   * Format TypeScript code with Prettier
   */
  async formatTypeScript(code: string): Promise<string> {
    if (!this.options.enabled) {
      return code;
    }

    try {
      const formatted = await format(code, this.defaultPrettierConfig);
      return formatted;
    } catch (error) {
      throw new NotionAPIError(
        'Failed to format TypeScript code',
        'Check the generated code syntax and Prettier configuration',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Format code and return detailed result
   */
  async formatWithResult(code: string): Promise<FormattingResult> {
    if (!this.options.enabled) {
      return {
        formatted: code,
        changed: false,
      };
    }

    try {
      const formatted = await format(code, this.defaultPrettierConfig);
      return {
        formatted,
        changed: formatted !== code,
      };
    } catch (error) {
      return {
        formatted: code,
        changed: false,
        error: error instanceof Error ? error.message : 'Unknown formatting error',
      };
    }
  }

  /**
   * Format multiple code snippets in batch
   */
  async formatBatch(codeSnippets: string[]): Promise<string[]> {
    const results = await Promise.allSettled(codeSnippets.map(code => this.formatTypeScript(code)));

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Return original code if formatting fails
        // Note: Using console.warn for development debugging
        // eslint-disable-next-line no-console
        console.warn(`Failed to format code snippet ${index + 1}:`, result.reason);
        return codeSnippets[index] || '';
      }
    });
  }

  /**
   * Validate code syntax without formatting
   */
  async validateSyntax(code: string): Promise<boolean> {
    try {
      await format(code, {
        ...this.defaultPrettierConfig,
        parser: 'typescript',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format and validate generated schema content
   */
  async formatSchema(schemaContent: string): Promise<string> {
    try {
      // First validate the syntax
      const isValid = await this.validateSyntax(schemaContent);
      if (!isValid) {
        throw new Error('Generated schema has invalid TypeScript syntax');
      }

      // Then format the code
      return await this.formatTypeScript(schemaContent);
    } catch (error) {
      throw new NotionAPIError(
        'Failed to format generated schema',
        'The generated TypeScript code may have syntax errors',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a new formatter with different options
   */
  withOptions(options: CodeFormatterOptions): CodeFormatter {
    return new CodeFormatter({
      ...this.options,
      ...options,
      prettierOptions: {
        ...this.options.prettierOptions,
        ...options.prettierOptions,
      },
    });
  }

  /**
   * Get current Prettier configuration
   */
  getPrettierConfig(): Record<string, unknown> {
    return { ...this.defaultPrettierConfig };
  }

  /**
   * Check if formatting is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled === true;
  }

  /**
   * Format interface definition with proper indentation
   */
  async formatInterface(interfaceCode: string): Promise<string> {
    const wrappedCode = `// Temporary wrapper for formatting\n${interfaceCode}`;
    const formatted = await this.formatTypeScript(wrappedCode);

    // Remove the wrapper comment and normalize line endings
    return formatted.replace('// Temporary wrapper for formatting\n', '').trim();
  }

  /**
   * Format function definition with proper indentation
   */
  async formatFunction(functionCode: string): Promise<string> {
    const wrappedCode = `// Temporary wrapper for formatting\n${functionCode}`;
    const formatted = await this.formatTypeScript(wrappedCode);

    // Remove the wrapper comment and normalize line endings
    return formatted.replace('// Temporary wrapper for formatting\n', '').trim();
  }

  /**
   * Format import statements
   */
  async formatImports(importStatements: string[]): Promise<string> {
    const combinedImports = importStatements.join('\n');
    return await this.formatTypeScript(combinedImports);
  }
}
