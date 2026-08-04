/// <reference types="vite/client" />

// Vite's own `ImportMetaEnv` (vite/client.d.ts) falls back to an untyped
// index signature (`[key: string]: any`) for any key it doesn't know about,
// so every `import.meta.env.VITE_*` read in this app resolves to `any` unless
// the specific keys are declared here — this is Vite's documented pattern for
// typed env vars: https://vite.dev/guide/env-and-mode.html#intellisense-for-typescript
// All optional: every one of these is allowed to be unset (see .env.example),
// in which case the reading code falls back to a default via `??`.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
