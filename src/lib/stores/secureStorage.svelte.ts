import { browser } from "$app/environment";

/**
 * Secure storage abstraction for session tokens.
 *
 * Platform behavior:
 * - Tauri desktop: Uses plugin-store for encrypted file-based storage (persists)
 * - Web browser: Uses localStorage for persistence across refreshes
 *
 * ## Web Storage Security Note
 *
 * localStorage is vulnerable to XSS attacks - if an attacker can run JS on your
 * page, they can steal the token. However, this is the standard approach for
 * most web apps (including Slack, Discord, etc.) because:
 *
 * 1. CSP headers mitigate XSS risk significantly
 * 2. Session tokens expire (30 days) limiting exposure window
 * 3. Users expect sessions to persist across page refreshes
 *
 * For higher security requirements, consider HTTP-only cookies with
 * server-side session management.
 */

// Storage keys
const TOKEN_KEY = "sessionToken";
const EXPIRY_KEY = "sessionExpiry";
const STORE_NAME = "flack-auth.json";

// Check if running in Tauri
const isTauri = browser && typeof (window as any).__TAURI__ !== "undefined";

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

  // Web: use localStorage
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiryStr = localStorage.getItem(EXPIRY_KEY);
    const expiry = expiryStr ? parseInt(expiryStr, 10) : null;

    // Check if expired
    if (expiry && expiry < Date.now()) {
      await clearToken();
      return null;
    }

    return token;
  } catch (error) {
    console.error("Failed to get token from localStorage:", error);
    return null;
  }
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
        // Fall through to localStorage
      }
    }
  }

  // Web: use localStorage
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, expiresAt.toString());
  } catch (error) {
    console.error("Failed to set token in localStorage:", error);
  }
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

  // Web: clear localStorage
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch (error) {
    console.error("Failed to clear token from localStorage:", error);
  }
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

  // Web: get from localStorage
  try {
    const expiryStr = localStorage.getItem(EXPIRY_KEY);
    return expiryStr ? parseInt(expiryStr, 10) : null;
  } catch (error) {
    return null;
  }
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
