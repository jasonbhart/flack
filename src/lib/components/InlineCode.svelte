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
  class="font-mono text-[0.9em] px-1.5 py-0.5 rounded"
  style="background-color: var(--code-header-bg); color: var(--code-text);"
>
  {code}
</code>
