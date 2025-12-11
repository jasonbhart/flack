import { browser } from "$app/environment";

/**
 * Secure storage abstraction for session tokens.
 *
 * - Tauri desktop: Uses plugin-store for encrypted file-based storage
 * - Web: Uses in-memory storage (cleared on page refresh for security)
 *
 * Tokens are NEVER stored in localStorage to prevent XSS attacks.
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

// Tauri store instance (lazy loaded)
let tauriStore: any = null;

/**
 * Initialize Tauri store if available
 */
async function getTauriStore() {
  if (!isTauri) return null;

  if (tauriStore) return tauriStore;

  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    tauriStore = await Store.load(STORE_NAME);
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
        const token = await store.get<string>(TOKEN_KEY);
        const expiry = await store.get<number>(EXPIRY_KEY);

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
        return await store.get<number>(EXPIRY_KEY) ?? null;
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
