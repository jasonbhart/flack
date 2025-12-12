<script lang="ts">
  import type { MentionableUser } from "$lib/types/mentions";
  import { matchesQuery } from "$lib/utils/mentionParser";

  interface Props {
    /** Users available to mention in this channel */
    users: MentionableUser[];
    /** Current search query (without @) */
    query: string;
    /** Whether the autocomplete is visible */
    isOpen: boolean;
    /** Called when user selects a mention */
    onSelect: (user: MentionableUser) => void;
    /** Called when user closes the autocomplete (Escape) */
    onClose: () => void;
    /** Position relative to input (optional) */
    position?: { top: number; left: number };
  }

  let { users, query, isOpen, onSelect, onClose, position }: Props = $props();

  // Selected index for keyboard navigation
  let selectedIndex = $state(0);

  // Filter users by query
  const filteredUsers = $derived.by(() => {
    const filtered = users.filter((u) => matchesQuery(u.name, query));
    // Limit to 6 results for performance
    return filtered.slice(0, 6);
  });

  // Reset selected index when query changes
  $effect(() => {
    // Access query to track it
    query;
    selectedIndex = 0;
  });

  // Keep selected index in bounds
  $effect(() => {
    if (selectedIndex >= filteredUsers.length) {
      selectedIndex = Math.max(0, filteredUsers.length - 1);
    }
  });

  /**
   * Handle keyboard navigation - called by parent ChatInput
   * Returns true if event was handled
   */
  export function handleKeydown(e: KeyboardEvent): boolean {
    if (!isOpen) return false;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filteredUsers.length - 1);
        return true;
      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        return true;
      case "Enter":
      case "Tab":
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          onSelect(filteredUsers[selectedIndex]);
        }
        return true;
      case "Escape":
        e.preventDefault();
        onClose();
        return true;
      default:
        return false;
    }
  }

  function handleSelect(user: MentionableUser) {
    onSelect(user);
  }

  // Generate initials for avatar fallback
  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
</script>

{#if isOpen && filteredUsers.length > 0}
  <div
    role="listbox"
    aria-label="Mention suggestions"
    class="absolute z-50 w-64 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg shadow-lg overflow-hidden"
    style={position
      ? `bottom: ${position.top}px; left: ${position.left}px;`
      : "bottom: 100%; left: 0; margin-bottom: 4px;"}
  >
    <!-- Header -->
    <div
      class="px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] border-b border-[var(--border-default)]"
    >
      Members matching <span class="text-volt">@{query || "..."}</span>
    </div>

    <!-- User list -->
    <ul class="max-h-48 overflow-y-auto">
      {#each filteredUsers as user, index (user.id)}
        <li
          role="option"
          aria-selected={index === selectedIndex}
          class="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
            {index === selectedIndex
            ? 'bg-volt/20'
            : 'hover:bg-[var(--bg-tertiary)]'}"
          onclick={() => handleSelect(user)}
          onmouseenter={() => (selectedIndex = index)}
        >
          <!-- Avatar -->
          {#if user.avatarUrl}
            <img
              src={user.avatarUrl}
              alt=""
              class="w-6 h-6 rounded-full object-cover"
            />
          {:else}
            <div
              class="w-6 h-6 rounded-full bg-volt/30 text-volt flex items-center justify-center text-xs font-medium"
            >
              {getInitials(user.name)}
            </div>
          {/if}

          <!-- Name -->
          <span
            class="text-sm truncate {index === selectedIndex
              ? 'text-volt font-medium'
              : 'text-[var(--text-primary)]'}"
          >
            {user.name}
          </span>
        </li>
      {/each}
    </ul>

    <!-- Keyboard hints -->
    <div
      class="px-3 py-1.5 border-t border-[var(--border-default)] text-[10px] text-[var(--text-tertiary)] flex gap-3"
    >
      <span
        ><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">↑↓</kbd> Navigate</span
      >
      <span
        ><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Tab</kbd> Select</span
      >
      <span
        ><kbd class="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Esc</kbd> Close</span
      >
    </div>
  </div>
{/if}
