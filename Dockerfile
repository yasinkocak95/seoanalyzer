FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates procps fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build:packages

FROM base AS web-build
RUN npm run build -w @seo/web
FROM base AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
CMD ["node", "apps/web/server.js"]

FROM base AS worker-build
RUN npm run build -w @seo/worker
FROM base AS worker
ENV NODE_ENV=production
COPY --from=worker-build /app/apps/worker/dist /app/apps/worker/dist
CMD ["npm", "run", "start", "-w", "@seo/worker"]
