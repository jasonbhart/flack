/**
 * Storage detection utilities for detecting IndexedDB availability and quota limits.
 * Used to detect private browsing mode and storage constraints.
 */

import { get, set, del } from "idb-keyval";

const TEST_KEY = "__storage_test__";
// 500ms timeout - IndexedDB can be slow on initial cold start
const DETECTION_TIMEOUT_MS = 500;

/**
 * Storage estimate from the StorageManager API
 */
export interface StorageEstimate {
  /** Used storage in bytes */
  usage: number;
  /** Total quota in bytes */
  quota: number;
  /** Percentage of quota used (0-100) */
  percentUsed: number;
}

/**
 * Test if IndexedDB is available and writable.
 * Private browsing in some browsers disables IndexedDB or makes it read-only.
 *
 * @returns true if IndexedDB can read/write, false otherwise
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  // Check if IndexedDB API exists
  if (typeof indexedDB === "undefined") {
    return false;
  }

  try {
    // Race against timeout to ensure fast detection
    const result = await Promise.race([
      testIndexedDBWritable(),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), DETECTION_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch {
    return false;
  }
}

/**
 * Test that IndexedDB can actually write and delete data.
 * Some browsers (Safari private mode) allow opening but fail on write.
 */
async function testIndexedDBWritable(): Promise<boolean> {
  try {
    const testValue = Date.now();
    await set(TEST_KEY, testValue);
    const readBack = await get(TEST_KEY);
    await del(TEST_KEY);
    return readBack === testValue;
  } catch {
    return false;
  }
}

/**
 * Get storage estimate using the StorageManager API.
 * Returns null if the API is not available.
 *
 * @returns Storage estimate or null if unavailable
 */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  // Check if StorageManager API is available
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();

    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      percentUsed,
    };
  } catch {
    return null;
  }
}

/**
 * Check if storage is nearly full (>90% used).
 *
 * @param threshold - Percentage threshold (default 90)
 * @returns true if storage exceeds threshold, false otherwise (including if unknown)
 */
export async function isStorageNearlyFull(threshold = 90): Promise<boolean> {
  const estimate = await getStorageEstimate();
  if (!estimate) {
    // If we can't get estimate, assume we're okay
    return false;
  }
  return estimate.percentUsed > threshold;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
