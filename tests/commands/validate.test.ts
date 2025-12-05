import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createValidateCommand } from '../../src/commands/validate';

describe('validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create validate command with correct configuration', () => {
    const validateCommand = createValidateCommand();

    expect(validateCommand.name()).toBe('validate');
    expect(validateCommand.description()).toContain('Validate');
  });

  it('should have required options', () => {
    const validateCommand = createValidateCommand();
    const options = validateCommand.options;

    const hasFixOption = options.some(opt => opt.flags.includes('--fix'));
    const hasSchemaOption = options.some(opt => opt.flags.includes('--schema'));

    expect(hasFixOption).toBe(true);
    expect(hasSchemaOption).toBe(true);
  });
});
