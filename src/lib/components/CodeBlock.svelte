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
  class="my-2 rounded-md border border-ink-700 bg-ink-900 overflow-hidden text-sm"
>
  <!-- Header with language and copy button (always shown for consistency) -->
  <div
      class="flex justify-between items-center px-3 py-1.5 border-b border-ink-700 bg-ink-800/50"
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
        class="font-mono text-[var(--text-primary)] whitespace-pre"><code class="hljs">{@html highlightedCode}</code></pre>
    {:else}
      <pre
        class="font-mono text-[var(--text-primary)] whitespace-pre">{code}</pre>
    {/if}
  </div>
</div>

<style>
  /* Import highlight.js theme - using a dark theme that matches our design */
  :global(.hljs) {
    color: var(--text-primary);
    background: transparent;
  }

  :global(.hljs-keyword),
  :global(.hljs-selector-tag),
  :global(.hljs-title),
  :global(.hljs-section),
  :global(.hljs-doctag),
  :global(.hljs-name),
  :global(.hljs-strong) {
    color: #c678dd;
    font-weight: inherit;
  }

  :global(.hljs-string),
  :global(.hljs-title.class_),
  :global(.hljs-title.class_.inherited__),
  :global(.hljs-title.function_),
  :global(.hljs-attr),
  :global(.hljs-attribute),
  :global(.hljs-regexp),
  :global(.hljs-link) {
    color: #98c379;
  }

  :global(.hljs-literal),
  :global(.hljs-number),
  :global(.hljs-built_in),
  :global(.hljs-type),
  :global(.hljs-params),
  :global(.hljs-meta),
  :global(.hljs-symbol),
  :global(.hljs-bullet) {
    color: #d19a66;
  }

  :global(.hljs-comment),
  :global(.hljs-quote),
  :global(.hljs-deletion),
  :global(.hljs-meta .hljs-doctag) {
    color: #5c6370;
    font-style: italic;
  }

  :global(.hljs-variable),
  :global(.hljs-template-variable) {
    color: #e06c75;
  }

  :global(.hljs-addition) {
    color: #98c379;
    background-color: rgba(152, 195, 121, 0.1);
  }

  :global(.hljs-emphasis) {
    font-style: italic;
  }
</style>
