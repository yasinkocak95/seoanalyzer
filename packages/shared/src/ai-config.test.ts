import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('node:fs', () => ({ readFileSync: mocks.read }));
import { getAiConfig } from './ai-config.js';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY', ''); vi.stubEnv('ANTHROPIC_MODEL', ''); mocks.read.mockImplementation(() => { throw new Error('File absent'); }); });
afterEach(() => vi.unstubAllEnvs());
describe('optional server Claude config', () => {
  it('treats absent env files and keys as an optional disabled feature', () => { expect(getAiConfig()).toEqual({ apiKey: '', model: 'claude-sonnet-4-6' }); });
  it('supports injected server environment for containers', () => { vi.stubEnv('ANTHROPIC_API_KEY', ' container-key '); expect(getAiConfig().apiKey).toBe('container-key'); });
  it('reads added, edited and removed .env keys without caching or changing the process env', () => {
    expect(getAiConfig().apiKey).toBe('');
    mocks.read.mockReturnValue('ANTHROPIC_API_KEY=" first-key "\nANTHROPIC_MODEL=custom-model\n'); expect(getAiConfig()).toEqual({ apiKey: 'first-key', model: 'custom-model' });
    mocks.read.mockReturnValue('ANTHROPIC_API_KEY=second-key'); expect(getAiConfig().apiKey).toBe('second-key');
    mocks.read.mockReturnValue('ANTHROPIC_API_KEY='); expect(getAiConfig().apiKey).toBe(''); expect(process.env.ANTHROPIC_API_KEY).toBe('');
  });
  it('an explicitly empty local key disables a previously loaded process key', () => { vi.stubEnv('ANTHROPIC_API_KEY', 'stale-key'); mocks.read.mockReturnValue('ANTHROPIC_API_KEY="   "'); expect(getAiConfig().apiKey).toBe(''); });
});
