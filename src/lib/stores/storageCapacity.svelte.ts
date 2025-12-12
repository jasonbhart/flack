import { browser } from "$app/environment";
import { formatBytes } from "$lib/utils/storageDetection";

/**
 * Storage Capacity Store
 *
 * Tracks browser storage usage using the Storage API (navigator.storage.estimate).
 * Provides reactive state for UI components to display capacity indicators.
 *
 * Features:
 * - Automatic polling for storage updates
 * - Percentage-based capacity tracking
 * - Warning thresholds (75%, 90%)
 * - Fallback for browsers without Storage API
 */

// Storage thresholds
const WARNING_THRESHOLD = 0.75; // 75% - show warning
const CRITICAL_THRESHOLD = 0.90; // 90% - show critical

// Polling interval (check every 30 seconds)
const POLL_INTERVAL_MS = 30_000;

// Reactive state
let usage = $state(0); // bytes used
let quota = $state(0); // bytes total
let isLoading = $state(true);
let isSupported = $state(false);
let lastUpdated = $state<Date | null>(null);

// Derived values
const percentage = $derived(quota > 0 ? (usage / quota) * 100 : 0);
const isWarning = $derived(quota > 0 && usage / quota >= WARNING_THRESHOLD);
const isCritical = $derived(quota > 0 && usage / quota >= CRITICAL_THRESHOLD);

// Fetch storage estimate
async function fetchEstimate(): Promise<void> {
  if (!browser || !navigator.storage?.estimate) {
    isLoading = false;
    return;
  }

  try {
    isSupported = true;
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage ?? 0;
    quota = estimate.quota ?? 0;
    lastUpdated = new Date();
  } catch (error) {
    console.warn("Failed to get storage estimate:", error);
  } finally {
    isLoading = false;
  }
}

// Polling timer
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (!browser || pollTimer) return;

  // Initial fetch
  fetchEstimate();

  // Start polling
  pollTimer = setInterval(fetchEstimate, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Auto-start polling on client
if (browser) {
  startPolling();
}

/**
 * Storage capacity store with reactive state
 */
export const storageCapacity = {
  /** Bytes currently used */
  get usage() {
    return usage;
  },

  /** Total quota in bytes */
  get quota() {
    return quota;
  },

  /** Usage as percentage (0-100) */
  get percentage() {
    return percentage;
  },

  /** True if usage >= 75% */
  get isWarning() {
    return isWarning;
  },

  /** True if usage >= 90% */
  get isCritical() {
    return isCritical;
  },

  /** True if Storage API is supported */
  get isSupported() {
    return isSupported;
  },

  /** True while fetching initial estimate */
  get isLoading() {
    return isLoading;
  },

  /** Last time estimate was updated */
  get lastUpdated() {
    return lastUpdated;
  },

  /** Human-readable usage string (e.g., "45.2 MB") */
  get usageFormatted() {
    return formatBytes(usage);
  },

  /** Human-readable quota string (e.g., "100 MB") */
  get quotaFormatted() {
    return formatBytes(quota);
  },

  /** Force refresh the storage estimate */
  refresh: fetchEstimate,

  /** Start polling for updates */
  startPolling,

  /** Stop polling for updates */
  stopPolling,

  /** Cleanup - stop polling */
  cleanup: stopPolling,
};
