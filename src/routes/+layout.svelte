<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import { setupConvex } from "convex-svelte";

  let { children } = $props();

  // Initialize Convex client
  // URL is public (not a secret) - hardcoded for static build compatibility
  setupConvex("https://stoic-otter-636.convex.cloud");
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
