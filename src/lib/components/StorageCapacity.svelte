<script lang="ts">
  import { storageCapacity } from "$lib/stores/storageCapacity.svelte";

  /**
   * Storage Capacity Indicator
   *
   * Displays browser storage usage with a progress bar and percentage.
   * Shows warning/critical states when storage is filling up.
   */

  // Determine bar color based on capacity
  const barColor = $derived.by(() => {
    if (storageCapacity.isCritical) return "bg-red-500";
    if (storageCapacity.isWarning) return "bg-amber-500";
    return "bg-volt";
  });

  // Status text
  const statusText = $derived.by(() => {
    if (storageCapacity.isCritical) return "Critical";
    if (storageCapacity.isWarning) return "Warning";
    return "OK";
  });

  // Status color for text
  const statusColor = $derived.by(() => {
    if (storageCapacity.isCritical) return "text-red-500";
    if (storageCapacity.isWarning) return "text-amber-500";
    return "text-[var(--text-tertiary)]";
  });
</script>

{#if storageCapacity.isSupported && !storageCapacity.isLoading}
  <div class="space-y-2">
    <div class="flex items-center justify-between text-xs">
      <span class="text-[var(--text-secondary)] flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        Storage
      </span>
      <span class={statusColor}>{statusText}</span>
    </div>

    <!-- Progress bar -->
    <div
      class="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={Math.round(storageCapacity.percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Storage usage: {Math.round(storageCapacity.percentage)}%"
    >
      <div
        class="h-full transition-all duration-300 rounded-full {barColor}"
        style="width: {Math.min(storageCapacity.percentage, 100)}%"
      ></div>
    </div>

    <!-- Usage details -->
    <div class="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
      <span>{storageCapacity.usageFormatted} used</span>
      <span>{Math.round(storageCapacity.percentage)}%</span>
    </div>

    <!-- Warning message -->
    {#if storageCapacity.isCritical}
      <p class="text-xs text-red-500 mt-1">
        Storage almost full. Old messages may not persist.
      </p>
    {:else if storageCapacity.isWarning}
      <p class="text-xs text-amber-500 mt-1">
        Storage filling up. Consider syncing messages.
      </p>
    {/if}
  </div>
{:else if storageCapacity.isLoading}
  <!-- Loading skeleton -->
  <div class="space-y-2 animate-pulse">
    <div class="h-3 w-16 bg-[var(--bg-tertiary)] rounded"></div>
    <div class="h-2 bg-[var(--bg-tertiary)] rounded-full"></div>
    <div class="h-3 w-24 bg-[var(--bg-tertiary)] rounded"></div>
  </div>
{/if}
