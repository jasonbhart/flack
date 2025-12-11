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
  sessionToken = $state<string | null>(null);
  user = $state<User | null>(null);
  isLoading = $state(true);
  private initialized = false;

  constructor() {
    // Initialize asynchronously from secure storage
    if (browser) {
      this.initFromStorage();
    }
  }

  /**
   * Initialize session from secure storage.
   * Called on app start to restore session.
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
          // Token expired - clear it
          await this.clearSession();
        } else {
          this.sessionToken = token;
        }
      }
    } catch (error) {
      console.error("Failed to load session from secure storage:", error);
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
