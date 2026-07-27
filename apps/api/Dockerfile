# Multi-stage build for the BYA API (Fastify/Node) — deployed to AWS App Runner.
# Context is the monorepo root: `docker build -f apps/api/Dockerfile .`
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---- build: install workspace, build @bya/api and its internal deps ----
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@bya/api

# ---- runtime: run the built server ----
FROM base AS runtime
ENV NODE_ENV=development
ENV PORT=8080
ENV HOST=0.0.0.0
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 8080
# Health: GET /health (503s when DB disconnected)
CMD ["node", "dist/server.js"]
