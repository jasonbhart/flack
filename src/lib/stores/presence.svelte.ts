import type { Id } from "../../../convex/_generated/dataModel";

type HeartbeatMutationFn = (args: {
  channelId: Id<"channels">;
  type: "online" | "typing";
  userName?: string;
  sessionId: string;
}) => Promise<unknown>;

class PresenceManager {
  currentChannelId = $state<Id<"channels"> | null>(null);
  isTyping = $state(false);
  private sessionId: string;
  private userName: string;
  private heartbeatMutation: HeartbeatMutationFn | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTypingUpdate = 0;

  constructor() {
    if (typeof window !== "undefined") {
      // Generate a unique session ID for this device/tab
      // Stored in localStorage so it persists across page reloads but is unique per browser
      this.sessionId =
        localStorage.getItem("bolt-session-id") ??
        (() => {
          const id = crypto.randomUUID();
          localStorage.setItem("bolt-session-id", id);
          return id;
        })();
      // Get or generate username
      this.userName =
        localStorage.getItem("bolt-user-name") ??
        (() => {
          const name = `User-${this.sessionId.slice(0, 4)}`;
          localStorage.setItem("bolt-user-name", name);
          return name;
        })();
    } else {
      this.sessionId = "server";
      this.userName = "Anonymous";
    }
  }

  setHeartbeatMutation(fn: HeartbeatMutationFn) {
    this.heartbeatMutation = fn;
  }

  setChannel(channelId: Id<"channels"> | null) {
    this.currentChannelId = channelId;
    if (channelId) {
      this.sendHeartbeat();
    }
  }

  private async sendHeartbeat() {
    if (!this.heartbeatMutation || !this.currentChannelId) return;

    try {
      await this.heartbeatMutation({
        channelId: this.currentChannelId,
        type: this.isTyping ? "typing" : "online",
        userName: this.userName,
        sessionId: this.sessionId,
      });
    } catch {
      // Silently fail heartbeats
    }
  }

  getUserName() {
    return this.userName;
  }

  setUserName(name: string) {
    this.userName = name;
    if (typeof window !== "undefined") {
      localStorage.setItem("bolt-user-name", name);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setTyping(typing: boolean) {
    this.isTyping = typing;
    const now = Date.now();

    if (typing) {
      // Debounce typing updates to every 2s
      if (now - this.lastTypingUpdate > 2000) {
        this.sendHeartbeat();
        this.lastTypingUpdate = now;
      }
    } else {
      // Always send immediately when stopping typing
      this.sendHeartbeat();
    }
  }

  getSessionId() {
    return this.sessionId;
  }
}

export const presenceManager = new PresenceManager();
