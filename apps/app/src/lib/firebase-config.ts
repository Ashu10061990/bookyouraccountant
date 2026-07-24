/**
 * The Firebase **web** config. Public by design — it ships in every client
 * bundle and identifies the project; it is not a secret. Carried over from the
 * frozen legacy app (`BYA& Keiri/bya-new/src/lib/firebaseConfig.js`).
 *
 * `import.meta.env` overrides let a different project be pointed at without a
 * code change; unset, it uses the live `accountant-on-call` project.
 */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyABTTk9wOfsxHysOoCe4omD4zO-R22OS2k",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "accountant-on-call.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "accountant-on-call",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "accountant-on-call.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "450646620629",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:450646620629:web:523e811a3aee110af7e55c",
};

/** Host:port of a running Auth emulator, e.g. `127.0.0.1:9099`. Unset ⇒ real project. */
export const authEmulatorHost = env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
