<script lang="ts">
  let { isPersistenceEnabled }: { isPersistenceEnabled: boolean } = $props();
  let dismissed = $state(false);
</script>

<!-- Live region for persistence warning announcement -->
<div
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
>
  {#if !isPersistenceEnabled && !dismissed}
    Limited offline support. Your messages will still send, but unsent drafts won't survive a page refresh.
  {/if}
</div>

{#if !isPersistenceEnabled && !dismissed}
  <div
    class="fixed top-0 left-0 right-0 z-40 bg-warning text-warning-foreground py-2 px-4 text-center text-sm flex items-center justify-center gap-2"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4 flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clip-rule="evenodd"
      />
    </svg>
    <span>
      <strong>Limited offline support:</strong> Messages will send normally, but unsent drafts won't survive a page refresh. Try a regular browser window for full offline support.
    </span>
    <button
      onclick={() => dismissed = true}
      class="ml-2 p-1 hover:bg-black/10 rounded transition-colors"
      aria-label="Dismiss warning"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>
{/if}
