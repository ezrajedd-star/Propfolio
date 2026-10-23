# syntax=docker/dockerfile:1.7
# Propfolio — one image, two entrypoints: the web app (default) and the worker.

FROM node:22.21.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

# Web app: the minimal Next.js standalone server.
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# Worker and one-off tasks (migrations, seed): full dependencies + sources.
FROM build AS worker
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app && chown -R app:app /app
USER app
CMD ["pnpm", "worker"]
