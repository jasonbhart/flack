<script lang="ts">
  type SkeletonVariant = "channel" | "message" | "user";

  interface Props {
    variant: SkeletonVariant;
    count?: number;
  }

  let { variant, count = 1 }: Props = $props();

  // Generate array for iteration
  const items = $derived(Array.from({ length: count }, (_, i) => i));
</script>

{#if variant === "channel"}
  <!-- Channel skeleton: icon + text bar -->
  {#each items as i (i)}
    <div class="flex items-center gap-2 px-3 py-2 animate-pulse" aria-hidden="true">
      <div class="w-4 h-4 rounded bg-[var(--bg-tertiary)]"></div>
      <div class="h-4 rounded bg-[var(--bg-tertiary)]" style="width: {60 + (i % 3) * 20}%"></div>
    </div>
  {/each}
{:else if variant === "message"}
  <!-- Message skeleton: avatar + name + text lines -->
  {#each items as i (i)}
    <div class="flex items-start gap-3 px-4 py-3 animate-pulse" aria-hidden="true">
      <!-- Avatar -->
      <div class="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex-shrink-0"></div>
      <div class="flex-1 space-y-2">
        <!-- Name + timestamp -->
        <div class="flex items-center gap-2">
          <div class="h-4 w-24 rounded bg-[var(--bg-tertiary)]"></div>
          <div class="h-3 w-12 rounded bg-[var(--bg-tertiary)]"></div>
        </div>
        <!-- Message lines -->
        <div class="h-4 rounded bg-[var(--bg-tertiary)]" style="width: {75 + (i % 2) * 15}%"></div>
        {#if i % 2 === 0}
          <div class="h-4 w-1/2 rounded bg-[var(--bg-tertiary)]"></div>
        {/if}
      </div>
    </div>
  {/each}
{:else if variant === "user"}
  <!-- User skeleton: avatar + name -->
  {#each items as i (i)}
    <div class="flex items-center gap-2 px-2 py-1.5 animate-pulse" aria-hidden="true">
      <div class="w-2 h-2 rounded-full bg-[var(--bg-tertiary)]"></div>
      <div class="h-3.5 rounded bg-[var(--bg-tertiary)]" style="width: {50 + (i % 3) * 15}%"></div>
    </div>
  {/each}
{/if}
