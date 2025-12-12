<script lang="ts">
  /**
   * UrlLink - Renders a clickable URL link with security attributes
   *
   * Features:
   * - Opens in new tab with security attributes
   * - Styled with design system colors
   * - Hover state for affordance
   */

  interface Props {
    /** The URL to link to (must be sanitized) */
    url: string;
    /** Display text (defaults to url if not provided) */
    displayText?: string;
  }

  let { url, displayText }: Props = $props();

  // Use displayText if provided, otherwise show the URL
  const text = $derived(displayText || url);
</script>

<a
  href={url}
  target="_blank"
  rel="noopener noreferrer"
  class="text-volt underline hover:text-volt/80 transition-colors break-all"
>
  {text}
</a>
