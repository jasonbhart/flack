<script lang="ts">
  import type { Id } from "../../../../convex/_generated/dataModel";
  import type { TodoWithOwner } from "$lib/utils/sortTodos";
  import type { TodoMember } from "$lib/types/todos";
  import DatePicker from "./DatePicker.svelte";
  import OwnerSelector from "./OwnerSelector.svelte";

  interface Props {
    todo: TodoWithOwner;
    channelMembers: TodoMember[];
    canDelete: boolean;
    ontoggle: () => void;
    onupdate: (updates: {
      text?: string;
      ownerId?: Id<"users"> | null;
      dueDate?: number | null;
    }) => void;
    ondelete: () => void;
  }

  let {
    todo,
    channelMembers,
    canDelete,
    ontoggle,
    onupdate,
    ondelete,
  }: Props = $props();

  // Editing state
  let isEditing = $state(false);
  let editText = $state("");
  let inputRef: HTMLInputElement | undefined = $state();

  function startEditing() {
    if (todo.completed) return;
    editText = todo.text;
    isEditing = true;
    requestAnimationFrame(() => {
      inputRef?.focus();
      inputRef?.select();
    });
  }

  function saveEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onupdate({ text: trimmed });
    }
    isEditing = false;
  }

  function cancelEdit() {
    isEditing = false;
    editText = "";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  function handleOwnerChange(ownerId: Id<"users"> | undefined) {
    onupdate({ ownerId: ownerId ?? null });
  }

  function handleDateChange(timestamp: number) {
    onupdate({ dueDate: timestamp });
  }

  function handleDateClear() {
    onupdate({ dueDate: null });
  }
</script>

<div
  class="group px-3 py-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
>
  <!-- Row 1: Checkbox + Text -->
  <div class="flex items-start gap-2">
    <!-- Checkbox -->
    <button
      type="button"
      onclick={ontoggle}
      class="flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 transition-colors {todo.completed
        ? 'bg-volt border-volt'
        : 'border-[var(--border-default)] hover:border-volt'}"
      aria-label={todo.completed ? "Mark as incomplete" : "Mark as complete"}
    >
      {#if todo.completed}
        <svg
          class="w-full h-full text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="3"
            d="M5 13l4 4L19 7"
          />
        </svg>
      {/if}
    </button>

    <!-- Title (text or input) -->
    <div class="flex-1 min-w-0">
      {#if isEditing}
        <input
          bind:this={inputRef}
          bind:value={editText}
          onblur={saveEdit}
          onkeydown={handleKeydown}
          type="text"
          maxlength={500}
          class="w-full px-2 py-1 bg-[var(--bg-primary)] text-[var(--text-primary)] border border-volt rounded focus:outline-none focus:ring-2 focus:ring-volt text-sm"
        />
      {:else}
        <button
          type="button"
          onclick={startEditing}
          disabled={todo.completed}
          class="w-full text-left text-sm leading-relaxed {todo.completed
            ? 'line-through text-[var(--text-tertiary)]'
            : 'text-[var(--text-primary)] hover:text-volt cursor-text'}"
        >
          {todo.text}
        </button>
      {/if}
    </div>

    <!-- Delete button for completed items (compact, inline) -->
    {#if todo.completed && canDelete}
      <button
        type="button"
        onclick={ondelete}
        class="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 transition-all"
        aria-label="Delete todo"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Row 2: Metadata (only for incomplete todos) -->
  {#if !todo.completed}
    <div class="flex items-center gap-2 mt-1.5 ml-7">
      <!-- Owner selector -->
      <OwnerSelector
        value={todo.ownerId}
        members={channelMembers}
        onchange={handleOwnerChange}
        compact={true}
      />

      <!-- Due date picker -->
      <DatePicker
        value={todo.dueDate}
        onchange={handleDateChange}
        onclear={handleDateClear}
        compact={true}
      />

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Delete button -->
      {#if canDelete}
        <button
          type="button"
          onclick={ondelete}
          class="flex-shrink-0 p-1.5 opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-500 transition-all rounded hover:bg-red-500/10"
          aria-label="Delete todo"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>
