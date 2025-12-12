/**
 * SystemTrayManager - Manages system tray badge for unread counts
 *
 * Platform behavior:
 * - macOS: Uses dock badge count (setBadgeCount)
 * - Linux: Uses dock badge count where supported (setBadgeCount)
 * - Windows: Badge not supported via this API (would need setOverlayIcon)
 *
 * Only active in Tauri desktop environment.
 */

import { browser } from "$app/environment";
import { isTauri } from "$lib/utils/platform";

class SystemTrayManager {
  private currentBadge = 0;
  private initialized = false;

  constructor() {
    if (browser && isTauri()) {
      this.initialized = true;
    }
  }

  /**
   * Set the badge count on the app dock/taskbar icon
   *
   * @param count - Number to display (0 to clear)
   */
  async setBadge(count: number): Promise<void> {
    if (!this.initialized) return;

    // Avoid redundant updates
    if (count === this.currentBadge) return;

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();

      // Use undefined to clear badge when count is 0
      await currentWindow.setBadgeCount(count > 0 ? count : undefined);
      this.currentBadge = count;
    } catch (error) {
      // Badge may not be supported on all platforms (e.g., some Linux DEs, Windows)
      // Fail silently as this is a non-critical feature
      console.debug("Failed to set badge count:", error);
    }
  }

  /**
   * Clear the badge from the app dock/taskbar icon
   */
  async clearBadge(): Promise<void> {
    await this.setBadge(0);
  }

  /**
   * Get the current badge count
   */
  getBadgeCount(): number {
    return this.currentBadge;
  }

  /**
   * Check if badge functionality is available
   */
  get isAvailable(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const systemTrayManager = new SystemTrayManager();
