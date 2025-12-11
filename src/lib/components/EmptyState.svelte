<script lang="ts">
  type EmptyStateVariant = "messages" | "channels" | "users";

  interface Props {
    variant: EmptyStateVariant;
    channelName?: string;
  }

  let { variant, channelName }: Props = $props();
</script>

{#if variant === "messages"}
  <div class="flex-1 flex flex-col items-center justify-center p-8 text-center">
    <!-- Chat bubble icon -->
    <div class="w-16 h-16 mb-4 rounded-full bg-volt/10 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-8 w-8 text-volt"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </div>
    <h3 class="text-lg font-semibold text-[var(--text-primary)] mb-2">
      {#if channelName}
        No messages in #{channelName} yet
      {:else}
        No messages yet
      {/if}
    </h3>
    <p class="text-[var(--text-secondary)] max-w-sm">
      Be the first to start the conversation! Type a message below to get things rolling.
    </p>
  </div>
{:else if variant === "channels"}
  <div class="flex flex-col items-center justify-center p-4 text-center">
    <!-- Folder icon -->
    <div class="w-12 h-12 mb-3 rounded-full bg-volt/10 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-6 w-6 text-volt"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    </div>
    <h3 class="text-sm font-medium text-[var(--text-primary)] mb-1">
      No channels yet
    </h3>
    <p class="text-xs text-[var(--text-secondary)]">
      Channels will appear here
    </p>
  </div>
{:else if variant === "users"}
  <div class="flex flex-col items-center justify-center p-3 text-center">
    <!-- Users icon -->
    <div class="w-10 h-10 mb-2 rounded-full bg-volt/10 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5 text-volt"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    </div>
    <p class="text-xs text-[var(--text-secondary)]">
      No one else is online
    </p>
  </div>
{/if}
