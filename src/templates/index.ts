export interface TemplateContext {
  projectName?: string | undefined;
  dataSourceId?: string | undefined;
  databaseId?: string | undefined;
  notionToken?: string | undefined;
  schemaPath?: string | undefined;
  timestamp?: string | undefined;
}

export function generateConfigTemplate(context: TemplateContext = {}): string {
  const timestamp = context.timestamp || new Date().toISOString();

  return `import type { TypedNotionConfig } from 'typed-notion-cli';

/**
 * Typed Notion CLI Configuration
 * Generated: ${timestamp}
 */
export default {
  // Environment configuration
  environment: {
    NOTION_TOKEN: process.env.NOTION_TOKEN || '${context.notionToken || ''}',
    NOTION_API_VERSION: '2022-06-28',
  },

  // Data sources configuration (2025-09-03 API)
  dataSources: [${
    context.dataSourceId
      ? `
    {
      id: '${context.dataSourceId}',
      name: 'Main Database',
      schemaPath: './schemas/${context.dataSourceId}.ts',
    },`
      : ''
  }
    // Add more data sources here
  ],

  // Legacy database support (optional)
  databases: [${
    context.databaseId
      ? `
    {
      id: '${context.databaseId}',
      name: 'Legacy Database',
      schemaPath: './schemas/${context.databaseId}.ts',
    },`
      : ''
  }
    // Add more databases here
  ],

  // Output configuration
  output: {
    schemasDir: './schemas',
    typesDir: './types',
    format: 'typescript' as const,
  },

  // Schema generation options
  schemaOptions: {
    includeMetadata: true,
    generateEnums: true,
    handleFormulas: 'unknown' as const, // 'unknown' | 'any' | 'strict'
    strictNullChecks: true,
  },

  // Validation options
  validation: {
    enabled: true,
    strict: false,
    throwOnError: false,
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    backoffMs: 1000,
  },
} satisfies TypedNotionConfig;
`;
}

export function generateSchemaTemplate(
  databaseName: string,
  properties: Array<{ name: string; type: string; nullable?: boolean }>
): string {
  const timestamp = new Date().toISOString();

  const propertyDefinitions = properties
    .map(prop => {
      const type = prop.nullable ? `${prop.type} | null` : prop.type;
      return `    ${prop.name}: ${type};`;
    })
    .join('\n');

  return `/**
 * Generated Notion Schema for: ${databaseName}
 * Generated: ${timestamp}
 * 
 * This file was automatically generated from your Notion database.
 * Do not edit manually unless you know what you're doing.
 */

import type { NotionPageSchema } from 'typed-notion';

export interface ${databaseName}Schema extends NotionPageSchema {
  // Generated properties
${propertyDefinitions}

  // Metadata
  readonly id: string;
  readonly created_time: string;
  readonly last_edited_time: string;
  readonly created_by: {
    id: string;
    object: 'user';
  };
  readonly last_edited_by: {
    id: string;
    object: 'user';
  };
}

// Property type definitions for runtime validation
export const ${databaseName}Properties = {
${properties.map(prop => `  ${prop.name}: '${prop.type}' as const,`).join('\n')}
} as const;

// Type guards
export function is${databaseName}(data: unknown): data is ${databaseName}Schema {
  if (!data || typeof data !== 'object') return false;
  
  const obj = data as Record<string, unknown>;
  
  // Check required metadata fields
  if (typeof obj.id !== 'string') return false;
  if (typeof obj.created_time !== 'string') return false;
  if (typeof obj.last_edited_time !== 'string') return false;
  
  return true;
}
`;
}

import type { PropertyConfiguration } from '../types/notion-api.js';

export function generateTypeDefinitionTemplate(
  _typeName: string,
  notionType: string,
  configuration?: PropertyConfiguration
): string {
  switch (notionType) {
    case 'title':
      return `string`;

    case 'rich_text':
      return `string`;

    case 'number':
      return `number | null`;

    case 'select':
      if (configuration && 'options' in configuration && Array.isArray(configuration.options)) {
        const options = configuration.options
          .map((opt: unknown) => {
            const option = opt as { name: string };
            return `'${option.name}'`;
          })
          .join(' | ');
        return options || 'string';
      }
      return `string | null`;

    case 'multi_select':
      if (configuration && 'options' in configuration && Array.isArray(configuration.options)) {
        const options = configuration.options
          .map((opt: unknown) => {
            const option = opt as { name: string };
            return `'${option.name}'`;
          })
          .join(' | ');
        return `Array<${options || 'string'}>`;
      }
      return `string[]`;

    case 'status':
      if (configuration && 'options' in configuration && Array.isArray(configuration.options)) {
        const options = configuration.options
          .map((opt: unknown) => {
            const option = opt as { name: string };
            return `'${option.name}'`;
          })
          .join(' | ');
        return options || 'string';
      }
      return `string | null`;

    case 'date':
      return `{ start: string; end?: string | null; time_zone?: string | null } | null`;

    case 'people':
      return `Array<{ id: string; type?: string; name?: string; avatar_url?: string | null }>`;

    case 'files':
      return `Array<{ name: string; url: string; type?: string }>`;

    case 'checkbox':
      return `boolean`;

    case 'url':
      return `string | null`;

    case 'email':
      return `string | null`;

    case 'phone_number':
      return `string | null`;

    case 'formula':
      // Formulas have ambiguous types, default to unknown
      return `unknown`;

    case 'relation':
      return `Array<{ id: string }>`;

    case 'rollup':
      // Rollups depend on the aggregated property type
      return `unknown`;

    case 'created_time':
      return `string`;

    case 'created_by':
      return `{ id: string; object: 'user' }`;

    case 'last_edited_time':
      return `string`;

    case 'last_edited_by':
      return `{ id: string; object: 'user' }`;

    default:
      return `unknown`;
  }
}

export function generateEnvTemplate(token?: string): string {
  return `# Notion Integration Token
# Get yours at: https://www.notion.so/my-integrations
NOTION_TOKEN=${token || 'your_notion_integration_token_here'}

# Optional: Default database/data source IDs
# NOTION_DATABASE_ID=your_database_id_here
# NOTION_DATA_SOURCE_ID=src_your_data_source_id_here
`;
}

export function generateGitignoreTemplate(): string {
  return `# Environment variables
.env
.env.local
.env.*.local

# Generated schemas (optional - you may want to commit these)
# /schemas
# /types

# Dependencies
node_modules/
dist/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
.cache/
`;
}
