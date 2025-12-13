<script lang="ts">
  import { useConvexClient, useQuery } from "convex-svelte";
  import { api } from "../../../../convex/_generated/api";
  import type { Id } from "../../../../convex/_generated/dataModel";
  import FocusTrap from "../FocusTrap.svelte";
  import TodoInput from "./TodoInput.svelte";
  import TodoList from "./TodoList.svelte";

  interface Props {
    isOpen: boolean;
    channelId: Id<"channels"> | null;
    sessionToken: string | null;
    currentUserId: Id<"users"> | null;
    onclose: () => void;
  }

  let { isOpen, channelId, sessionToken, currentUserId, onclose }: Props =
    $props();

  const client = useConvexClient();

  // Query todos for the channel (skip when panel is closed to save resources)
  const todosQuery = useQuery(
    api.todos.getByChannel,
    () =>
      isOpen && channelId && sessionToken ? { channelId, sessionToken } : "skip"
  );

  // Query channel members for owner selector (skip when panel is closed)
  const membersQuery = useQuery(
    api.channelMembers.listMembers,
    () =>
      isOpen && channelId && sessionToken ? { channelId, sessionToken } : "skip"
  );

  // Convert members to the format expected by components
  const channelMembers = $derived(
    (membersQuery.data ?? [])
      .filter((m) => m.user) // Filter out any null users
      .map((m) => ({
        _id: m.user!._id,
        name: m.user!.name,
        avatarUrl: m.user!.avatarUrl,
      }))
  );

  // Check if current user is admin/owner in this channel
  const isAdmin = $derived.by(() => {
    if (!currentUserId || !membersQuery.data) return false;
    const membership = membersQuery.data.find((m) => m.userId === currentUserId);
    return membership?.role === "owner" || membership?.role === "admin";
  });

  // Handle escape key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onclose();
    }
  }

  // Handle backdrop click
  function handleBackdropClick() {
    onclose();
  }

  // Mutation handlers
  async function handleCreate(data: {
    text: string;
    ownerId?: Id<"users">;
    dueDate?: number;
  }) {
    if (!channelId || !sessionToken) return;

    try {
      await client.mutation(api.todos.create, {
        sessionToken,
        channelId,
        text: data.text,
        ownerId: data.ownerId,
        dueDate: data.dueDate,
      });
    } catch (err) {
      console.error("Failed to create todo:", err);
    }
  }

  async function handleToggle(todoId: Id<"channelTodos">) {
    if (!sessionToken) return;

    try {
      await client.mutation(api.todos.toggle, {
        sessionToken,
        todoId,
      });
    } catch (err) {
      console.error("Failed to toggle todo:", err);
    }
  }

  async function handleUpdate(
    todoId: Id<"channelTodos">,
    updates: {
      text?: string;
      ownerId?: Id<"users"> | null;
      dueDate?: number | null;
    }
  ) {
    if (!sessionToken) return;

    try {
      await client.mutation(api.todos.update, {
        sessionToken,
        todoId,
        text: updates.text,
        ownerId: updates.ownerId,
        dueDate: updates.dueDate,
      });
    } catch (err) {
      console.error("Failed to update todo:", err);
    }
  }

  async function handleDelete(todoId: Id<"channelTodos">) {
    if (!sessionToken) return;

    try {
      await client.mutation(api.todos.deleteTodo, {
        sessionToken,
        todoId,
      });
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  }
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
    onclick={handleBackdropClick}
    aria-label="Close todo panel"
    tabindex="-1"
  ></button>

  <!-- Panel -->
  <FocusTrap active={isOpen}>
    <div
      class="fixed z-50 bg-[var(--bg-secondary)] shadow-xl
             transform transition-transform duration-200 ease-out
             flex flex-col
             inset-0 md:inset-auto md:top-0 md:right-0 md:h-full md:w-full md:max-w-md"
      role="dialog"
      aria-modal="true"
      aria-label="Channel todos"
    >
      <!-- Header - more prominent on mobile -->
      <div
        class="flex items-center justify-between px-4 py-3 md:py-3 border-b border-[var(--border-default)]"
      >
        <!-- Mobile: Back button style, Desktop: X button -->
        <button
          type="button"
          onclick={onclose}
          class="md:hidden flex items-center gap-2 min-h-[2.75rem] min-w-[2.75rem] -ml-2 px-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span class="text-sm font-medium">Back</span>
        </button>
        <h2 class="text-lg font-semibold text-[var(--text-primary)] md:flex-none flex-1 text-center md:text-left">Todos</h2>
        <!-- Desktop close button -->
        <button
          type="button"
          onclick={onclose}
          class="hidden md:flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <!-- Spacer for mobile to balance the header -->
        <div class="md:hidden w-[2.75rem]"></div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto overscroll-contain">
        {#if todosQuery.isLoading}
          <div class="flex items-center justify-center py-12">
            <div
              class="w-8 h-8 border-2 border-volt border-t-transparent rounded-full animate-spin"
            ></div>
          </div>
        {:else if todosQuery.error}
          <div class="px-4 py-8 text-center">
            <p class="text-red-500">Failed to load todos</p>
            <p class="text-sm text-[var(--text-tertiary)] mt-1">
              {todosQuery.error.message}
            </p>
          </div>
        {:else if currentUserId}
          <!-- Todo Input -->
          <div class="px-3 md:px-4 py-3 border-b border-[var(--border-default)]">
            <TodoInput {channelMembers} onsubmit={handleCreate} />
          </div>

          <!-- Todo List -->
          <div class="px-1 md:px-2 py-2">
            <TodoList
              todos={todosQuery.data ?? []}
              {currentUserId}
              {channelMembers}
              {isAdmin}
              ontoggle={handleToggle}
              onupdate={handleUpdate}
              ondelete={handleDelete}
            />
          </div>
        {/if}
      </div>

      <!-- Safe area padding for mobile devices with home indicator -->
      <div class="md:hidden pb-[env(safe-area-inset-bottom)]"></div>
    </div>
  </FocusTrap>
{/if}
