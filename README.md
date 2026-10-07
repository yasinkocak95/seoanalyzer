# SEO Denetim

**English** | [Türkçe](README.tr.md)

A free, self-hosted, site-wide SEO audit application. URL submission, a BullMQ queue, Crawlee crawling, PostgreSQL storage, Turkish-language reports and finding comparison between two crawls all work end to end.

The application only inspects SEO signals. It does not measure Lighthouse, PageSpeed, speed/Core Web Vitals, accessibility scores, Google rankings or actual index status.

## Quick start (Docker)

Requirements: Docker Desktop and Docker Compose.

```bash
docker compose up --build
```

Once the services are healthy, open `http://localhost:3000`. The first image build may take a few minutes because of dependencies. Use `docker compose down` to stop. If you also want to delete the data, run `docker compose down -v` deliberately.

## Local development

Requires Node.js 22, PostgreSQL and Redis.

```bash
copy .env.example .env   # macOS/Linux: cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

The web UI runs on `http://localhost:3000` and the crawl worker runs in the same terminal group. To run them separately:

```bash
npm run dev -w @seo/web
npm run dev -w @seo/worker
```

## Claude AI recommendations

Set `ANTHROPIC_API_KEY` in the root server `.env` and run `npm run db:migrate` before starting the updated application. `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6`. Docker Compose injects the key into the web server and worker only; Claude requests originate in the worker. Never prefix the key with `NEXT_PUBLIC_`.

The key is optional. If absent or blank, the AI card shows a disabled **Coming soon** button. AI APIs return a successful disabled state without touching the AI database or queue, and workers skip existing AI jobs without calling Claude. Crawls, reports and exports remain available. Local web/worker processes reread the root `.env` at request/job time, so adding the key enables the feature automatically; an open disabled card checks availability every 15 seconds without generating an analysis. For Docker's injected environment, apply changed `.env` values with `docker compose up -d --force-recreate web worker` (or mount your server `.env` read-only at `/app/.env` for live file updates).

Completed crawls automatically queue TR/EN executive summaries when Claude is configured. You can also use **Generate AI Recommendations** in the report's **AI Insights** card. A separate BullMQ queue in the existing worker sends a bounded finding summary to Claude's [structured Messages API](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). It returns Critical / High / Medium actions with affected page counts and URL samples calculated from the crawl. Raw HTML, page text, evidence and URL credentials/query values are not sent. Limits: 2,000 findings, 20,000 page references and 100,000 input characters. The Anthropic API is paid separately.

Results are saved per crawl and language (TR/EN). Opening reports and polling status only read saved records; generation occurs automatically after completion or on an explicit generation/regeneration click. **Regenerate AI Analysis** replaces the result only after success and preserves the previous result on failure. Duplicate clicks share one generation. Temporary failures retry once; missing keys and invalid responses fail with a safe message. Recovery reconciles enqueue gaps and exhausted jobs after outages. Partial crawls retain their existing report and resume behavior; AI becomes available once completed.

## Tests and build

```bash
npm test
npm run build
```

## Structure

- `apps/web`: Next.js UI and crawl APIs
- `apps/worker`: BullMQ worker; Crawlee, robots/sitemap discovery and safe fetching
- `packages/rules`: Browser-independent, testable SEO rules
- `packages/shared`: URL normalization, SSRF protection and shared queue types
- `packages/db`: Prisma schema and migrations

## Crawl limits and security

By default the crawl stays on the same hostname, with a link depth of 12, 2 concurrent requests and at least 500 ms between requests per site. Transient errors such as dropped connections, timeouts, 5xx and 429 are retried twice with increasing delays; permanent errors such as 404 are not retried. There is no fixed page limit. URL states are persisted in PostgreSQL; a crawl can be paused and resumed, and it is clearly reported as partial when it hits the duration guard. Responses are limited to 5 MB and requests to 15 seconds. `robots.txt` blocks are reported. Non-HTTP(S) protocols, URLs containing credentials, private/local/reserved IPs and domains resolving to them are rejected; redirect targets are re-checked.

### URL template sampling

In the default crawl, repeating URL templates are detected automatically per site; folder names are not hard-coded. At least `TEMPLATE_MIN_URLS` (8) URLs that share the same parent path and differ only in their last segment form a template (e.g. `/products/{slug}`, `/cfi/{slug}`). Numeric/hash segments become `{id}`. URLs with query parameters form separate templates based on their parameter names (`/list?category={değer}`). Root-level URLs without a query are not grouped. `TEMPLATE_SAMPLE_SIZE` (5) samples are analyzed from each template; the rest are recorded as "discovered, not analyzed" and no requests are sent to them. The CSS classes in the content area and the JSON-LD types of the samples are compared; if the lowest similarity is below `TEMPLATE_SIMILARITY` (0.5), the group is considered to contain different page types and all of its URLs are analyzed. The "Full crawl" option on the start form turns sampling off.

When a local fixture test is needed, only a developer may set `ALLOW_LOCAL_TEST_URLS=true` in `.env`. This option is off by default and must not be enabled in an environment exposed to the public internet. The JavaScript rendering pass is enabled with `ENABLE_PLAYWRIGHT=true`; it only performs a controlled single-page pass on a root page whose text is nearly empty. If the Playwright browser binary is needed, also run `npx playwright install chromium`.

Completed reports for the same URL are cached for 30 minutes. The "Yeniden tara" (Rescan) button on the report skips this cache.

## Environment variables

All options are documented in `.env.example`. In production, change the PostgreSQL/Redis passwords, do not expose the services directly to the internet and keep `ALLOW_LOCAL_TEST_URLS=false`.

See [SaaS upgrade and deployment notes](docs/saas-upgrade.md) for projects, comparisons, sharing, targeted verification, schedules, notifications, legal/contact pages and legacy workspace ownership migration.
