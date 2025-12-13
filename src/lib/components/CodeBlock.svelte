<script lang="ts">
  /**
   * CodeBlock - Renders fenced code blocks with optional syntax highlighting
   *
   * Features:
   * - Optional language header
   * - Copy to clipboard button
   * - Horizontal scroll on overflow
   * - Preserves whitespace
   * - Syntax highlighting via highlight.js (lazy loaded)
   */

  interface Props {
    /** The code content to display */
    code: string;
    /** Optional language identifier for syntax highlighting */
    language?: string;
  }

  let { code, language }: Props = $props();

  let copied = $state(false);
  let highlightedCode = $state<string | null>(null);
  let hljs: typeof import("highlight.js").default | null = $state(null);

  // Lazy load highlight.js when language is specified
  $effect(() => {
    if (language && !hljs) {
      import("highlight.js/lib/core").then(async (mod) => {
        const hljsCore = mod.default;

        // Register common languages
        const languages = await Promise.all([
          import("highlight.js/lib/languages/javascript"),
          import("highlight.js/lib/languages/typescript"),
          import("highlight.js/lib/languages/python"),
          import("highlight.js/lib/languages/rust"),
          import("highlight.js/lib/languages/go"),
          import("highlight.js/lib/languages/json"),
          import("highlight.js/lib/languages/css"),
          import("highlight.js/lib/languages/xml"), // HTML
          import("highlight.js/lib/languages/bash"),
          import("highlight.js/lib/languages/sql"),
          import("highlight.js/lib/languages/yaml"),
          import("highlight.js/lib/languages/markdown"),
        ]);

        hljsCore.registerLanguage("javascript", languages[0].default);
        hljsCore.registerLanguage("js", languages[0].default);
        hljsCore.registerLanguage("typescript", languages[1].default);
        hljsCore.registerLanguage("ts", languages[1].default);
        hljsCore.registerLanguage("python", languages[2].default);
        hljsCore.registerLanguage("py", languages[2].default);
        hljsCore.registerLanguage("rust", languages[3].default);
        hljsCore.registerLanguage("rs", languages[3].default);
        hljsCore.registerLanguage("go", languages[4].default);
        hljsCore.registerLanguage("json", languages[5].default);
        hljsCore.registerLanguage("css", languages[6].default);
        hljsCore.registerLanguage("html", languages[7].default);
        hljsCore.registerLanguage("xml", languages[7].default);
        hljsCore.registerLanguage("bash", languages[8].default);
        hljsCore.registerLanguage("sh", languages[8].default);
        hljsCore.registerLanguage("shell", languages[8].default);
        hljsCore.registerLanguage("sql", languages[9].default);
        hljsCore.registerLanguage("yaml", languages[10].default);
        hljsCore.registerLanguage("yml", languages[10].default);
        hljsCore.registerLanguage("markdown", languages[11].default);
        hljsCore.registerLanguage("md", languages[11].default);

        hljs = hljsCore;
      });
    }
  });

  // Apply syntax highlighting when hljs is loaded
  $effect(() => {
    if (hljs && language && code) {
      try {
        // Check if language is supported
        const lang = language.toLowerCase();
        if (hljs.getLanguage(lang)) {
          const result = hljs.highlight(code, { language: lang });
          highlightedCode = result.value;
        } else {
          // Unknown language, no highlighting
          highlightedCode = null;
        }
      } catch {
        // Highlighting failed, fall back to plain text
        highlightedCode = null;
      }
    } else {
      highlightedCode = null;
    }
  });

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }

  // Format language display name
  const displayLanguage = $derived(() => {
    if (!language) return null;
    const lang = language.toLowerCase();
    const names: Record<string, string> = {
      js: "JavaScript",
      javascript: "JavaScript",
      ts: "TypeScript",
      typescript: "TypeScript",
      py: "Python",
      python: "Python",
      rs: "Rust",
      rust: "Rust",
      go: "Go",
      json: "JSON",
      css: "CSS",
      html: "HTML",
      xml: "XML",
      bash: "Bash",
      sh: "Shell",
      shell: "Shell",
      sql: "SQL",
      yaml: "YAML",
      yml: "YAML",
      md: "Markdown",
      markdown: "Markdown",
    };
    return names[lang] || language;
  });
</script>

<div
  class="my-2 rounded-md border overflow-hidden text-sm"
  style="background-color: var(--code-bg); border-color: var(--code-border);"
