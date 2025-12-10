import { browser } from "$app/environment";

const SESSION_KEY = "flack-session-token";

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

  constructor() {
    if (browser) {
      this.sessionToken = localStorage.getItem(SESSION_KEY);
    }
  }

  setSession(token: string, user: User) {
    this.sessionToken = token;
    this.user = user;
    if (browser) {
      localStorage.setItem(SESSION_KEY, token);
    }
  }

  setUser(user: User | null) {
    this.user = user;
    this.isLoading = false;
  }

  clearSession() {
    this.sessionToken = null;
    this.user = null;
    if (browser) {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  get isAuthenticated() {
    return !!this.user;
  }
}

export const authStore = new AuthStore();
