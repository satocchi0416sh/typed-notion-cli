/**
 * Schema Generator Core Engine
 * Generates TypeScript schema definitions from Notion data source structures
 */

import type { DataSourceSchema, DataSourceProperty } from '../api/data-source-client.js';
import { TypeMapper } from './type-mapper.js';
import { CodeFormatter } from './code-formatter.js';
import { NotionAPIError } from '../utils/error-handling.js';
import { timeFunction } from '../utils/performance.js';

export interface GeneratedSchema {
  fileName: string;
  content: string;
  typeName: string;
  exports: string[];
}

export interface SchemaGeneratorOptions {
  /**
   * Whether to include helper functions in generated schema
   * @default true
   */
  includeHelpers?: boolean;

  /**
   * Whether to generate strict types (no nullable properties)
   * @default false
   */
  strictMode?: boolean;

  /**
   * Custom type mappings for specific property names
   */
  typeOverrides?: Record<string, string>;

  /**
   * Whether to format output with Prettier
   * @default true
   */
  formatOutput?: boolean;
}

export class SchemaGenerator {
  private readonly typeMapper: TypeMapper;
  private readonly codeFormatter: CodeFormatter;

  constructor() {
    this.typeMapper = new TypeMapper();
    this.codeFormatter = new CodeFormatter();
  }

  /**
   * Generate TypeScript schema from Notion data source
   */
  async generateSchema(
    dataSourceSchema: DataSourceSchema,
    options: SchemaGeneratorOptions = {}
  ): Promise<GeneratedSchema> {
    const { result } = await timeFunction(
      `schema-generation-${dataSourceSchema.name}`,
      async () => {
        return await this._generateSchemaInternal(dataSourceSchema, options);
      }
    );

    return result;
  }

