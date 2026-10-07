# CI images and manual deployment

`.github/workflows/ci-images.yml` runs on pushes to `main`. It installs the
lockfile with Node 22, generates Prisma, workspace declarations and Next.js route types, and runs
typecheck, lint and all Vitest tests. It also runs the existing crawl, failed-job
recovery and Redis failure regressions in the isolated `tests/compose.audit.yml`
environment. The production smoke script is not invoked: it defaults to the
production URL and creates crawl data there.

Only after verification succeeds does the publish job build both existing
Dockerfile targets and publish these Linux amd64 images:

- `ghcr.io/yasinkocak95/seoanalyzer-web`
- `ghcr.io/yasinkocak95/seoanalyzer-worker`

Both receive `main`, `latest`, and the full 40-character Git commit SHA as tags.
If `main` advances during a run, that older run publishes only its SHA tag;
it leaves the mutable `main`/`latest` tags to the run for the current main commit.
The workflow uses the automatically provided `GITHUB_TOKEN`; only the publish
job has `packages: write`. No server credentials or deployment jobs are included.
Both images build before either is pushed, but registry pushes are not atomic;
deploy a SHA only after the entire workflow succeeds.

## Server prerequisites

Keep the existing production `.env` and Docker volumes. Use Docker Compose
2.24.4 or newer (the existing override already uses `!override`). The production
override now removes local builds for web, worker and migrate. Migrate reuses
the worker image, which retains Prisma and the migration files in the existing
Dockerfile architecture. PostgreSQL and Redis still have no published host ports;
web remains bound to `127.0.0.1:3000`.

`IMAGE_TAG` defaults to `main`; pin a successful workflow's full SHA for a
repeatable deployment. `GHCR_IMAGE_PREFIX` defaults to
`ghcr.io/yasinkocak95/seoanalyzer` and can be overridden for a fork.

GHCR packages initially default to private. For anonymous server pulls, make
both packages public once in GitHub's package settings. If they stay private,
the server needs a one-time `docker login ghcr.io` with an account token having
`read:packages`; this is not a CI secret, and the workflow's short-lived
`GITHUB_TOKEN` should not be copied to the server.

## Manual deployment (not run by CI)

After merging these files and confirming the workflow for the desired commit
is successful, run in the server's repository with its production `.env`:

```sh
git pull --ff-only origin main
export IMAGE_TAG="$(git rev-parse HEAD)"; docker compose pull
docker compose up -d --no-build --wait
```

These commands pull the selected images, run the existing migration dependency,
and start web/worker only after migration succeeds. They do not build on the
server or delete volumes. If `main` advances, wait for that SHA's workflow before
using it, or set `IMAGE_TAG` explicitly to the desired successful full SHA.

Reference: [GitHub's GHCR publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
and [Docker's Compose merge rules](https://docs.docker.com/reference/compose-file/merge/).
