import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), pending: vi.fn(), generate: vi.fn(), getJob: vi.fn(), add: vi.fn(), processor: null as any, events: new Map<string, Function>() }));
vi.mock('@seo/db', () => ({ db: { crawl: { findMany: async () => [] }, aiAnalysis: { findUnique: mocks.find, updateMany: mocks.update, findMany: mocks.pending } } }));
vi.mock('@seo/shared/ai-config', () => ({ getAiConfig: () => ({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() || '' }) }));
vi.mock('./ai-analysis.js', async importOriginal => ({ ...await importOriginal<typeof import('./ai-analysis.js')>(), generateAiAnalysis: mocks.generate }));
vi.mock('bullmq', () => ({
  Queue: class { on() { return this; } getJob(id: string) { return mocks.getJob(id); } add(...args: unknown[]) { return mocks.add(...args); } },
  Worker: class { constructor(_name: string, processor: unknown) { mocks.processor = processor; } on(name: string, fn: Function) { mocks.events.set(name, fn); return this; } },
}));
import { startAiWorker } from './ai-worker.js';
import { AiError } from './ai-analysis.js';
const worker = startAiWorker({} as any);
const job = (attemptsMade = 0) => ({ data: { analysisId: 'analysis', generation: 'version' }, attemptsMade, opts: { attempts: 2 } });
beforeEach(() => { vi.stubEnv('ANTHROPIC_API_KEY', 'server-test-key'); vi.clearAllMocks(); mocks.find.mockResolvedValue({ id: 'analysis', generation: 'version', status: 'QUEUED', crawlId: 'crawl', locale: 'tr' }); mocks.update.mockResolvedValue({ count: 1 }); mocks.generate.mockResolvedValue({ result: { summary: 'Plan', actions: [] }, model: 'claude-sonnet-4-6' }); mocks.pending.mockResolvedValue([]); mocks.getJob.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());
describe('AI job lifecycle', () => {
  it('skips an already queued job quietly without starting Claude when no key exists', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ''); await expect(mocks.processor(job())).resolves.toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'IDLE', error: null } }));
  });
  it('does not reconcile or enqueue AI jobs without a key', async () => { vi.stubEnv('ANTHROPIC_API_KEY', ''); await worker.reconcile(); expect(mocks.pending).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled(); });
  it('persists the result without changing crawl status', async () => { await mocks.processor(job()); expect(mocks.generate).toHaveBeenCalledWith('crawl', 'tr'); expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ generation: 'version' }), data: expect.objectContaining({ status: 'COMPLETED', result: { summary: 'Plan', actions: [] }, generatedAt: expect.any(Date) }) })); });
  it.each(['COMPLETED', 'FAILED'])('skips already %s work', async status => { mocks.find.mockResolvedValue({ generation: 'version', status }); await mocks.processor(job()); expect(mocks.generate).not.toHaveBeenCalled(); });
  it('skips superseded generations', async () => { mocks.find.mockResolvedValue({ generation: 'new-version', status: 'QUEUED' }); await mocks.processor(job()); expect(mocks.generate).not.toHaveBeenCalled(); });
  it('does not call Claude when the database claim loses', async () => { mocks.update.mockResolvedValue({ count: 0 }); await mocks.processor(job()); expect(mocks.generate).not.toHaveBeenCalled(); });
  it('retries temporary provider failures', async () => { mocks.generate.mockRejectedValue(new AiError('ai.providerUnavailable', true)); await expect(mocks.processor(job())).rejects.toThrow('AI analysis job failed'); expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'QUEUED', error: 'ai.providerUnavailable' } })); });
  it('marks exhausted retries failed while preserving the old result', async () => { mocks.generate.mockRejectedValue(new AiError('ai.providerUnavailable', true)); await mocks.processor(job(1)); expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'FAILED', error: 'ai.providerUnavailable' } })); });
  it('does not retry missing credentials or malformed output', async () => { mocks.generate.mockRejectedValue(new AiError('ai.notConfigured')); await mocks.processor(job()); expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'FAILED', error: 'ai.notConfigured' } })); });
  it('reconciles a missing Redis job using its durable generation', async () => { mocks.pending.mockResolvedValue([{ id: 'analysis', generation: 'version' }]); await worker.reconcile(); expect(mocks.add).toHaveBeenCalledWith('recommendations', { analysisId: 'analysis', generation: 'version' }, expect.objectContaining({ jobId: 'ai-analysis-version' })); });
  it('reconciles failed jobs after a database outage', async () => { mocks.pending.mockResolvedValue([{ id: 'analysis', generation: 'version' }]); mocks.getJob.mockResolvedValue({ getState: async () => 'failed' }); await worker.reconcile(); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'FAILED', error: 'ai.providerUnavailable' } })); });
});
