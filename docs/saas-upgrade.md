# SaaS feature upgrade — local source report

No production service, database, migration, deployment or email delivery was changed during this work. No dependencies or secret values were added.

## Features and routes

| Requirement | Implementation |
| --- | --- |
| Crawl Comparison | `/karsilastir/[id]?onceki=…`: same owner and domain, older baseline, new/resolved/ongoing/worsened rules, affected URL additions/removals and score/KPI deltas. Partial crawls cannot claim resolution. Coverage differences are disclosed. |
| Shareable Reports | Owner-only `POST/DELETE /api/crawls/[id]/share`; `/shared#…` resolves through `POST /api/shared`. Random 256-bit capabilities, SHA-256 storage, 30-day expiry and revocation. Capability fragments never enter HTTP request URLs. The public projection excludes IDs, evidence, page content, export signatures and management actions. URL samples omit credentials, queries and fragments. |
| Fix Verification | `GET/POST /api/crawls/[id]/verify`: persisted per rule, targeted single URL or up to 100 affected URLs, safe fetch and existing page rules, Fixed / Still Present / Could Not Verify, timestamps and explicit scope. Site-wide checks return uncertainty rather than claiming a single-page check proves resolution. |
| Claude Summary | Existing Claude structured output, cache, generation claims, retries and regeneration retained. Completed crawls automatically enqueue TR and EN executive summaries. Prompts request reviewable title/meta/canonical/robots drafts. Missing keys preserve Coming soon / Yakında. |
| Project Dashboard | `/projeler`, `/projeler/[host]`: projects derived from owned Crawl records; latest crawl, score, unique critical rules, change, dates and paginated history. No duplicate Project model. |
| Health History | SVG score and critical-rule trends for completed crawls, missing-score gaps, empty state and accessible table values. No chart dependency. |
| Issue Grouping | Existing report groups augmented with `/blog/*`-style patterns, deduplicated analyzed URL counts, examples and expandable, progressively rendered details. Sampled-but-unanalysed URLs remain distinct. |
| Scheduled Crawls | `GET/POST/DELETE /api/projects/[host]/schedule`: UTC weekly/calendar-monthly plans, DB claims and transaction-level project locks, stable existing crawl job IDs, active-crawl suppression, DNS revalidation and enqueue repair. |
| Trust / Legal | `/about`, `/privacy`, `/terms`, `/contact`, footer links and TR/EN copy. `POST /api/contact` validates and stores real messages; it does not claim email delivery. |
| UI/UX | Existing card/button/brand system, responsive layout, native keyboard controls, select/textarea focus, busy/status/alert states, localized dates, global loading state, private no-store/no-referrer/noindex headers. |

## Storage and jobs

Additive Prisma migrations, in order:

1. `202610070002_report_sharing`: nullable Crawl.ownerHash, owner/domain index and ReportShare.
2. `202610070003_fix_verification`: FixVerification with unique crawl/rule key.
3. `202610070004_scheduled_crawls`: CrawlSchedule, optional Crawl.scheduleId, notification evaluation timestamp and NotificationEvent.
4. `202610070005_contact_requests`: ContactRequest inbox.

The existing `202610070001_ai_analysis` migration remains required. Findings, pages, URLs, scores, exports and AI storage are reused.

Workers use `seo-crawls`, existing `seo-ai-analysis`, and new `seo-fix-verification`. The existing worker runs schedule and recovery checks every 30 seconds; no extra daemon or external cron is needed. A paused/partial crawl holds off automatic project crawls until it is resolved. Disabling a plan prevents future scheduled runs; an already started crawl remains controllable through the existing crawl controls.

`NotificationEvent.type = SEO_HEALTH_CHANGED` records owner, domain, crawl ID, previous crawl ID, before/after score and critical-rule counts, and deltas. A completed scheduled crawl creates at most one event. Unchanged metrics are marked evaluated without an event. `deliveredAt = null` is a durable outbox for a future authorized consumer; mark it only after actual delivery. No email provider is simulated. Operators review ContactRequest records with `handledAt = null` and mark them after handling.

