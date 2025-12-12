import { browser } from "$app/environment";
import { onDestroy } from "svelte";

/**
 * Responsive utility store for breakpoint detection and platform info
 *
 * Breakpoints (match Tailwind defaults):
 * - Mobile: < 768px (md breakpoint)
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px (lg breakpoint)
 *
 * SSR Behavior:
 * - On server: defaults to desktop (1024px) to match CSS initial state
 * - On client: immediately syncs to actual viewport width
 * - Uses CSS media queries for initial render to avoid hydration mismatch
 *
 * To avoid layout flash, use CSS media queries for critical layout:
 * ```css
 * .sidebar { display: block; }
 * @media (max-width: 767px) { .sidebar { display: none; } }
 * ```
 *
 * Then use responsive.isMobile for JS-only behavior (drawer logic, focus, etc.)
 */

// Breakpoint constants (match Tailwind)
const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

// Track if we've hydrated (first client render complete)
let isHydrated = false;

// Reactive state - start with SSR-safe default (desktop)
// This matches CSS initial state to prevent layout shift
let viewportWidth = $state(browser ? window.innerWidth : DESKTOP_BREAKPOINT);

// Derived breakpoint flags
const isMobile = $derived(viewportWidth < MOBILE_BREAKPOINT);
const isTablet = $derived(viewportWidth >= MOBILE_BREAKPOINT && viewportWidth < DESKTOP_BREAKPOINT);
const isDesktop = $derived(viewportWidth >= DESKTOP_BREAKPOINT);

// Platform detection (computed once on client)
const isTauri = browser && typeof (window as any).__TAURI__ !== "undefined";
const isMacOS = browser && navigator.userAgent.includes("Mac");

// Debounced resize handler
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

function handleResize() {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  resizeTimeout = setTimeout(() => {
    viewportWidth = window.innerWidth;
  }, 100); // 100ms debounce
}

// Cleanup function for resize listener
let cleanupRegistered = false;

function ensureCleanup() {
  if (!browser || cleanupRegistered) return;
  cleanupRegistered = true;

  // Register cleanup - will be called when app unmounts
  // Note: For SPA this rarely fires, but handles HMR correctly
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", cleanup);
  }
}

function cleanup() {
  if (browser) {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("beforeunload", cleanup);
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
      resizeTimeout = null;
    }
  }
}

// Set up resize listener on client
if (browser) {
  window.addEventListener("resize", handleResize, { passive: true });
  ensureCleanup();
  isHydrated = true;
}

/**
 * Responsive store with reactive breakpoint flags and platform detection
 *
 * Usage in components:
 * ```svelte
 * <script>
 *   import { responsive } from "$lib/utils/responsive.svelte";
 * </script>
 *
 * <!-- Use CSS for layout, JS for behavior -->
 * <aside class="sidebar hidden md:block">
 *   {#if responsive.isHydrated}
 *     <!-- JS-dependent content -->
 *   {/if}
 * </aside>
 * ```
 */
export const responsive = {
  /** Current viewport width in pixels */
  get width() {
    return viewportWidth;
  },

  /** True if viewport < 768px */
  get isMobile() {
    return isMobile;
  },

  /** True if viewport 768px - 1023px */
  get isTablet() {
    return isTablet;
  },

  /** True if viewport >= 1024px */
  get isDesktop() {
    return isDesktop;
  },

  /** True if running in Tauri desktop app */
  get isTauri() {
    return isTauri;
  },

  /** True if running on macOS */
  get isMacOS() {
    return isMacOS;
  },

  /** True if client-side hydration is complete */
  get isHydrated() {
    return isHydrated;
  },

  /** Cleanup function - call in component onDestroy if needed */
  cleanup,
};