>
  <!-- Header with language and copy button (always shown for consistency) -->
  <div
      class="flex justify-between items-center px-3 py-1.5 border-b"
      style="background-color: var(--code-header-bg); border-color: var(--code-border);"
    >
      <span class="text-xs text-[var(--text-tertiary)] font-mono">
        {displayLanguage() || "Code"}
      </span>
      <button
        onclick={copyToClipboard}
        class="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1"
        title="Copy code"
      >
        {#if copied}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          <span>Copied!</span>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
            <path
              d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
            />
          </svg>
          <span>Copy</span>
        {/if}
      </button>
  </div>

  <!-- Code content -->
  <div class="p-3 overflow-x-auto">
    {#if highlightedCode}
      <pre
        class="font-mono whitespace-pre" style="color: var(--code-text);"><code class="hljs">{@html highlightedCode}</code></pre>
    {:else}
      <pre
        class="font-mono whitespace-pre" style="color: var(--code-text);">{code}</pre>
    {/if}
  </div>
</div>

<style>
  /* Highlight.js theme - adapts to light/dark mode */
  :global(.hljs) {
    color: var(--code-text);
    background: transparent;
  }

  /* Dark mode syntax colors */
  :global(.dark .hljs-keyword),
  :global(.dark .hljs-selector-tag),
  :global(.dark .hljs-title),
  :global(.dark .hljs-section),
  :global(.dark .hljs-doctag),
  :global(.dark .hljs-name),
  :global(.dark .hljs-strong) {
    color: #c678dd;
    font-weight: inherit;
  }

  :global(.dark .hljs-string),
  :global(.dark .hljs-title.class_),
  :global(.dark .hljs-title.class_.inherited__),
  :global(.dark .hljs-title.function_),
  :global(.dark .hljs-attr),
  :global(.dark .hljs-attribute),
  :global(.dark .hljs-regexp),
  :global(.dark .hljs-link) {
    color: #98c379;
  }

  :global(.dark .hljs-literal),
  :global(.dark .hljs-number),
  :global(.dark .hljs-built_in),
  :global(.dark .hljs-type),
  :global(.dark .hljs-params),
  :global(.dark .hljs-meta),
  :global(.dark .hljs-symbol),
  :global(.dark .hljs-bullet) {
    color: #d19a66;
  }

  :global(.dark .hljs-comment),
  :global(.dark .hljs-quote),
  :global(.dark .hljs-deletion),
  :global(.dark .hljs-meta .hljs-doctag) {
    color: #5c6370;
    font-style: italic;
  }

  :global(.dark .hljs-variable),
  :global(.dark .hljs-template-variable) {
    color: #e06c75;
  }

  :global(.dark .hljs-addition) {
    color: #98c379;
    background-color: rgba(152, 195, 121, 0.1);
  }

  /* Light mode syntax colors */
  :global(:not(.dark) .hljs-keyword),
  :global(:not(.dark) .hljs-selector-tag),
  :global(:not(.dark) .hljs-title),
  :global(:not(.dark) .hljs-section),
  :global(:not(.dark) .hljs-doctag),
  :global(:not(.dark) .hljs-name),
  :global(:not(.dark) .hljs-strong) {
    color: #8250df;
    font-weight: inherit;
  }

  :global(:not(.dark) .hljs-string),
  :global(:not(.dark) .hljs-title.class_),
  :global(:not(.dark) .hljs-title.class_.inherited__),
  :global(:not(.dark) .hljs-title.function_),
  :global(:not(.dark) .hljs-attr),
  :global(:not(.dark) .hljs-attribute),
  :global(:not(.dark) .hljs-regexp),
  :global(:not(.dark) .hljs-link) {
    color: #0a3069;
  }

  :global(:not(.dark) .hljs-literal),
  :global(:not(.dark) .hljs-number),
  :global(:not(.dark) .hljs-built_in),
  :global(:not(.dark) .hljs-type),
  :global(:not(.dark) .hljs-params),
  :global(:not(.dark) .hljs-meta),
  :global(:not(.dark) .hljs-symbol),
  :global(:not(.dark) .hljs-bullet) {
    color: #953800;
  }

  :global(:not(.dark) .hljs-comment),
  :global(:not(.dark) .hljs-quote),
  :global(:not(.dark) .hljs-deletion),
  :global(:not(.dark) .hljs-meta .hljs-doctag) {
    color: #6e7781;
    font-style: italic;
  }

  :global(:not(.dark) .hljs-variable),
  :global(:not(.dark) .hljs-template-variable) {
    color: #cf222e;
  }

  :global(:not(.dark) .hljs-addition) {
    color: #116329;
    background-color: rgba(46, 160, 67, 0.1);
  }

  :global(.hljs-emphasis) {
    font-style: italic;
  }
</style>
