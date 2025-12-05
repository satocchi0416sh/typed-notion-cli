/**
 * Property Type Mapper
 * Maps Notion API property types to TypeScript type definitions
 */

import type { DataSourceProperty } from '../api/data-source-client.js';
import { NotionAPIError } from '../utils/error-handling.js';

export interface TypeMappingResult {
  typeDefinition: string;
  required: boolean;
  comment?: string;
  imports?: string[];
}

export interface TypeMapperOptions {
  strictMode?: boolean;
  allowUnknown?: boolean;
}

export class TypeMapper {
  private readonly options: TypeMapperOptions;

  constructor(options: TypeMapperOptions = {}) {
    this.options = {
      strictMode: false,
      allowUnknown: true,
      ...options,
    };
  }

  /**
   * Map a Notion property to TypeScript type definition
   */
  async mapPropertyType(property: DataSourceProperty): Promise<TypeMappingResult> {
    try {
      const baseResult = this.mapBasePropertyType(property);

      // Handle optional properties based on strict mode and property requirements
      const required = this.isPropertyRequired(property);

      return {
        ...baseResult,
        required,
      };
    } catch (error) {
      throw new NotionAPIError(
        `Failed to map property type: ${property.type}`,
        'Check property configuration and type mapping',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Map base property type without optional handling
   */
  private mapBasePropertyType(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    switch (property.type) {
      case 'title':
        return {
          typeDefinition: 'string',
          comment: 'Notion title property',
        };

      case 'rich_text':
        return {
          typeDefinition: 'string',
          comment: 'Rich text content as plain string',
        };

      case 'number':
        return {
          typeDefinition: 'number',
          comment: 'Numeric value',
        };

      case 'checkbox':
        return {
          typeDefinition: 'boolean',
          comment: 'Boolean checkbox value',
        };

      case 'select':
        return this.mapSelectProperty(property);

      case 'multi_select':
        return this.mapMultiSelectProperty(property);

      case 'date':
        return {
          typeDefinition: 'string | null',
          comment: 'Date in ISO 8601 format (YYYY-MM-DD) or null',
        };

      case 'people':
        return {
          typeDefinition: 'string[]',
          comment: 'Array of user IDs',
        };

      case 'files':
        return {
          typeDefinition: 'string[]',
          comment: 'Array of file URLs',
        };

      case 'url':
        return {
          typeDefinition: 'string | null',
          comment: 'URL string or null',
        };

      case 'email':
        return {
          typeDefinition: 'string | null',
          comment: 'Email address or null',
        };

      case 'phone_number':
        return {
          typeDefinition: 'string | null',
          comment: 'Phone number or null',
        };

      case 'formula':
        return this.mapFormulaProperty(property);

      case 'relation':
        return {
          typeDefinition: 'string[]',
          comment: 'Array of related page IDs',
        };

      case 'rollup':
        return this.mapRollupProperty(property);

      case 'created_time':
      case 'last_edited_time':
        return {
          typeDefinition: 'string',
          comment: 'Timestamp in ISO 8601 format',
        };

      case 'created_by':
      case 'last_edited_by':
        return {
          typeDefinition: 'string',
          comment: 'User ID of the person who created/edited',
        };

      case 'status':
        return this.mapStatusProperty(property);

      case 'unique_id':
        return {
          typeDefinition: 'number',
          comment: 'Unique numeric identifier',
        };

      default:
        return this.mapUnknownProperty(property);
    }
  }

  /**
   * Map select property with specific options
   */
  private mapSelectProperty(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    const selectConfig = property.configuration as
      | { options?: Array<{ name: string }> }
      | undefined;

    if (selectConfig?.options && selectConfig.options.length > 0) {
      const options = selectConfig.options
        .map((option: { name: string }) => `'${this.escapeStringLiteral(option.name)}'`)
        .join(' | ');

      return {
        typeDefinition: `${options} | null`,
        comment: `Select option: ${selectConfig.options.map((o: { name: string }) => o.name).join(', ')}`,
      };
    }

    return {
      typeDefinition: 'string | null',
      comment: 'Select property (options not available)',
    };
  }

  /**
   * Map multi-select property with specific options
   */
  private mapMultiSelectProperty(
    property: DataSourceProperty
  ): Omit<TypeMappingResult, 'required'> {
    const multiSelectConfig = property.configuration as
      | { options?: Array<{ name: string }> }
      | undefined;

    if (multiSelectConfig?.options && multiSelectConfig.options.length > 0) {
      const options = multiSelectConfig.options
        .map((option: { name: string }) => `'${this.escapeStringLiteral(option.name)}'`)
        .join(' | ');

      return {
        typeDefinition: `(${options})[]`,
        comment: `Multi-select options: ${multiSelectConfig.options.map((o: { name: string }) => o.name).join(', ')}`,
      };
    }

    return {
      typeDefinition: 'string[]',
      comment: 'Multi-select property (options not available)',
    };
  }

  /**
   * Map formula property with fallback to unknown
   */
  private mapFormulaProperty(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    // Check if formula has explicit output type information
    const formulaConfig = property.configuration as { expression_type?: string } | undefined;
    if (formulaConfig?.expression_type) {
      switch (formulaConfig.expression_type) {
        case 'string':
          return {
            typeDefinition: 'string | null',
            comment: 'Formula result (string)',
          };
        case 'number':
          return {
            typeDefinition: 'number | null',
            comment: 'Formula result (number)',
          };
        case 'boolean':
          return {
            typeDefinition: 'boolean | null',
            comment: 'Formula result (boolean)',
          };
        case 'date':
          return {
            typeDefinition: 'string | null',
            comment: 'Formula result (date in ISO format)',
          };
        default:
          // Log warning for unrecognized formula output types
          // eslint-disable-next-line no-console
          console.warn(
            `Warning: Unrecognized formula expression_type '${formulaConfig.expression_type}' - defaulting to unknown`
          );
          break;
      }
    }

    // Fallback to unknown for ambiguous formula types
    return {
      typeDefinition: 'unknown',
      comment: 'TODO: Formula type unclear - verify output type and update schema',
    };
  }

  /**
   * Map rollup property based on aggregation function
   */
  private mapRollupProperty(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    const rollupConfig = property.configuration as { function?: string } | undefined;
    if (rollupConfig?.function) {
      switch (rollupConfig.function) {
        case 'count':
        case 'count_values':
        case 'count_unique_values':
        case 'count_all':
        case 'count_per_group':
          return {
            typeDefinition: 'number',
            comment: `Rollup count (${rollupConfig.function})`,
          };

        case 'sum':
        case 'average':
        case 'median':
        case 'min':
        case 'max':
        case 'range':
          return {
            typeDefinition: 'number | null',
            comment: `Rollup number (${rollupConfig.function})`,
          };

        case 'earliest_date':
        case 'latest_date':
          return {
            typeDefinition: 'string | null',
            comment: `Rollup date (${rollupConfig.function})`,
          };

        case 'show_original':
          return {
            typeDefinition: 'unknown[]',
            comment: 'Rollup showing original values - type depends on source property',
          };

        case 'show_unique':
          return {
            typeDefinition: 'unknown[]',
            comment: 'Rollup showing unique values - type depends on source property',
          };

        default:
          break;
      }
    }

    return {
      typeDefinition: 'unknown',
      comment: 'TODO: Rollup type unclear - verify aggregation and update schema',
    };
  }

  /**
   * Map status property with specific options
   */
  private mapStatusProperty(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    const statusConfig = property.configuration as
      | { options?: Array<{ name: string }> }
      | undefined;

    if (statusConfig?.options && statusConfig.options.length > 0) {
      const options = statusConfig.options
        .map((option: { name: string }) => `'${this.escapeStringLiteral(option.name)}'`)
        .join(' | ');

      return {
        typeDefinition: `${options} | null`,
        comment: `Status options: ${statusConfig.options.map((o: { name: string }) => o.name).join(', ')}`,
      };
    }

    return {
      typeDefinition: 'string | null',
      comment: 'Status property (options not available)',
    };
  }

  /**
   * Map unknown property type
   */
  private mapUnknownProperty(property: DataSourceProperty): Omit<TypeMappingResult, 'required'> {
    if (this.options.allowUnknown) {
      return {
        typeDefinition: 'unknown',
        comment: `TODO: Unknown property type '${property.type}' - add type mapping`,
      };
    }

    throw new NotionAPIError(
      `Unknown property type: ${property.type}`,
      'Add mapping for this property type or enable allowUnknown option'
    );
  }

  /**
   * Determine if property should be required
   */
  private isPropertyRequired(property: DataSourceProperty): boolean {
    // Title properties are always required
    if (property.type === 'title') {
      return true;
    }

    // In strict mode, make more properties required
    if (this.options.strictMode) {
      return [
        'number',
        'checkbox',
        'created_time',
        'last_edited_time',
        'created_by',
        'last_edited_by',
        'unique_id',
      ].includes(property.type);
    }

    // Default to optional for most properties
    return false;
  }

  /**
   * Escape string literals for TypeScript
   */
  private escapeStringLiteral(value: string): string {
    return value.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  /**
   * Get all possible types for batch processing
   */
  static getSupportedPropertyTypes(): string[] {
    return [
      'title',
      'rich_text',
      'number',
      'checkbox',
      'select',
      'multi_select',
      'date',
      'people',
      'files',
      'url',
      'email',
      'phone_number',
      'formula',
      'relation',
      'rollup',
      'created_time',
      'last_edited_time',
      'created_by',
      'last_edited_by',
      'status',
      'unique_id',
    ];
  }

  /**
   * Validate property type is supported
   */
  static isPropertyTypeSupported(type: string): boolean {
    return TypeMapper.getSupportedPropertyTypes().includes(type);
  }

  /**
   * Validate generated schema for type safety
   */
  validateGeneratedSchema(typeDefinition: string): boolean {
    // Check for common type safety issues
    const unsafePatterns = [
      /\bany\b/, // No 'any' types allowed
      /\bundefined\b/, // Prefer optional properties over undefined unions
    ];

    for (const pattern of unsafePatterns) {
      if (pattern.test(typeDefinition)) {
        return false;
      }
    }

    // Allow unknown types (they are safe)
    if (typeDefinition.includes('unknown')) {
      return true;
    }

    // Basic TypeScript syntax validation
    const validTypePattern = /^[a-zA-Z_$][\w$]*(\s*\|\s*[a-zA-Z_$][\w$]*)*(\[\])?(\s*\|\s*null)?$/;
    return validTypePattern.test(typeDefinition.replace(/'/g, ''));
  }

  /**
   * Generate type safety report for multiple properties
   */
  generateTypeSafetyReport(properties: Array<{ name: string; type: string; comment?: string }>): {
    safeProperties: number;
    unsafeProperties: number;
    unknownProperties: number;
    warnings: string[];
  } {
    let safeProperties = 0;
    let unsafeProperties = 0;
    let unknownProperties = 0;
    const warnings: string[] = [];

    for (const prop of properties) {
      if (prop.type.includes('unknown')) {
        unknownProperties++;
        if (prop.comment?.includes('TODO')) {
          warnings.push(`Property '${prop.name}' has ambiguous type - manual review needed`);
        }
      } else if (this.validateGeneratedSchema(prop.type)) {
        safeProperties++;
      } else {
        unsafeProperties++;
        warnings.push(`Property '${prop.name}' has potentially unsafe type: ${prop.type}`);
      }
    }

    return {
      safeProperties,
      unsafeProperties,
      unknownProperties,
      warnings,
    };
  }
}
