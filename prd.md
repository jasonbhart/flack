Here is your complete **Technical Kickoff Spec** for "Bolt." You can save this directly as `README.md` or `SPEC.md` in your repository root to guide development.

-----

# Project Bolt: Technical Specification

## 1\. Mission & Philosophy

**Goal:** Create a team communication platform that feels instant.
**The "Physics" of Bolt:**

* **0ms Latency:** The UI never waits for the server.
* **Offline-First:** Messages persist locally before they are sent.
* **Minimal Bloat:** No Electron. No heavy frameworks. Native webview (Tauri) + Svelte 5.

## 2\. The "Speed Stack"

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | **Svelte 5 (Runes)** | Fine-grained reactivity updates DOM without VDOM overhead. |
| **Backend** | **Convex** | Real-time push (WebSocket), handles concurrency/conflicts. |
| **Desktop** | **Tauri v2** | Uses OS native webview. Binary size \< 10MB (vs Electron's 150MB). |
| **Local DB** | **IndexedDB** | Persists the "pending queue" so messages survive app restarts. |

-----

## 3\. Data Schema (`convex/schema.ts`)

Optimized for read-speed (`O(1)` lookups) and preventing duplicates.

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users: Minimal profile info
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Channels: The rooms
  channels: defineTable({
    name: v.string(),
    teamId: v.id("teams"),
  }),

  // Messages: The core table
  messages: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    authorName: v.string(), // Denormalized for 0-latency rendering
    body: v.string(),

    // Threading: null = main chat, set = reply
    parentId: v.optional(v.id("messages")),

    // Idempotency: The client generates this UUID
    clientMutationId: v.optional(v.string()),

    // Reactions: JSON array to avoid joins
    reactions: v.optional(v.array(v.object({
      emoji: v.string(),
      users: v.array(v.id("users"))
    })))
  })
  .index("by_channel", ["channelId"])
  .index("by_client_mutation_id", ["clientMutationId"]), // Critical for deduping

  // Presence: Ephemeral table for "Who is online"
  presence: defineTable({
    userId: v.id("users"),
    user: v.string(),
    channelId: v.id("channels"),
    updated: v.number(), // timestamp
    data: v.union(
      v.object({ type: v.literal("online") }),
      v.object({ type: v.literal("typing"), text: v.optional(v.string()) })
    ),
  })
  .index("by_channel_updated", ["channelId", "updated"])
  .index("by_user", ["userId"]),
});
```

-----

## 4\. Backend Logic (Reliability & Presence)

### A. Idempotent Send (`convex/messages.ts`)

Prevents duplicate messages on spotty networks.

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    body: v.string(),
    channelId: v.id("channels"),
    clientMutationId: v.string(), // Client-generated UUID
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // ... auth checks ...

    // 1. Check if we already processed this specific UUID
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_client_mutation_id", (q) =>
        q.eq("clientMutationId", args.clientMutationId)
      )
      .unique();

    if (existing) return existing._id; // Success! (It was already done)

    // 2. Write if new
    const user = await ctx.db.query("users").withIndex("by_email", ...).unique();
    return await ctx.db.insert("messages", {
      body: args.body,
      channelId: args.channelId,
      userId: user._id,
      authorName: user.name,
      clientMutationId: args.clientMutationId,
    });
  },
});
```

### B. Presence Heartbeat (`convex/presence.ts`)

```typescript
export const heartbeat = mutation({
  args: { channelId: v.id("channels"), type: v.union(v.literal("online"), v.literal("typing")) },
  handler: async (ctx, args) => {
    // Upsert logic: Update timestamp if exists, Insert if new
    // See full implementation in chat history
  }
});
```

-----

## 5\. Frontend Engine (Svelte 5)

### A. The Persistent Queue (`lib/QueueManager.svelte.ts`)

Handles the "Offline-First" state.

```typescript
import { get, set } from 'idb-keyval';

class MessageQueue {
  queue = $state([]); // Reactive Rune

  constructor() {
    this.restore();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush());
    }
  }

  async enqueue(msg) {
    this.queue.push(msg);
    await this.persist();
    this.process(msg);
  }

  async process(msg) {
    try {
      // Call Convex Mutation here
      // On success, remove from queue
    } catch (e) {
      // On fail, mark status="failed"
    }
  }

  // ... restore/persist/flush methods ...
}
export const messageQueue = new MessageQueue();
```

### B. The Chat Window (`lib/ChatWindow.svelte`)

Merges Server Truth + Local Truth.

```svelte
<script lang="ts">
  import { useQuery } from "convex-svelte";
  import { api } from "../convex/_generated/api";
  import { messageQueue } from "./QueueManager.svelte";

  let { channelId } = $props();

  // 1. Server State
  const remoteMessages = useQuery(api.messages.list, { channelId });

  // 2. Merged State (The 0ms View)
  let allMessages = $derived([
    ...(remoteMessages.data || []),
    ...messageQueue.queue.filter(m => m.channelId === channelId)
  ]);
</script>

{#each allMessages as msg (msg._id)}
  <div class:opacity-50={msg.status === 'sending'}>
    {msg.body}
  </div>
{/each}
```

-----

## 6\. Development Roadmap

**Phase 1: The Core (Week 1)**

* [ ] Initialize Svelte 5 + Convex repo.
* [ ] Implement `schema.ts`.
* [ ] Build `ChatWindow.svelte` with basic Optimistic UI.
* [ ] Verify 0ms latency on "Enter".

**Phase 2: Reliability (Week 2)**

* [ ] Install `idb-keyval`.
* [ ] Implement `QueueManager` logic.
* [ ] Add `clientMutationId` to backend mutation.
* [ ] Test: Turn off Wi-Fi, send message, reload app, turn on Wi-Fi -\> Verify sync.

**Phase 3: Desktop Feel (Week 3)**

* [ ] Wrap in Tauri.
* [ ] Add Global Keyboard Shortcuts (`Ctrl+K`).
* [ ] Implement Presence (Typing indicators).
