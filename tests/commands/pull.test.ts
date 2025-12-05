import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPullCommand } from '../../src/commands/pull';

describe('pull command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create pull command with correct configuration', () => {
    const pullCommand = createPullCommand();

    expect(pullCommand.name()).toBe('pull');
    expect(pullCommand.description()).toContain('Pull');
  });

  it('should have required options', () => {
    const pullCommand = createPullCommand();
    const options = pullCommand.options;

    const hasDataSourceOption = options.some(opt => opt.flags.includes('--data-source'));
    const hasForceOption = options.some(opt => opt.flags.includes('--force'));
    const hasNonInteractiveOption = options.some(opt => opt.flags.includes('--non-interactive'));

    expect(hasDataSourceOption).toBe(true);
    expect(hasForceOption).toBe(true);
    expect(hasNonInteractiveOption).toBe(true);
  });
});
