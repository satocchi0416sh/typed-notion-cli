import { NotionClientWrapper, type DataSourceInfo, type DatabaseInfo } from './notion-client.js';
import { NotionAPIError } from '../utils/error-handling.js';
import type { EnvironmentConfig, RetryConfig } from '../config/validator.js';
import type { PropertyConfiguration } from '../types/notion-api.js';

export interface DataSourceProperty {
  id: string;
  name: string;
  type: string;
  configuration?: PropertyConfiguration;
}

export interface DataSourceSchema {
  dataSourceId: string;
  databaseId: string;
  name: string;
  properties: Record<string, DataSourceProperty>;
  createdTime: string;
  lastEditedTime: string;
}

export class DataSourceClient {
  private readonly notionClient: NotionClientWrapper;

  constructor(config: { environment: EnvironmentConfig; retry?: RetryConfig }) {
    this.notionClient = new NotionClientWrapper(config);
  }

  /**
   * Fetch schema from a data source ID (2025-09-03 API format)
   */
  async fetchDataSourceSchema(dataSourceId: string): Promise<DataSourceSchema> {
    try {
      // Convert data source ID to database ID for API call
      const databaseInfo = await this.notionClient.getDatabaseFromDataSource(dataSourceId);

      return this.transformDatabaseToDataSource(dataSourceId, databaseInfo);
    } catch (error) {
      throw new NotionAPIError(
        `Failed to fetch schema for data source: ${dataSourceId}`,
        'Verify the data source ID format (should start with "src_") and access permissions',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Fetch schema from a legacy database ID
   */
  async fetchDatabaseSchema(databaseId: string): Promise<DataSourceSchema> {
    try {
      const databaseInfo = await this.notionClient.getDatabaseInfo(databaseId);

      // Generate a data source ID from database ID
      const dataSourceId = `src_${databaseId}`;

      return this.transformDatabaseToDataSource(dataSourceId, databaseInfo);
    } catch (error) {
      throw new NotionAPIError(
        `Failed to fetch schema for database: ${databaseId}`,
        'Verify the database ID and that your integration has access',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List all available data sources
   */
  async listDataSources(): Promise<DataSourceInfo[]> {
    try {
      return await this.notionClient.listDataSources();
    } catch (error) {
      throw new NotionAPIError(
        'Failed to list available data sources',
        'Check your integration permissions',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Validate access to a specific data source
   */
  async validateDataSourceAccess(dataSourceId: string): Promise<boolean> {
    try {
      await this.fetchDataSourceSchema(dataSourceId);
      return true;
    } catch (error) {
      if (error instanceof NotionAPIError && error.message.includes('not found')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Validate access to a specific database (legacy)
   */
  async validateDatabaseAccess(databaseId: string): Promise<boolean> {
    try {
      await this.fetchDatabaseSchema(databaseId);
      return true;
    } catch (error) {
      if (error instanceof NotionAPIError && error.message.includes('not found')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Transform Notion database info to data source schema format
   */
  private transformDatabaseToDataSource(
    dataSourceId: string,
    databaseInfo: DatabaseInfo
  ): DataSourceSchema {
    const properties: Record<string, DataSourceProperty> = {};

    // Transform Notion properties to data source properties
    for (const [key, value] of Object.entries(databaseInfo.properties)) {
      properties[key] = this.transformProperty(key, value);
    }

    return {
      dataSourceId,
      databaseId: databaseInfo.id,
      name: databaseInfo.title,
      properties,
      createdTime: databaseInfo.createdTime,
      lastEditedTime: databaseInfo.lastEditedTime,
    };
  }

  /**
   * Transform a Notion property to data source property format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformProperty(id: string, property: any): DataSourceProperty {
    const baseProperty: DataSourceProperty = {
      id,
      name: property.name || id,
      type: property.type,
    };

    // Add configuration for complex property types
    switch (property.type) {
      case 'formula':
        baseProperty.configuration = {
          expression: property.formula?.expression,
          // Formula types are ambiguous, will be handled by schema generator
        };
        break;

      case 'relation':
        baseProperty.configuration = {
          databaseId: property.relation?.database_id,
          syncedPropertyId: property.relation?.synced_property_id,
          syncedPropertyName: property.relation?.synced_property_name,
        };
        break;

      case 'rollup':
        baseProperty.configuration = {
          relationPropertyId: property.rollup?.relation_property_id,
          relationPropertyName: property.rollup?.relation_property_name,
          rollupPropertyId: property.rollup?.rollup_property_id,
          rollupPropertyName: property.rollup?.rollup_property_name,
          function: property.rollup?.function,
        };
        break;

      case 'select':
        baseProperty.configuration = {
          options: property.select?.options,
        };
        break;

      case 'multi_select':
        baseProperty.configuration = {
          options: property.multi_select?.options,
        };
        break;

      case 'status':
        baseProperty.configuration = {
          options: property.status?.options,
          groups: property.status?.groups,
        };
        break;

      default:
        // For simple types, no additional configuration needed
        break;
    }

    return baseProperty;
  }
}