  /**
   * Internal implementation of schema generation (for performance tracking)
   */
  private async _generateSchemaInternal(
    dataSourceSchema: DataSourceSchema,
    options: SchemaGeneratorOptions = {}
  ): Promise<GeneratedSchema> {
    const {
      includeHelpers = true,
      strictMode = false,
      typeOverrides = {},
      formatOutput = true,
    } = options;

    try {
      // Generate base type name from schema name
      const typeName = this.generateTypeName(dataSourceSchema.name);
      const fileName = this.generateFileName(dataSourceSchema.name);

      // Generate property types
      const properties = await this.generateProperties(dataSourceSchema.properties, {
        strictMode,
        typeOverrides,
      });

      // Generate type safety report for validation
      const typeSafetyReport = this.typeMapper.generateTypeSafetyReport(properties);

      // Log type safety warnings if any
      if (typeSafetyReport.warnings.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`Type safety warnings for ${dataSourceSchema.name}:`);
        for (const warning of typeSafetyReport.warnings) {
          // eslint-disable-next-line no-console
          console.warn(`  - ${warning}`);
        }
      }

      // Generate complete schema content
      const content = this.generateSchemaContent({
        typeName,
        properties,
        dataSourceSchema,
        includeHelpers,
        strictMode,
      });

      // Format output if requested
      const formattedContent = formatOutput
        ? await this.codeFormatter.formatTypeScript(content)
        : content;

      return {
        fileName,
        content: formattedContent,
        typeName,
        exports: this.generateExports(typeName, includeHelpers),
      };
    } catch (error) {
      throw new NotionAPIError(
        `Failed to generate schema for ${dataSourceSchema.name}`,
        'Check the data source structure and property types',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generate multiple schemas in batch
   */
  async generateMultipleSchemas(
    dataSourceSchemas: DataSourceSchema[],
    options: SchemaGeneratorOptions = {}
  ): Promise<GeneratedSchema[]> {
    const results: GeneratedSchema[] = [];

    for (const schema of dataSourceSchemas) {
      try {
        const generated = await this.generateSchema(schema, options);
        results.push(generated);
      } catch (error) {
        // Continue with other schemas but log the error
        // Note: Using console.warn for development debugging
        // eslint-disable-next-line no-console
        console.warn(`Failed to generate schema for ${schema.name}:`, error);
      }
    }

    return results;
  }

  /**
   * Generate properties for the schema interface
   */
  private async generateProperties(
    properties: Record<string, DataSourceProperty>,
    options: { strictMode: boolean; typeOverrides: Record<string, string> }
  ): Promise<Array<{ name: string; type: string; optional: boolean; comment?: string }>> {
    const result = [];

    for (const [propName, property] of Object.entries(properties)) {
      // Check for type override first
      if (options.typeOverrides[propName]) {
        result.push({
          name: propName,
          type: options.typeOverrides[propName],
          optional: !options.strictMode && property.type !== 'title',
          comment: `Custom type override: ${property.type}`,
        });
        continue;
      }

      // Generate type using type mapper
      const typeInfo = await this.typeMapper.mapPropertyType(property);

      const propertyData: { name: string; type: string; optional: boolean; comment?: string } = {
        name: propName,
        type: typeInfo.typeDefinition,
        optional: !options.strictMode && !typeInfo.required,
      };

      if (typeInfo.comment) {
        propertyData.comment = typeInfo.comment;
      }

      result.push(propertyData);
    }

    return result;
  }

  /**
   * Generate complete schema content
   */
  private generateSchemaContent(params: {
    typeName: string;
    properties: Array<{ name: string; type: string; optional: boolean; comment?: string }>;
    dataSourceSchema: DataSourceSchema;
    includeHelpers: boolean;
    strictMode: boolean;
  }): string {
    const { typeName, properties, dataSourceSchema, includeHelpers, strictMode } = params;

    const imports = this.generateImports(includeHelpers);
    const interfaceDefinition = this.generateInterface(typeName, properties, strictMode);
    const typeGuards = includeHelpers ? this.generateTypeGuards(typeName, properties) : '';
    const helpers = includeHelpers ? this.generateHelpers(typeName) : '';
    const metadata = this.generateMetadata(dataSourceSchema);

    return `${imports}
${metadata}
${interfaceDefinition}
${typeGuards}
${helpers}
`.trim();
  }

  /**
   * Generate import statements
   */
  private generateImports(includeHelpers: boolean): string {
    if (!includeHelpers) {
      return '// Generated schema - no runtime dependencies';
    }

    return `// Generated TypeScript schema for Notion data source
// Runtime validation requires typed-notion-core-ts

import type { NotionProperty } from 'typed-notion-core-ts';`;
  }

  /**
   * Generate TypeScript interface
   */
  private generateInterface(
    typeName: string,
    properties: Array<{ name: string; type: string; optional: boolean; comment?: string }>,
    strictMode: boolean
  ): string {
    const propertiesCode = properties
      .map(prop => {
        const comment = prop.comment ? `  /** ${prop.comment} */\n` : '';
        const optional = prop.optional ? '?' : '';
        const propName = this.sanitizePropertyName(prop.name);

        return `${comment}  ${propName}${optional}: ${prop.type};`;
      })
      .join('\n');

    const modeComment = strictMode ? ' (strict mode - no optional properties)' : '';

    return `/**
 * TypeScript interface for ${typeName} Notion data source${modeComment}
 * Generated on: ${new Date().toISOString()}
 */
export interface ${typeName}Schema {
${propertiesCode}
}`;
  }

  /**
   * Generate type guard functions
   */
  private generateTypeGuards(
    typeName: string,
    properties: Array<{ name: string; type: string; optional: boolean }>
  ): string {
    const checks = properties
      .map(prop => {
        const propName = this.sanitizePropertyName(prop.name);
        const check = this.generatePropertyCheck(propName, prop.type, prop.optional);
        return `    ${check}`;
      })
      .join(' &&\n');

    return `
/**
 * Type guard to check if an object matches ${typeName}Schema
 */
export function is${typeName}(data: unknown): data is ${typeName}Schema {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  return (
${checks}
  );
}`;
  }

  /**
   * Generate helper functions
   */
  private generateHelpers(typeName: string): string {
    return `
/**
 * Create a partial ${typeName} object with type safety
 */
export function create${typeName}(data: Partial<${typeName}Schema>): Partial<${typeName}Schema> {
  return data;
}

/**
 * Validate ${typeName} data and throw if invalid
 */
export function validate${typeName}(data: unknown): asserts data is ${typeName}Schema {
  if (!is${typeName}(data)) {
    throw new Error(\`Invalid ${typeName} data structure\`);
  }
}`;
  }

  /**
   * Generate metadata comments
   */
  private generateMetadata(dataSourceSchema: DataSourceSchema): string {
    return `/**
 * Auto-generated schema for Notion data source
 * 
 * Data Source ID: ${dataSourceSchema.dataSourceId}
 * Database ID: ${dataSourceSchema.databaseId}
 * Schema Name: ${dataSourceSchema.name}
 * Generated: ${new Date().toISOString()}
 * 
 * Property Count: ${Object.keys(dataSourceSchema.properties).length}
 * Last Modified: ${dataSourceSchema.lastEditedTime}
 * 
 * @WARNING Do not edit this file manually - it will be overwritten
 * @REGENERATE Run 'npx typed-notion pull' to update this schema
 */`;
  }

  /**
   * Generate type name from schema name
   */
  private generateTypeName(schemaName: string): string {
    return schemaName
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Generate file name from schema name
   */
  private generateFileName(schemaName: string): string {
    return `${schemaName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')}.ts`;
  }

  /**
   * Sanitize property name for TypeScript
   */
  private sanitizePropertyName(propName: string): string {
    // If property name is not a valid identifier, wrap in quotes
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName)) {
      return `'${propName.replace(/'/g, "\\'")}'`;
    }
    return propName;
  }

  /**
   * Generate property validation check
   */
  private generatePropertyCheck(propName: string, type: string, optional: boolean): string {
    const objProp = `obj[${typeof propName === 'string' && propName.includes("'") ? propName : `'${propName}'`}]`;

    if (optional) {
      return `(${objProp} === undefined || ${this.getTypeCheck(objProp, type)})`;
    }

    return this.getTypeCheck(objProp, type);
  }

  /**
   * Get TypeScript type check for runtime validation
   */
  private getTypeCheck(varName: string, type: string): string {
    if (type.includes('|')) {
      // Union types - check each possibility
      const types = type.split('|').map(t => t.trim());
      const checks = types.map(t => this.getSingleTypeCheck(varName, t));
      return `(${checks.join(' || ')})`;
    }

    return this.getSingleTypeCheck(varName, type);
  }

  /**
   * Get single type check
   */
  private getSingleTypeCheck(varName: string, type: string): string {
    switch (type) {
      case 'string':
        return `typeof ${varName} === 'string'`;
      case 'number':
        return `typeof ${varName} === 'number'`;
      case 'boolean':
        return `typeof ${varName} === 'boolean'`;
      case 'null':
        return `${varName} === null`;
      case 'unknown':
        return 'true'; // unknown accepts anything
      default:
        if (type.startsWith("'") && type.endsWith("'")) {
          // String literal type
          return `${varName} === ${type}`;
        }
        if (type.includes('[]')) {
          return `Array.isArray(${varName})`;
        }
        // Complex type - just check for object
        return `typeof ${varName} === 'object' && ${varName} !== null`;
    }
  }

  /**
   * Generate list of exported symbols
   */
  private generateExports(typeName: string, includeHelpers: boolean): string[] {
    const exports = [`${typeName}Schema`];

    if (includeHelpers) {
      exports.push(`is${typeName}`, `create${typeName}`, `validate${typeName}`);
    }

    return exports;
  }
}
