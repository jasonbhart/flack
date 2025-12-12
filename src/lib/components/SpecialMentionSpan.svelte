<script lang="ts">
  import type { SpecialMention } from "$lib/types/mentions";

  interface Props {
    /** The special mention type */
    type: SpecialMention;
  }

  let { type }: Props = $props();

  // Get display text for special mention
  const displayText = $derived(type === "channel" ? "@channel" : "@here");

  // Get description for tooltip
  const description = $derived(
    type === "channel"
      ? "Notifies all channel members"
      : "Notifies all online members"
  );
</script>

<span
  class="px-0.5 rounded font-medium cursor-default
         bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
  title={description}
>
  {displayText}
</span>
