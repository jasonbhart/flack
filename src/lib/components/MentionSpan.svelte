<script lang="ts">
  import type { Id } from "../../../convex/_generated/dataModel";

  interface Props {
    /** The username to display (without @) */
    username: string;
    /** User ID if resolved */
    userId?: Id<"users">;
    /** Current user's ID for highlighting self-mentions */
    currentUserId?: Id<"users"> | null;
    /** Optional avatar URL for tooltip */
    avatarUrl?: string;
  }

  let { username, userId, currentUserId, avatarUrl }: Props = $props();

  // Check if this mention is for the current user
  const isSelfMention = $derived(
    currentUserId && userId && currentUserId === userId
  );

  // Generate initials for avatar fallback
  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  let showTooltip = $state(false);
  let tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleMouseEnter() {
    tooltipTimeout = setTimeout(() => {
      showTooltip = true;
    }, 300);
  }

  function handleMouseLeave() {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    showTooltip = false;
  }
</script>

<span
  class="relative inline-flex items-center"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocus={handleMouseEnter}
  onblur={handleMouseLeave}
  role="button"
  tabindex="0"
>
  <span
    class="px-0.5 rounded font-medium cursor-pointer transition-colors
      {isSelfMention
      ? 'bg-volt/30 text-volt hover:bg-volt/40'
      : 'bg-volt/15 text-volt/90 hover:bg-volt/25'}"
  >
    @{username}
  </span>

  <!-- Tooltip -->
  {#if showTooltip}
    <div
      class="absolute z-50 bottom-full left-0 mb-1.5 px-2.5 py-1.5 rounded-lg shadow-lg
             bg-[var(--bg-secondary)] border border-[var(--border-default)]
             whitespace-nowrap text-xs"
      role="tooltip"
    >
      <div class="flex items-center gap-2">
        {#if avatarUrl}
          <img
            src={avatarUrl}
            alt=""
            class="w-5 h-5 rounded-full object-cover"
          />
        {:else}
          <div
            class="w-5 h-5 rounded-full bg-volt/30 text-volt flex items-center justify-center text-[10px] font-medium"
          >
            {getInitials(username)}
          </div>
        {/if}
        <span class="text-[var(--text-primary)] font-medium">{username}</span>
        {#if isSelfMention}
          <span class="text-volt text-[10px]">(you)</span>
        {/if}
      </div>
      <!-- Arrow pointer -->
      <div
        class="absolute top-full left-3 w-0 h-0
               border-l-4 border-r-4 border-t-4
               border-transparent border-t-[var(--bg-secondary)]"
      ></div>
    </div>
  {/if}
</span>
