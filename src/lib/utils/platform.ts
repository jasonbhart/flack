import { browser } from "$app/environment";

/**
 * Platform detection utilities for feature switching between
 * web browser and Tauri desktop environments.
 */

/**
 * Check if running inside a Tauri desktop application.
 *
 * Tauri injects a global `__TAURI__` object at runtime. This check
 * is synchronous and works in both SSR and client contexts.
 *
 * @returns true if running in Tauri, false in browser or SSR
 *
 * @example
 * ```ts
 * if (isTauri()) {
 *   // Use native APIs
 *   const { sendNotification } = await import("@tauri-apps/plugin-notification");
 * } else {
 *   // Use web APIs
 *   new Notification("Hello");
 * }
 * ```
 */
export function isTauri(): boolean {
  // SSR safety: window doesn't exist on server
  if (!browser) return false;

  // Tauri v2 uses __TAURI_INTERNALS__ but also exposes __TAURI__
  // Check both for maximum compatibility
  return (
    typeof (window as any).__TAURI__ !== "undefined" ||
    typeof (window as any).__TAURI_INTERNALS__ !== "undefined"
  );
}

/**
 * Check if running in a standard web browser (not Tauri).
 *
 * @returns true if running in browser, false in Tauri or SSR
 */
export function isWeb(): boolean {
  return browser && !isTauri();
}

/**
 * Check if running in a server-side rendering context.
 *
 * @returns true during SSR, false in browser/Tauri
 */
export function isSSR(): boolean {
  return !browser;
}
