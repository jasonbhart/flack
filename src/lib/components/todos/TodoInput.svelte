<script lang="ts">
  import type { Id } from "../../../../convex/_generated/dataModel";
  import type { TodoMember } from "$lib/types/todos";
  import DatePicker from "./DatePicker.svelte";
  import OwnerSelector from "./OwnerSelector.svelte";

  interface Props {
    channelMembers: TodoMember[];
    onsubmit: (data: {
      text: string;
      ownerId?: Id<"users">;
      dueDate?: number;
    }) => void;
  }

  let { channelMembers, onsubmit }: Props = $props();

  // Form state
  let text = $state("");
  let ownerId = $state<Id<"users"> | undefined>(undefined);
  let dueDate = $state<number | undefined>(undefined);
  let showOptions = $state(false);
  let inputRef: HTMLInputElement | undefined = $state();

  const canSubmit = $derived(text.trim().length > 0);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;

    onsubmit({
      text: trimmed,
      ownerId: ownerId,
      dueDate: dueDate,
    });

    // Clear form
    text = "";
    ownerId = undefined;
    dueDate = undefined;
    showOptions = false;

    // Refocus input
    requestAnimationFrame(() => {
      inputRef?.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function toggleOptions() {
    showOptions = !showOptions;
  }
</script>

<div class="space-y-2">
  <!-- Main input row -->
  <div class="flex items-center gap-2">
    <input
      bind:this={inputRef}
      bind:value={text}
      onkeydown={handleKeydown}
      type="text"
      placeholder="What needs to be done?"
      maxlength={500}
      class="flex-1 px-3 py-2 min-h-[2.75rem] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-volt focus:border-transparent placeholder:text-[var(--text-tertiary)]"
    />

    <!-- Options toggle button -->
    <button
      type="button"
      onclick={toggleOptions}
      class="min-h-[2.75rem] min-w-[2.75rem] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors {showOptions
        ? 'text-volt'
        : ''}"
      aria-label={showOptions ? "Hide options" : "Show options"}
      aria-expanded={showOptions}
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>
    </button>

    <!-- Submit button -->
    <button
      type="button"
      onclick={handleSubmit}
      disabled={!canSubmit}
      class="px-4 py-2 min-h-[2.75rem] bg-volt text-white font-medium rounded-lg hover:bg-volt/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Add
    </button>
  </div>

  <!-- Optional fields (expandable) -->
  {#if showOptions}
    <div
      class="flex items-center gap-3 px-2 py-2 bg-[var(--bg-tertiary)] rounded-lg"
    >
      <div class="flex items-center gap-2">
        <span class="text-xs text-[var(--text-tertiary)]">Owner:</span>
        <OwnerSelector
          value={ownerId}
          members={channelMembers}
          onchange={(id) => (ownerId = id)}
        />
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-[var(--text-tertiary)]">Due:</span>
        <DatePicker
          value={dueDate}
          onchange={(ts) => (dueDate = ts)}
          onclear={() => (dueDate = undefined)}
        />
      </div>
    </div>
  {/if}
</div>
