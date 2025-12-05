import { Client } from '@notionhq/client';
import { setTimeout } from 'node:timers/promises';
import { NotionAPIError } from '../utils/error-handling.js';
import type { EnvironmentConfig, RetryConfig } from '../config/validator.js';

export interface NotionClientConfig {
  environment: EnvironmentConfig;
  retry?: RetryConfig;
}

export interface DatabaseInfo {
  id: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>; // Notion API returns dynamic property structure
  url: string;
  createdTime: string;
  lastEditedTime: string;
}

export interface DataSourceInfo {
  id: string;
  name: string;
  type: 'database';
  database: {
    id: string;
    title: string;
  };
  workspace: {
    id: string;
    name: string;
  };
}

export class NotionClientWrapper {
  private readonly client: Client;
  private readonly retryConfig: RetryConfig;

  constructor(config: NotionClientConfig) {
    this.client = new Client({
      auth: config.environment.NOTION_TOKEN,
      notionVersion: config.environment.NOTION_API_VERSION,
    });

    this.retryConfig = config.retry || {
      maxAttempts: 3,
      backoffMs: 1000,
    };
  }

  async getDatabaseInfo(databaseId: string): Promise<DatabaseInfo> {
    try {
      const response = await this.executeWithRetry(async () => {
        return await this.client.databases.retrieve({
          database_id: databaseId,
        });
      });

      // Type guard to ensure we have a full database response
      if ('properties' in response && 'url' in response) {
        return {
          id: response.id,
          title: this.extractDatabaseTitle(response),
          properties: response.properties,
          url: response.url,
          createdTime: response.created_time,
          lastEditedTime: response.last_edited_time,
        };
      } else {
        throw new Error('Received partial database response');
      }
    } catch (error) {
      throw new NotionAPIError(
        `Failed to retrieve database: ${databaseId}`,
        'Check that the database ID is correct and your integration has access',
        error instanceof Error ? error : undefined
      );
    }
  }

  async listDataSources(): Promise<DataSourceInfo[]> {
    try {
      const response = await this.executeWithRetry(async () => {
        // Note: This uses the new 2025-09-03 API endpoint
        // Type cast needed as @notionhq/client v2 doesn't have full types for search
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (this.client as any).search({
          filter: {
            value: 'database',
            property: 'object',
          },
          sort: {
            direction: 'ascending',
            timestamp: 'last_edited_time',
          },
        });
      });

      return (
        response.results
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((result: any) => result.object === 'database')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((database: any) => ({
            id: `src_${database.id}`, // Convert to data source ID format
            name: this.extractDatabaseTitle(database),
            type: 'database' as const,
            database: {
              id: database.id,
              title: this.extractDatabaseTitle(database),
            },
            workspace: {
              id: database.parent?.workspace || 'unknown',
              name: 'Workspace', // API doesn't return workspace name in this endpoint
            },
          }))
      );
    } catch (error) {
      throw new NotionAPIError(
        'Failed to list data sources',
        'Check your integration permissions and API version',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getDatabaseFromDataSource(dataSourceId: string): Promise<DatabaseInfo> {
    // Extract database ID from data source ID (src_abc123 -> abc123)
    const databaseId = dataSourceId.replace(/^src_/, '');
    return this.getDatabaseInfo(databaseId);
  }

  async validateAccess(): Promise<boolean> {
    try {
      await this.executeWithRetry(async () => {
        return await this.client.search({
          query: '',
          page_size: 1,
        });
      });
      return true;
    } catch (error) {
      throw new NotionAPIError(
        'Failed to validate API access',
        'Check your NOTION_TOKEN and ensure the integration has proper permissions',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Check if error is retryable
        if (!this.isRetryableError(lastError) || attempt === this.retryConfig.maxAttempts) {
          throw lastError;
        }

        // Calculate backoff delay
        const delay = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('internal server error') ||
      message.includes('service unavailable')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await setTimeout(ms);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractDatabaseTitle(database: any): string {
    if (database.title && Array.isArray(database.title)) {
      const titleText = database.title
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => t.plain_text || t.text?.content || '')
        .join('')
        .trim();

      return titleText || 'Untitled Database';
    }

    return 'Untitled Database';
  }
}
