import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { authEmulatorHost, firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** True when pointed at a local Auth emulator — real project untouched. */
export const usingEmulator = authEmulatorHost !== undefined;

if (usingEmulator) {
  connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
  // The emulator has no reCAPTCHA; let phone sign-in skip app verification.
  auth.settings.appVerificationDisabledForTesting = true;
}

// Durable across reloads; a slow write must never block sign-in, so failures
// are logged, not thrown (no silent catch).
setPersistence(auth, browserLocalPersistence).catch((error: unknown) => {
  console.warn("auth persistence init failed:", error);
});
