<script lang="ts">
  import { useQuery } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import type { Id } from "../../../../convex/_generated/dataModel";

  interface Props {
    channelId: Id<"channels"> | null;
    sessionToken: string | null;
    onclick: () => void;
  }

  let { channelId, sessionToken, onclick }: Props = $props();

  // Query todos for the channel, skip if no channelId or sessionToken
  const todosQuery = useQuery(
    api.todos.getByChannel,
    () => (channelId && sessionToken
      ? { channelId, sessionToken }
      : "skip")
  );

  // Compute active (incomplete) todo count
  const activeCount = $derived(
    todosQuery.data?.filter((todo) => !todo.completed).length ?? 0
  );
</script>

<button
  type="button"
  {onclick}
  class="flex items-center gap-1.5 px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
  aria-label={activeCount > 0 ? `Todos (${activeCount} active)` : "Todos"}
>
  <svg
    class="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
  <span>Todos</span>
  {#if activeCount > 0}
    <span
      class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium bg-volt text-white rounded-full"
    >
      {activeCount}
    </span>
  {/if}
</button>
