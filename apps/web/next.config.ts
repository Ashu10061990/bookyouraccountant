import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
  poweredByHeader: false,
};

// Deliberately no `transpilePackages` and no `experimental.extensionAlias`.
//
// Both existed because `@bya/ui` shipped raw TypeScript whose imports used
// NodeNext-style ".js" specifiers pointing at .tsx files ("./button.js" →
// button.tsx). Webpack only tries alternate extensions for specifiers that have
// none, so it needed the alias to resolve them.
//
// That workaround was webpack-only. Turbopack — the recommended dev bundler for
// Next 15 — ignores `experimental.extensionAlias` entirely and failed with
// "Can't resolve './button.js'". Configuring each bundler around a package that
// ships source is a losing game; the package now emits `dist/` like
// `@bya/shared` does, so every consumer just resolves plain JavaScript.
//
// This is the Phase 1 lesson a second time: `@bya/shared` published raw .ts,
// `pnpm build` was green and `pnpm start` crashed. `@bya/ui` was left as source
// and cost the same debt here.

export default config;
