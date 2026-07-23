import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Compile the workspace design system from source.
  transpilePackages: ["@bya/ui", "@bya/shared"],
  images: { formats: ["image/avif", "image/webp"] },
  poweredByHeader: false,
  // @bya/ui ships TS source with NodeNext-style ".js" specifiers pointing at
  // .ts/.tsx files (e.g. "./button.js"). Webpack only tries alternate
  // extensions when a specifier has none, so without this alias it fails to
  // resolve them (Vite/tsc/vitest already handle this pattern natively).
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
};

export default config;
