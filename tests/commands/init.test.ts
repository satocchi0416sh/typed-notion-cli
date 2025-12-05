import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInitCommand } from '../../src/commands/init';

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create init command with correct configuration', () => {
    const initCommand = createInitCommand();

    expect(initCommand.name()).toBe('init');
    expect(initCommand.description()).toContain('Initialize');
  });

  it('should have required options', () => {
    const initCommand = createInitCommand();
    const options = initCommand.options;

    const hasForceOption = options.some(opt => opt.flags.includes('--force'));
    const hasMinimalOption = options.some(opt => opt.flags.includes('--minimal'));
    const hasTokenOption = options.some(opt => opt.flags.includes('--token'));

    expect(hasForceOption).toBe(true);
    expect(hasMinimalOption).toBe(true);
    expect(hasTokenOption).toBe(true);
  });
});
