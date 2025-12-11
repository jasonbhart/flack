import { browser } from "$app/environment";

/**
 * Secure storage abstraction for session tokens.
 *
 * Platform behavior:
 * - Tauri desktop: Uses plugin-store for encrypted file-based storage (persists)
 * - Web browser: Uses in-memory storage only (cleared on page refresh)
 *
 * ## Web Storage Security Trade-off
 *
 * On web, tokens are stored ONLY in memory (not localStorage/sessionStorage).
 * This is a deliberate HIGH SECURITY / LOW CONVENIENCE trade-off:
 *
 * Pros:
 * - XSS attacks cannot steal persisted tokens (nothing to steal)
 * - Token exposure window limited to current session
 * - Closing browser tab = automatic logout
 *
 * Cons:
 * - Users must re-authenticate on every page refresh
 * - Users must re-authenticate when opening new tabs
 * - Poor UX compared to typical web apps
 *
 * ## Alternatives (if persistence is needed on web)
 *
 * 1. localStorage: Accept XSS risk for better UX (most common)
 * 2. HTTP-only cookies: Requires server-side session management
 *    (different Convex auth flow, protects against XSS)
 * 3. sessionStorage: Persists during tab session but not across tabs
 *
 * Current choice prioritizes security for this demo app.
 * Production apps should evaluate based on threat model.
 */

// Storage keys
const TOKEN_KEY = "sessionToken";
const EXPIRY_KEY = "sessionExpiry";
const STORE_NAME = "flack-auth.json";

// Check if running in Tauri
const isTauri = browser && typeof (window as any).__TAURI__ !== "undefined";

// In-memory storage for web (secure fallback)
let memoryToken: string | null = null;
let memoryExpiry: number | null = null;

// Type for Tauri store interface (imported dynamically)
interface TauriStoreInterface {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
}

// Tauri store instance (lazy loaded)
let tauriStore: TauriStoreInterface | null = null;

/**
 * Initialize Tauri store if available
 */
async function getTauriStore(): Promise<TauriStoreInterface | null> {
  if (!isTauri) return null;

  if (tauriStore) return tauriStore;

  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    tauriStore = await Store.load(STORE_NAME) as unknown as TauriStoreInterface;
    return tauriStore;
  } catch (error) {
    console.warn("Failed to load Tauri store, falling back to memory storage:", error);
    return null;
  }
}

/**
 * Check if secure storage is available
 */
export async function isAvailable(): Promise<boolean> {
  if (!browser) return false;

  if (isTauri) {
    const store = await getTauriStore();
    return store !== null;
  }

  // Web always has in-memory available
  return true;
}

/**
 * Get the stored session token
 */
export async function getToken(): Promise<string | null> {
  if (!browser) return null;

  if (isTauri) {
    const store = await getTauriStore();
    if (store) {
      try {
        const token = await store.get(TOKEN_KEY) as string | undefined;
        const expiry = await store.get(EXPIRY_KEY) as number | undefined;

        // Check if expired
        if (expiry && expiry < Date.now()) {
          await clearToken();
          return null;
        }

        return token ?? null;
      } catch (error) {
        console.error("Failed to get token from Tauri store:", error);
        return null;
      }
    }
  }

  // Web: use memory storage
  if (memoryExpiry && memoryExpiry < Date.now()) {
    memoryToken = null;
    memoryExpiry = null;
    return null;
  }

  return memoryToken;
}

/**
 * Store a session token
 */
export async function setToken(token: string, expiresAt: number): Promise<void> {
  if (!browser) return;

  if (isTauri) {
    const store = await getTauriStore();
    if (store) {
      try {
        await store.set(TOKEN_KEY, token);
        await store.set(EXPIRY_KEY, expiresAt);
        await store.save();
        return;
      } catch (error) {
        console.error("Failed to set token in Tauri store:", error);
        // Fall through to memory storage
      }
    }
  }

  // Web: use memory storage
  memoryToken = token;
  memoryExpiry = expiresAt;
}

/**
 * Clear the stored session token
 */
export async function clearToken(): Promise<void> {
  if (!browser) return;

  if (isTauri) {
    const store = await getTauriStore();
    if (store) {
      try {
        await store.delete(TOKEN_KEY);
        await store.delete(EXPIRY_KEY);
        await store.save();
      } catch (error) {
        console.error("Failed to clear token from Tauri store:", error);
      }
    }
  }

  // Always clear memory storage too
  memoryToken = null;
  memoryExpiry = null;
}

/**
 * Get the token expiry time
 */
export async function getExpiry(): Promise<number | null> {
  if (!browser) return null;

  if (isTauri) {
    const store = await getTauriStore();
    if (store) {
      try {
        return (await store.get(EXPIRY_KEY) as number | undefined) ?? null;
      } catch (error) {
        return null;
      }
    }
  }

  return memoryExpiry;
}

/**
 * Check if token is expired
 */
export async function isExpired(): Promise<boolean> {
  const expiry = await getExpiry();
  if (!expiry) return true;
  return expiry < Date.now();
}

/**
 * Secure storage object with all methods
 */
export const secureStorage = {
  isAvailable,
  getToken,
  setToken,
  clearToken,
  getExpiry,
  isExpired,
};
