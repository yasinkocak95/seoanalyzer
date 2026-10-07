// Server-only subpath. Never re-export this module from the shared client entry.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { basename, dirname, resolve } from 'node:path';

export function getAiConfig() {
  let file: Record<string, string | undefined> = {};
  const cwd = process.cwd();
  const workspaceApp = basename(dirname(cwd)) === 'apps' && ['web', 'worker'].includes(basename(cwd));
  // Runtime secrets are deployment configuration and must never be bundled/traced.
  try { file = parseEnv(readFileSync(/*turbopackIgnore: true*/ resolve(/*turbopackIgnore: true*/ cwd, workspaceApp ? '../../.env' : '.env'), 'utf8')); }
  catch { /* Docker uses injected server env; an absent/unreadable file is optional. */ }
  // Read at request/job time so adding a local .env key needs no process restart.
  return {
    apiKey: (file.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '').trim(),
    model: (file.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? '').trim() || 'claude-sonnet-4-6',
  };
}
