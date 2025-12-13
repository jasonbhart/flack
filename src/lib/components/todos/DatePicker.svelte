<script lang="ts">
  import { formatDueDate, getDueDateClasses } from "$lib/utils/formatDueDate";

  interface Props {
    value: number | undefined;
    onchange: (timestamp: number) => void;
    onclear: () => void;
  }

  let { value, onchange, onclear }: Props = $props();

  // Reference to the hidden date input
  let dateInputRef: HTMLInputElement | undefined = $state();

  // Format the current value for display
  const formatted = $derived(formatDueDate(value));

  // Convert timestamp to YYYY-MM-DD format for date input (using local time, not UTC)
  const dateInputValue = $derived(() => {
    if (!value) return "";
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  function handleDateChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.value) {
      // Parse the date and convert to timestamp (start of day in local timezone)
      const [year, month, day] = input.value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      onchange(date.getTime());
    }
  }

  function openDatePicker() {
    dateInputRef?.showPicker();
  }

  function handleClear(e: MouseEvent) {
    e.stopPropagation();
    onclear();
  }
</script>

<div class="relative inline-flex items-center">
  <!-- Hidden native date input for accessibility -->
  <input
    bind:this={dateInputRef}
    type="date"
    value={dateInputValue()}
    onchange={handleDateChange}
    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    aria-label="Select due date"
  />

  <!-- Visible button that triggers the date picker -->
  <button
    type="button"
    onclick={openDatePicker}
    class="flex items-center gap-1 px-2 py-1 min-h-[2.75rem] text-sm rounded border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors {formatted
      ? getDueDateClasses(formatted.status)
      : 'text-[var(--text-tertiary)]'}"
    aria-haspopup="dialog"
  >
    <svg
      class="w-4 h-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
    <span class="whitespace-nowrap">
      {formatted ? formatted.text : "Add date"}
    </span>
  </button>

  <!-- Clear button (only when date is set) -->
  {#if value}
    <button
      type="button"
      onclick={handleClear}
      class="ml-1 p-1 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
      aria-label="Clear due date"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  {/if}
</div>
