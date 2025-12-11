import type { Handle } from "@sveltejs/kit";

/**
 * Server hooks for security headers.
 * Adds CSP and other security headers to all responses.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Content Security Policy
  // - default-src 'self': Only allow resources from same origin by default
  // - script-src 'self' 'unsafe-inline': Allow scripts from same origin + inline (needed for SvelteKit hydration)
  //   Also allow Cloudflare's analytics beacon (static.cloudflareinsights.com)
  // - style-src 'self' 'unsafe-inline': Allow styles from same origin + inline (needed for Tailwind)
  // - connect-src: Allow WebSocket connections to Convex and Cloudflare analytics
  // - img-src: Allow images from same origin, data URIs, and blobs
  // - font-src 'self': Only allow fonts from same origin
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' wss://*.convex.cloud https://*.convex.cloud https://cloudflareinsights.com",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Set security headers
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
};
