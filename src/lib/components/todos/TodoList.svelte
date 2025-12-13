<script lang="ts">
  import type { Id } from "../../../../convex/_generated/dataModel";
  import type { TodoWithOwner } from "$lib/utils/sortTodos";
  import type { TodoMember } from "$lib/types/todos";
  import { sortTodos } from "$lib/utils/sortTodos";
  import TodoItem from "./TodoItem.svelte";

  interface Props {
    todos: TodoWithOwner[];
    currentUserId: Id<"users">;
    channelMembers: TodoMember[];
    isAdmin: boolean;
    ontoggle: (todoId: Id<"channelTodos">) => void;
    onupdate: (
      todoId: Id<"channelTodos">,
      updates: {
        text?: string;
        ownerId?: Id<"users"> | null;
        dueDate?: number | null;
      }
    ) => void;
    ondelete: (todoId: Id<"channelTodos">) => void;
  }

  let {
    todos,
    currentUserId,
    channelMembers,
    isAdmin,
    ontoggle,
    onupdate,
    ondelete,
  }: Props = $props();

  // Toggle state for showing completed todos
  let showCompleted = $state(false);

  // Split and sort todos
  const activeTodos = $derived(
    sortTodos(
      todos.filter((t) => !t.completed),
      currentUserId
    )
  );

  const completedTodos = $derived(
    todos.filter((t) => t.completed).sort((a, b) => {
      // Sort completed by completion time, most recent first
      return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    })
  );

  // Check if user can delete a todo (creator or admin/owner)
  function canDelete(todo: TodoWithOwner): boolean {
    return todo.createdBy === currentUserId || isAdmin;
  }
</script>

<div class="space-y-1">
  <!-- Active todos -->
  {#if activeTodos.length === 0 && completedTodos.length === 0}
    <div class="py-8 text-center text-[var(--text-tertiary)]">
      <svg
        class="w-12 h-12 mx-auto mb-3 opacity-50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
      <p>No todos yet</p>
      <p class="text-sm mt-1">Add a todo to get started</p>
    </div>
  {:else}
    {#each activeTodos as todo (todo._id)}
      <TodoItem
        {todo}
        {channelMembers}
        canDelete={canDelete(todo)}
        ontoggle={() => ontoggle(todo._id)}
        onupdate={(updates) => onupdate(todo._id, updates)}
        ondelete={() => ondelete(todo._id)}
      />
    {/each}
  {/if}

  <!-- Completed section toggle -->
  {#if completedTodos.length > 0}
    <div class="pt-2">
      <button
        type="button"
        onclick={() => (showCompleted = !showCompleted)}
        class="flex items-center gap-2 px-3 py-2 w-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
      >
        <svg
          class="w-4 h-4 transition-transform {showCompleted
            ? 'rotate-90'
            : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span>
          {showCompleted ? "Hide" : "Show"} {completedTodos.length} completed
        </span>
      </button>
    </div>

    <!-- Completed todos (collapsible) -->
    {#if showCompleted}
      <div class="space-y-1 opacity-60">
        {#each completedTodos as todo (todo._id)}
          <TodoItem
            {todo}
            {channelMembers}
            canDelete={canDelete(todo)}
            ontoggle={() => ontoggle(todo._id)}
            onupdate={(updates) => onupdate(todo._id, updates)}
            ondelete={() => ondelete(todo._id)}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>
