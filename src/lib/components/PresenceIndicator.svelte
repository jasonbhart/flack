<script lang="ts">
  let {
    isOnline,
    size = "sm",
  }: {
    isOnline: boolean;
    size?: "sm" | "md";
  } = $props();

  const sizeClasses = $derived(size === "sm" ? "w-2 h-2" : "w-3 h-3");
</script>

<div
  class="rounded-full {sizeClasses}"
  class:bg-success={isOnline}
  class:bg-ink-400={!isOnline}
  aria-label={isOnline ? "Online" : "Offline"}
  role="img"
></div>
