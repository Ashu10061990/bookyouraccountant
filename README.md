# BookYourAccountant

Marketplace connecting Indian MSMEs with verified accountants.

## Layout

| Path              | What                                                            |
| ----------------- | --------------------------------------------------------------- |
| `apps/api`        | Fastify service — MongoDB Atlas                                 |
| `apps/app`        | Vite SPA — the authenticated product; also the Capacitor source |
| `apps/web`        | Next.js — public marketing site (SEO)                           |
| `packages/shared` | Zod schemas, domain constants — the API/client contract         |
| `packages/ui`     | Design system                                                   |
| `packages/config` | eslint / tsconfig / tailwind presets                            |

## Getting started

```bash
nvm use          # Node 22+
pnpm install
pnpm dev
```

## Commands

```bash
pnpm test        # all tests
pnpm lint        # all linting
pnpm typecheck   # all type checking
pnpm build       # all builds
```

Architecture and rationale: `../docs/specs/2026-07-23-garp-architecture-design.md`
