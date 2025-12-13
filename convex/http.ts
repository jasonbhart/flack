import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/**
 * POST /unsubscribe
 *
 * RFC 8058 one-click unsubscribe endpoint for email clients.
 * Email clients (Gmail, Yahoo, Outlook) POST to this endpoint when
 * user clicks the native "Unsubscribe" button.
 *
 * Query params:
 *   - token: Signed unsubscribe token (base64url encoded)
 *
 * Returns:
 *   - 200 OK on success
 *   - 400 Bad Request if token is missing or invalid
 */
http.route({
  path: "/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      console.log("[http] Unsubscribe request missing token");
      return new Response("Missing token", { status: 400 });
    }

    // Call the mutation to process the unsubscribe
    const result = await ctx.runMutation(api.unsubscribe.unsubscribeByToken, {
      token,
    });

    if (!result.success) {
      console.log(`[http] Unsubscribe failed: ${result.error}`);
      return new Response("Invalid token", { status: 400 });
    }

    console.log("[http] Unsubscribe successful");
    return new Response("OK", { status: 200 });
  }),
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
