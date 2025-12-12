<script lang="ts">
  import { notificationService } from "$lib/services/NotificationService.svelte";

  // Reactive bindings to service state
  let permission = $derived(notificationService.permission);
  let enabled = $derived(notificationService.enabled);
  let notifyAllMessages = $derived(notificationService.notifyAllMessages);
  let soundEnabled = $derived(notificationService.soundEnabled);
  let isSupported = $derived(notificationService.isSupported);

  async function handleRequestPermission() {
    await notificationService.requestPermission();
  }

  function handleToggleEnabled(e: Event) {
    const target = e.target as HTMLInputElement;
    notificationService.setEnabled(target.checked);
  }

  function handleToggleAllMessages(e: Event) {
    const target = e.target as HTMLInputElement;
    notificationService.setNotifyAllMessages(target.checked);
  }

  function handleToggleSound(e: Event) {
    const target = e.target as HTMLInputElement;
    notificationService.setSoundEnabled(target.checked);
  }
</script>

<div class="space-y-4">
  <h3 class="text-sm font-medium text-paper-200 uppercase tracking-wide">
    Notifications
  </h3>

  {#if !isSupported}
    <p class="text-sm text-paper-500">
      Notifications are not supported in your browser.
    </p>
  {:else if permission === "denied"}
    <div class="bg-ink-800 rounded-lg p-4 border border-ink-700">
      <div class="flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fill-rule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clip-rule="evenodd" />
        </svg>
        <div>
          <p class="text-sm text-paper-300">
            Notifications are blocked
          </p>
          <p class="mt-1 text-xs text-paper-500">
            To enable notifications, click the lock icon in your browser's address bar and allow notifications for this site.
          </p>
        </div>
      </div>
    </div>
  {:else}
    {#if permission === "default"}
      <button
        onclick={handleRequestPermission}
        class="w-full px-4 py-2 text-sm font-medium bg-volt text-ink-900 rounded-lg hover:bg-volt/90 transition-colors"
      >
        Enable Notifications
      </button>
    {/if}

    <div class="space-y-3">
      <!-- Master toggle -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-sm text-paper-300">Enable notifications</span>
        <input
          type="checkbox"
          checked={enabled && permission === "granted"}
          disabled={permission !== "granted"}
          onchange={handleToggleEnabled}
          class="w-10 h-5 bg-ink-700 rounded-full relative cursor-pointer appearance-none checked:bg-volt transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            before:content-[''] before:absolute before:w-4 before:h-4 before:bg-paper-200 before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5"
        />
      </label>

      <!-- Notify for all messages -->
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <span class="text-sm text-paper-300">Notify for all messages</span>
          <p class="text-xs text-paper-500">When off, only @mentions notify</p>
        </div>
        <input
          type="checkbox"
          checked={notifyAllMessages}
          disabled={!enabled || permission !== "granted"}
          onchange={handleToggleAllMessages}
          class="w-10 h-5 bg-ink-700 rounded-full relative cursor-pointer appearance-none checked:bg-volt transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            before:content-[''] before:absolute before:w-4 before:h-4 before:bg-paper-200 before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5"
        />
      </label>

      <!-- Sound toggle -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-sm text-paper-300">Play sound</span>
        <input
          type="checkbox"
          checked={soundEnabled}
          disabled={!enabled || permission !== "granted"}
          onchange={handleToggleSound}
          class="w-10 h-5 bg-ink-700 rounded-full relative cursor-pointer appearance-none checked:bg-volt transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            before:content-[''] before:absolute before:w-4 before:h-4 before:bg-paper-200 before:rounded-full before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-5"
        />
      </label>
    </div>

    {#if permission === "granted" && enabled}
      <p class="text-xs text-paper-500">
        Notifications are enabled. You'll be alerted when new messages arrive.
      </p>
    {/if}
  {/if}
</div>
