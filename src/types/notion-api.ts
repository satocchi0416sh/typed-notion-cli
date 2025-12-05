/**
 * Type definitions for Notion API responses
 * These types are based on the Notion API but simplified for our use case
 */

import type { EnvironmentConfig, RetryConfig } from '../config/validator.js';

// Configuration types for different property types
export interface SelectConfiguration {
  options: Array<{
    id: string;
    name: string;
    color?: string;
  }>;
}

export interface FormulaConfiguration {
  expression: string;
}

export interface RelationConfiguration {
  database_id: string;
  type: 'single_property' | 'dual_property';
  single_property?: Record<string, unknown>;
  dual_property?: Record<string, unknown>;
}

export interface RollupConfiguration {
  relation_property_id: string;
  relation_property_name: string;
  rollup_property_id: string;
  rollup_property_name: string;
  function: string;
}

// Property configuration union type
export type PropertyConfiguration =
  | SelectConfiguration
  | FormulaConfiguration
  | RelationConfiguration
  | RollupConfiguration
  | Record<string, unknown>;

// Notion property type from API
export interface NotionProperty {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown; // For type-specific fields
}

// Database title component
export interface DatabaseTitleComponent {
  type: 'text';
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  plain_text?: string;
  href?: string | null;
  annotations?: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
}

// Database object from search results
export interface NotionDatabase {
  object: 'database';
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: string;
    id: string;
  };
  last_edited_by: {
    object: string;
    id: string;
  };
  title: DatabaseTitleComponent[];
  description: DatabaseTitleComponent[];
  is_inline: boolean;
  properties: Record<string, NotionProperty>;
  parent: {
    type: string;
    [key: string]: unknown;
  };
  url: string;
  public_url: string | null;
  archived: boolean;
  icon?: {
    type: string;
    [key: string]: unknown;
  } | null;
  cover?: {
    type: string;
    [key: string]: unknown;
  } | null;
}

// Search response from Notion API
export interface NotionSearchResponse {
  object: 'list';
  results: NotionDatabase[];
  next_cursor: string | null;
  has_more: boolean;
  type: 'database';
  database: Record<string, never>;
}

// Data source client configuration (matches DataSourceClient constructor)
export interface DataSourceClientConfig {
  environment: EnvironmentConfig;
  retry?: RetryConfig;
}
