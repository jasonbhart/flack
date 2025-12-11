import { browser } from "$app/environment";

/**
 * Responsive utility store for breakpoint detection and platform info
 *
 * Breakpoints:
 * - Mobile: < 768px
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px
 */

// Breakpoint constants
const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

// Reactive state
let viewportWidth = $state(browser ? window.innerWidth : 1024);

// Derived breakpoint flags
const isMobile = $derived(viewportWidth < MOBILE_BREAKPOINT);
const isTablet = $derived(viewportWidth >= MOBILE_BREAKPOINT && viewportWidth < DESKTOP_BREAKPOINT);
const isDesktop = $derived(viewportWidth >= DESKTOP_BREAKPOINT);

// Platform detection (computed once)
const isTauri = browser && typeof (window as any).__TAURI__ !== "undefined";
// Use userAgent for better longevity (navigator.platform is legacy)
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

// Set up resize listener on client
if (browser) {
  window.addEventListener("resize", handleResize, { passive: true });
}

/**
 * Responsive store with reactive breakpoint flags and platform detection
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
};
