<script lang="ts">
  import type { Id } from "../../../../convex/_generated/dataModel";
  import type { TodoMember } from "$lib/types/todos";

  interface Props {
    value: Id<"users"> | undefined;
    members: TodoMember[];
    onchange: (userId: Id<"users"> | undefined) => void;
  }

  let { value, members, onchange }: Props = $props();

  // Dropdown state
  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement | undefined = $state();
  let buttonRef: HTMLButtonElement | undefined = $state();

  // Find the currently selected member
  const selectedMember = $derived(
    value ? members.find((m) => m._id === value) : undefined
  );

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function selectMember(member: TodoMember | undefined) {
    onchange(member?._id);
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
      buttonRef?.focus();
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(e: MouseEvent) {
    if (
      dropdownRef &&
      !dropdownRef.contains(e.target as Node) &&
      !buttonRef?.contains(e.target as Node)
    ) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
</script>

<div class="relative">
  <!-- Trigger button -->
  <button
    bind:this={buttonRef}
    type="button"
    onclick={toggleDropdown}
    onkeydown={handleKeydown}
    class="flex items-center gap-2 px-2 py-1 min-h-[2.75rem] text-sm rounded border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors"
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    {#if selectedMember}
      {#if selectedMember.avatarUrl}
        <img
          src={selectedMember.avatarUrl}
          alt=""
          class="w-5 h-5 rounded-full object-cover"
        />
      {:else}
        <div
          class="w-5 h-5 rounded-full bg-volt/20 text-volt flex items-center justify-center text-xs font-medium"
        >
          {getInitials(selectedMember.name)}
        </div>
      {/if}
      <span class="text-[var(--text-primary)] whitespace-nowrap">
        {selectedMember.name}
      </span>
    {:else}
      <svg
        class="w-4 h-4 text-[var(--text-tertiary)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <span class="text-[var(--text-tertiary)] whitespace-nowrap">Assign</span>
    {/if}
    <svg
      class="w-4 h-4 text-[var(--text-tertiary)] ml-auto"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>

  <!-- Dropdown menu -->
  {#if isOpen}
    <div
      bind:this={dropdownRef}
      role="listbox"
      aria-label="Select owner"
      class="absolute z-50 mt-1 w-full min-w-[180px] max-h-60 overflow-auto bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg shadow-lg"
    >
      <!-- Unassigned option -->
      <button
        type="button"
        role="option"
        aria-selected={!value}
        onclick={() => selectMember(undefined)}
        class="w-full flex items-center gap-2 px-3 py-2 min-h-[2.75rem] text-sm text-left hover:bg-[var(--bg-tertiary)] transition-colors {!value
          ? 'bg-[var(--bg-tertiary)]'
          : ''}"
      >
        <div
          class="w-5 h-5 rounded-full border border-dashed border-[var(--border-default)] flex items-center justify-center"
        >
          <svg
            class="w-3 h-3 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M18 12H6"
            />
          </svg>
        </div>
        <span class="text-[var(--text-secondary)]">Unassigned</span>
      </button>

      <!-- Member options -->
      {#each members as member (member._id)}
        <button
          type="button"
          role="option"
          aria-selected={value === member._id}
          onclick={() => selectMember(member)}
          class="w-full flex items-center gap-2 px-3 py-2 min-h-[2.75rem] text-sm text-left hover:bg-[var(--bg-tertiary)] transition-colors {value ===
          member._id
            ? 'bg-[var(--bg-tertiary)]'
            : ''}"
        >
          {#if member.avatarUrl}
            <img
              src={member.avatarUrl}
              alt=""
              class="w-5 h-5 rounded-full object-cover"
            />
          {:else}
            <div
              class="w-5 h-5 rounded-full bg-volt/20 text-volt flex items-center justify-center text-xs font-medium"
            >
              {getInitials(member.name)}
            </div>
          {/if}
          <span class="text-[var(--text-primary)]">{member.name}</span>
        </button>
      {/each}

      {#if members.length === 0}
        <div class="px-3 py-2 text-sm text-[var(--text-tertiary)]">
          No members available
        </div>
      {/if}
    </div>
  {/if}
</div>
