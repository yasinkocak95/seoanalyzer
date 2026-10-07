import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  resolve: { alias: {
    '@seo/shared/ai-config': at('./packages/shared/src/ai-config.ts'),
    '@seo/shared/i18n': at('./packages/shared/src/i18n/index.ts'),
    '@seo/shared': at('./packages/shared/src/index.ts'),
    '@seo/rules': at('./packages/rules/src/index.ts'),
    '@seo/db': at('./packages/db/src/index.ts'),
    '@': at('./apps/web/src'),
  } },
  esbuild: { jsx: 'automatic' },
  test: { include: ['packages/**/*.test.ts','apps/**/*.test.ts','tests/**/*.test.ts'], exclude:['**/node_modules/**','**/dist/**'], maxWorkers:2, testTimeout:15000 },
});
