/**
 * Firebase access, split along the sync/async boundary (v0.19 PR3, D4 in
 * docs/design/PERF_PASS.md).
 *
 * This module deliberately contains NO static value import from any
 * `firebase/*` package. Every consumer that used to call the synchronous
 * `getFirebaseAuth()` / `getFirebaseFirestore()` was really asking one of two
 * different questions, and conflating them is what kept the whole SDK
 * (~670 KB of the entry document's scripts) in the first-paint bundle:
 *
 * 1. "Is Firebase configured?" — a synchronous read of NEXT_PUBLIC_* env
 *    values, needed at render time by the store factories and by
 *    `useCoachAuth` to decide which backend or copy to show. That is
 *    `isFirebaseConfigured()`, and it costs no SDK bytes.
 * 2. "Give me the client" — only ever needed inside an already-async flow (an
 *    effect, a store adapter method, a click handler). Those are
 *    `loadFirebaseAuth()` / `loadFirebaseFirestore()`, behind dynamic
 *    `import()`, so the SDK becomes its own chunk fetched on first use.
 *
 * The type-only imports below are erased at compile time and pull nothing
 * into the entry chunk; `src/__tests__/static-export-surface.test.ts` counts
 * dynamic imports, so `firebase` staying in `dependencies` stays justified.
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

function readConfig(): FirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/**
 * Whether Firebase client config is present, without loading a byte of the
 * SDK. Exactly the question the store factories and `useCoachAuth` need at
 * render time. When this is false the loaders below resolve to null, so the
 * app behaves precisely as it always has on an unconfigured deploy.
 */
export function isFirebaseConfigured(): boolean {
  return readConfig() !== null;
}

async function loadFirebaseApp(): Promise<FirebaseApp | null> {
  const config = readConfig();
  if (!config) {
    return null;
  }

  const { getApp, getApps, initializeApp } = await import("firebase/app");

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(config);
}

/** The Auth client, or null when Firebase is not configured. Loads the SDK
 * on first call; later calls hit the module cache. */
export async function loadFirebaseAuth(): Promise<Auth | null> {
  const app = await loadFirebaseApp();
  if (!app) {
    return null;
  }

  const { getAuth } = await import("firebase/auth");
  return getAuth(app);
}

/** The Firestore client, or null when Firebase is not configured. Loads the
 * SDK on first call; later calls hit the module cache. */
export async function loadFirebaseFirestore(): Promise<Firestore | null> {
  const app = await loadFirebaseApp();
  if (!app) {
    return null;
  }

  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(app);
}
