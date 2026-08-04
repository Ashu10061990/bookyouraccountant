import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper for the BYA product SPA (Phase 7 — Android/iOS shells).
 *
 * The web assets are bundled from `dist` (produced by `vite build`). The SPA
 * calls the API at build-time `VITE_API_BASE_URL` for everything, including
 * first-party OTP auth. For the CEO demo build, `VITE_API_BASE_URL`
 * is the public tunnel URL fronting the local API.
 */
const config: CapacitorConfig = {
  appId: "com.bookyouraccountant.app",
  appName: "BookYourAccountant",
  webDir: "dist",
};

export default config;
