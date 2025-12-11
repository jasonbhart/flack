import { browser } from "$app/environment";
import { secureStorage } from "./secureStorage.svelte";

// Session expiry (30 days in milliseconds)
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

class AuthStore {
  // Start as undefined (loading) - NOT null (logged out)
  // This prevents race condition where page redirects before storage check completes
  sessionToken = $state<string | null | undefined>(undefined);
  user = $state<User | null>(null);
  isLoading = $state(true);
  private initialized = false;

  constructor() {
    // Initialize asynchronously from secure storage
    if (browser) {
      this.initFromStorage();
    } else {
      // SSR: mark as not loading, no token
      this.sessionToken = null;
    }
  }

  /**
   * Initialize session from secure storage.
   * Called on app start to restore session.
   *
   * IMPORTANT: sessionToken starts as `undefined` (loading state).
   * This method sets it to either a valid token or `null` (logged out).
   * This prevents the race condition where the page redirects to login
   * before we've had a chance to check storage (especially on Tauri/Desktop).
   */
  async initFromStorage() {
    if (!browser || this.initialized) return;
    this.initialized = true;

    try {
      const token = await secureStorage.getToken();
      if (token) {
        // Check if expired
        const isExpired = await secureStorage.isExpired();
        if (isExpired) {
          // Token expired - clear it and mark as logged out
          await secureStorage.clearToken();
          this.sessionToken = null;
        } else {
          this.sessionToken = token;
        }
      } else {
        // No token found - explicitly mark as logged out
        this.sessionToken = null;
      }
    } catch (error) {
      console.error("Failed to load session from secure storage:", error);
      // Fail safe - mark as logged out
      this.sessionToken = null;
    }
  }

  /**
   * Set session after successful login.
   * Stores token in secure storage with expiry.
   */
  async setSession(token: string, user: User, expiresAt?: number) {
    this.sessionToken = token;
    this.user = user;

    if (browser) {
      try {
        const expiry = expiresAt ?? Date.now() + SESSION_EXPIRY_MS;
        await secureStorage.setToken(token, expiry);
      } catch (error) {
        console.error("Failed to save session to secure storage:", error);
        // Continue anyway - token is still in memory
      }
    }
  }

  setUser(user: User | null) {
    this.user = user;
    this.isLoading = false;
  }

  /**
   * Clear session on logout.
   * Removes token from secure storage.
   */
  async clearSession() {
    this.sessionToken = null;
    this.user = null;

    if (browser) {
      try {
        await secureStorage.clearToken();
      } catch (error) {
        console.error("Failed to clear session from secure storage:", error);
      }
    }
  }

  get isAuthenticated() {
    return !!this.user;
  }

  /**
   * Check if session is expired.
   * Triggers auto-logout if expired.
   */
  async checkExpiry(): Promise<boolean> {
    if (!this.sessionToken) return true;

    const isExpired = await secureStorage.isExpired();
    if (isExpired) {
      await this.clearSession();
      return true;
    }
    return false;
  }
}

export const authStore = new AuthStore();