## Ownership and existing data

The original application has no account system or ownership metadata. New private crawls belong to an HttpOnly, SameSite=Strict, HTTPS-secure browser workspace cookie; only its hash is stored. This preserves the architecture without adding an unrelated authentication dependency. Cookie loss requires operator-assisted recovery; cross-device account login is outside this change.

Old crawls remain intact. A verified operator must map their IDs to the correct workspace hash before making them available under the new private boundary. Automatically assigning all legacy records to the first visitor would disclose private data and is deliberately avoided.

`scripts/assign-legacy-crawls.mjs` accepts `--owner-hash` and repeated `--crawl-id` arguments, previews eligible unowned records by default and requires `--apply` for writes. The hash is SHA-256 of the verified owner's workspace cookie, never the raw cookie. Already-owned records cannot be reassigned by this utility. Review ID ownership and keep the existing database backup before applying. No automatic migration deletes or copies existing crawls.

## Verification results

- `npm run db:generate`: passed.
- `npm run build:packages`: passed.
- `npm run build -w @seo/worker`: passed.
- `npm run typecheck`: passed across web, worker, shared, rules and DB.
- `npm run lint`: passed.
- `npx vitest run --config tests/vitest-local.config.mjs --configLoader native`: 230 tests, 36 suites passed. Includes existing crawl/export/AI/SSRF regressions, API integration with mocked infrastructure, ownership, share expiry/revocation, verification, schedule claims, events, TR/EN and rendering tests.
- Standard Vitest startup encountered Windows `spawn EPERM` in esbuild. The local fallback uses the already installed TypeScript compiler, native config loading, preserved symlinks and worker threads. No installed dependency or production configuration is patched.
- Next production compilation passed after fixing the browser/server import boundary. Full `next build` then stopped at TypeScript worker creation with Windows `spawn EPERM`. Independent typecheck passed; a full build must still run in an unrestricted build environment.
- Standalone `prisma validate` could not resolve `DATABASE_URL` in this shell (P1012). Client generation validated the model structure. No live PostgreSQL migration, DB/Redis end-to-end run, live Claude request or browser visual smoke test is claimed.

## Manual deployment steps — not executed

1. Back up the database and retain the previous release. Review the legacy ownership mapping above. Configure existing DATABASE_URL, REDIS_URL, NEXT_PUBLIC_APP_URL and EXPORT_SIGNING_SECRET securely; ANTHROPIC_API_KEY remains optional. Never use NEXT_PUBLIC for a provider or signing key.
2. In the release build environment run `npm ci`, `npm run db:generate`, `npm run build`, `npm run typecheck`, `npm run lint` and `npm test`. Run `prisma validate` with the configured datasource. Verify migrations against a disposable PostgreSQL database before the production migration.
3. Run `npm run db:migrate` through the existing migration deployment job. All migrations are additive; do not substitute `db:push`. Apply reviewed legacy ownership mappings using the operator-only utility. A rollback can redeploy the previous application without deleting the new columns/tables.
4. Deploy the web and existing worker from the same release after migrations. Keep HTTPS enabled and preserve Cookie headers through the reverse proxy. Preserve URL fragments in copied sharing links; do not log POST bodies containing capabilities.
5. Smoke-test two private workspaces, TR/EN reports and PDF/Word/CSV exports, same-domain comparison, sharing and revocation, targeted verification, dashboard/history and contact storage. With Claude disabled, check Coming soon; when intentionally enabled, check automatic TR/EN generation, cache and regeneration.
6. In a staging database set a test schedule due, verify one job under concurrent workers and verify a health event on changed metrics. Confirm DNS/private-address rejection and enqueue recovery. Connect an actual notification consumer only when a real provider is available and explicitly authorized.

An exact source-file manifest is in `docs/saas-changed-files.txt`. Unrelated untracked image/icon assets that appeared during the session were left untouched and are excluded from that manifest.
