<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import { setupConvex } from "convex-svelte";
  import { env } from "$env/dynamic/public";

  let { children } = $props();

  // Initialize Convex client
  setupConvex(env.PUBLIC_CONVEX_URL!);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
