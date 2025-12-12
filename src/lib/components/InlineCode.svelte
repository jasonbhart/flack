<script lang="ts">
  /**
   * InlineCode - Renders inline code spans with monospace styling
   *
   * Features:
   * - Monospace font
   * - Distinct background color
   * - Proper text escaping (handled by Svelte)
   */

  interface Props {
    /** The code content to display */
    code: string;
  }

  let { code }: Props = $props();
</script>

<code
  class="font-mono text-[0.9em] bg-ink-800/50 px-1.5 py-0.5 rounded text-[var(--text-primary)]"
>
  {code}
</code>
