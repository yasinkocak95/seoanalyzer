// Restricted Windows environments may prohibit esbuild's child process.
// Use the already installed TypeScript compiler and worker threads locally.
import ts from 'typescript';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const at = path => fileURLToPath(new URL(path, new URL('../', import.meta.url)));
export default defineConfig({
  esbuild: false,
  plugins: [{ name: 'local-typescript', enforce: 'pre', transform(source, id) {
    if (!/\.tsx?(?:\?|$)/.test(id) || id.includes('/node_modules/')) return;
    const output = ts.transpileModule(source.replaceAll("process.env.NODE_ENV", 'process.env["NODE_ENV"]'), { fileName: id.split('?')[0], compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, sourceMap: true, inlineSources: true } });
    return { code: output.outputText, map: output.sourceMapText };
  } }],
  resolve: { preserveSymlinks: true, alias: {
    '@seo/shared/issue-patterns': at('packages/shared/src/issue-patterns.ts'),
    '@seo/shared/ai-config': at('packages/shared/src/ai-config.ts'),
    '@seo/shared/i18n': at('packages/shared/src/i18n/index.ts'),
    '@seo/shared': at('packages/shared/src/index.ts'),
    '@seo/rules': at('packages/rules/src/index.ts'),
    '@seo/db': at('packages/db/src/index.ts'),
    '@': at('apps/web/src'),
  } },
  test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['**/node_modules/**', '**/dist/**'], pool: 'threads', maxWorkers: 2, testTimeout: 15000 },
});
