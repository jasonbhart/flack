This is a frontend design system specification meant to accompany the technical spec. It translates the technical goals of "0ms latency," "offline-first," and "minimal bloat" into visual and interactive principles.

You can save this as `DESIGN.md` in your repository root.

-----

# Flack Design System: "Kinetic UI"

## 1\. Design Philosophy

The core design principle of Flack is **Immediacy**. The interface should feel like a direct extension of the user's thought process. If the technical goal is 0ms latency, the design goal is **0ms cognitive load**.

Every pixel needs to justify its existence. We prioritized density, clarity, and native integration over decoration.

### Key Principles

1. **Speed is the Aesthetic:** The UI is minimalist not as a style choice, but for performance. We use system fonts to avoid loading webfonts. We use CSS-driven states instead of heavy JavaScript animations.
2. **Honest States:** The user must instantly know the status of their data. A message that hasn't reached the server must *look* different than one that has.
3. **Native Feel:** Because we are using Tauri, the app shouldn't feel like a website trapped in a box. It should respect OS window controls, use native-feeling rounded corners, and blend into the desktop environment.
4. **High Density, High Contrast:** This is a work tool. Information density is high. Contrast is managed carefully to allow high density without overwhelming the eye.

-----

## 2\. The "Speed Theme" (Tailwind CSS Config Base)

We will use CSS variables and Tailwind utilities to define the theme. This allows easy switching between dark/light modes and keeps the bundle small.

### A. Color Palette

The palette is utilitarian with one "energy" color.

**The Accent: "Volt"**
An energetic electric blue used sparingly for primary actions, active states, and highlighting new information.

**Neutral Rails (Slate)**
We avoid pure black (\#000000) to reduce eye strain. We use deep slate grays for dark mode and cool grays for light mode.

```javascript
// tailwind.config.js snippet idea
theme: {
  colors: {
    // The Energy Source
    volt: {
      DEFAULT: '#3B82F6', // Intense blue
      muted: '#60A5FA',   // For dark mode accents
      subtle: '#DBEAFE',  // Light backgrounds
    },
    // Dark Mode Rail
    ink: {
      900: '#0F172A', // App Background (Dark)
      800: '#1E293B', // Sidebar / Panels
      700: '#334155', // Borders / Inputs
      400: '#94A3B8', // Secondary Text
      100: '#F1F5F9', // Primary Text (Dark Mode)
    },
    // Light Mode Rail
    paper: {
      50: '#F8FAFC',  // App Background (Light)
      100: '#F1F5F9', // Sidebar
      200: '#E2E8F0', // Borders
      800: '#1E293B', // Primary Text (Light Mode)
    },
    // Utility
    danger: '#EF4444',
    success: '#22C55E',
  }
}
```

### B. Typography: The System Stack

To guarantee 0ms loading and a native feel, we will not use webfonts. We rely on the OS's optimized font stack.

```css
/* CSS Base */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
```

**Hierarchy:**
Hierarchy is established through weight and color, rarely through dramatic size changes.

* **H1 (Channel Names):** Text-lg, Bold, Primary Color.
* **Body (Messages):** Text-base, Regular, Primary Color.
* **Meta (Timestamps/Author Names):** Text-sm, Medium/Regular, Secondary Color.

### C. Spacing & Density

We use a tight 4px baseline grid.

* **Container Padding:** Small (e.g., `p-4` or 16px).
* **Message Spacing:** Tight. Messages from the same author should bunch together.
* **Sidebar Density:** High. Channel lists should be compact (`py-1`).

-----

## 3\. Core Components & Optimistic States

This is where the "0ms Latency" philosophy is visualized.

### A. The Message Bubble & Optimistic UI

The technical spec mentions a "Merged State" (Server Truth + Local Truth). The design must reflect this.

**1. The "Sending" State (Local Truth)**
When a user hits enter, the message appears *instantly*. It hasn't reached Convex yet.

* **Visual Cue:** The entire message block should be slightly translucent.
* **Implementation:** `class:opacity-60={msg.status === 'sending'}`
* *Why opacity?* It's subtle. It doesn't add clutter (like spinning icons), but it clearly tells the user "this isn't quite solid yet."

**2. The "Confirmed" State (Server Truth)**
When Convex acknowledges the message.

* **Visual Cue:** The message snaps to full opacity (opacity-100). No checkmarks, no "sent" text. The return to normalcy is the confirmation.

**3. The "Failed" State (Offline/Error)**
If the IndexedDB write fails or the network is permanently down.

* **Visual Cue:** Opacity returns to 100%, text turns danger-red, and a small retry icon appears.

### B. The Chat Input Area (The Cockpit)

This is the most important interactive element. It needs to feel robust.

* **Style:** Instead of a thin border, use a slightly distinct background color from the main chat area to give it weight.
* **Focus:** When active, a sharp, thin "Volt" colored border appears.
* **Size:** Minimal height, expanding upwards automatically as the user types multi-line messages.

### C. The Sidebar (Navigation)

* **Tauri Integration:** The top of the sidebar should align perfectly with the OS window controls (traffic lights on macOS). The sidebar background color should extend to the top edge of the window.
* **Active Channel:** Highlighted with a subtle Volt-tinted background and bold text.
* **Unread Indicators:** A simple, small Volt-colored dot next to the channel name.

### D. Presence & Typing Indicators

Presence needs to be highly visible but non-intrusive.

* **Online Status:** A small green (or Volt) ring around the user avatar.
* **Typing Indicator:**
  * *Placement:* At the very bottom of the chat history, just above the input box.
  * *Animation:* A very subtle, low-frame-rate pulse of three dots. Do not use bouncy, high-motion animations that distract from reading actual messages.

-----

## 4\. Motion Guidelines (The "No-Motion" Policy)

To achieve the feeling of instantaneity, motion must be used extremely sparingly.

**FORBIDDEN:**

* Fading in pages or modals.
* Bouncy transitions when opening sidebars.
* Elements moving continuously on screen.

**ALLOWED (Sub-100ms):**

* **Message Arrival:** When a new message arrives, it appears instantly. The scroll position adjusts instantly.
* *Optional Polish:* A tiny, near-instant (50ms) upward shift of existing messages to make room for the new one can make the arrival feel less jarring, but start without it.

-----

## 5\. Implementation Checklist for Week 1

When building the Svelte components, ensure these classes are ready:

1. [ ] Define `tailwind.config.js` with the Volt and Slate palettes.
2. [ ] Set up global CSS to use the system font stack.
3. [ ] Create a dark/light mode toggle that swaps CSS variables on the `<html>` element.
4. [ ] Build the `MessageItem.svelte` component with a prop for `status="sending|sent|failed"` that toggles a tailwind opacity utility.
