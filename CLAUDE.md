# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Flack** is a team communication platform optimized for instant performance. Core philosophy: 0ms latency UI, offline-first messaging, minimal bloat.

## Tech Stack

- **Frontend:** Svelte 5 with Runes (fine-grained reactivity)
- **Backend:** Convex (real-time WebSocket push, handles conflicts)
- **Desktop:** Tauri v2 (native OS webview, <10MB binary)
- **Local Storage:** IndexedDB via `idb-keyval` (offline message queue)

## Architecture

### Optimistic UI Pattern

Messages appear instantly before server confirmation using a "merged state" approach:

1. **Local Truth:** Messages in IndexedDB pending queue (`status: 'sending'`)
2. **Server Truth:** Confirmed messages from Convex subscription
3. **Merged View:** Frontend combines both, deduplicating via `clientMutationId`

### Key Data Flow

```
User sends message
    → Generate UUID (clientMutationId)
    → Write to IndexedDB queue (survives refresh)
    → Render immediately (opacity-60)
    → Call Convex mutation
    → Backend checks idempotency via by_client_mutation_id index
    → On confirmation: remove from queue, full opacity
```

### Authentication Flow

Passwordless magic link auth with desktop fallback:

```
User enters email
    → Generate random token + 6-digit code
    → Hash both with SHA-256 (never store raw)
    → Send email via Resend with magic link + code
    → Web: Click link → /auth/verify#token=xxx → verify hash → create session
    → Desktop: Enter 6-digit code → verify hash → create session
```

**Security notes:**
- Tokens/codes hashed before storage (SHA-256)
- Sessions expire after 30 days
- Magic links expire after 15 minutes
- Codes are single-use (marked `used: true` after verification)

### Critical Files

- `convex/schema.ts` - Data schema with idempotency index on `clientMutationId`
- `convex/messages.ts` - Idempotent send mutation
- `convex/presence.ts` - Typing indicators/online status
- `convex/auth.ts` - Magic link auth, session management, token hashing
- `src/lib/stores/QueueManager.svelte.ts` - Offline-first pending queue using Svelte 5 `$state`
- `src/lib/stores/auth.svelte.ts` - Client-side auth state with localStorage persistence
- `src/routes/+page.svelte` - Merges server + local state via `$derived`
- `src/routes/auth/login/+page.svelte` - Email entry + 6-digit code input
- `src/routes/auth/verify/+page.svelte` - Magic link verification

### Schema Design Decisions

- `authorName` denormalized on messages for 0-latency rendering (no join needed)
- `reactions` stored as JSON array on message (avoids separate table/joins)
- `presence` table is ephemeral with timestamp-based cleanup
- All lookups designed for O(1) via indexes

## Design System: "Kinetic UI"

**Note:** This project uses **Tailwind CSS v4** with CSS-based configuration. Colors are defined in `src/routes/+layout.css` using the `@theme` directive, not in a `tailwind.config.js` file.

### Core Principles

- System fonts only (no webfont loading delay)
- Opacity-based optimistic states (60% = sending, 100% = confirmed)
- Minimal motion (<100ms transitions only)
- High density, 4px baseline grid

### Color Tokens (defined in layout.css)

- **Volt:** `#3B82F6` - Primary accent for active states
- **Ink:** Dark mode neutrals (900: `#0F172A` background)
- **Paper:** Light mode neutrals (50: `#F8FAFC` background)

## Environment Variables (Convex)

Set via `npx convex env set`:

- `RESEND_API_KEY` - Resend API key for sending emails
- `RESEND_EMAIL` - Verified sender email address
- `SITE_URL` - Frontend URL for magic links (defaults to `http://localhost:5173`)

## Development Commands

```bash
# Install dependencies
npm install

# Run Convex dev server (terminal 1)
npx convex dev

# Run Svelte dev server (terminal 2)
npm run dev

# Build for production
npm run build

# Run Tauri desktop app (requires Rust 1.85+)
npm run tauri dev
```

## Tauri Desktop Setup

Tauri v2 requires **Rust 1.85 or newer** (edition 2024 support). To set up:

```bash
# Install rustup (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Update to latest stable Rust
rustup update stable

# Verify version (should be 1.85+)
rustc --version

# Run Tauri desktop app
npm run tauri dev
```

If you see errors about `edition2024` or `feature is required`, your Rust version is outdated.

## Testing Offline Behavior

1. Turn off Wi-Fi
2. Send message (should appear at 60% opacity)
3. Reload app (message should persist from IndexedDB)
4. Turn on Wi-Fi (message syncs, returns to 100% opacity)
