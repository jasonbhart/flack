import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { resend } from "./auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { generateUnsubscribeToken } from "./unsubscribe";

// Delay before checking if user is still offline (4 hours)
export const MENTION_NOTIFICATION_DELAY_MS = 4 * 60 * 60 * 1000;

/**
 * Escape HTML entities to prevent XSS in email content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Check if a user has been offline since the mention timestamp.
 * Returns true if the user should receive a notification.
 */
async function isUserOfflineSinceMention(
  ctx: MutationCtx,
  userId: Id<"users">,
  mentionedAt: number
): Promise<boolean> {
  // Find all presence records for this user (any channel/session)
  const presenceRecords = await ctx.db
    .query("presence")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  if (presenceRecords.length === 0) {
    // No presence records = never been online = notify
    return true;
  }

  // Find the most recent activity across all sessions
  const mostRecentActivity = Math.max(...presenceRecords.map((p) => p.updated));

  // User is "offline since mention" if their last activity was before the mention
  return mostRecentActivity < mentionedAt;
}

/**
 * Compose the notification email content.
 */
function composeNotificationEmail(params: {
  mentionedUserName: string;
  senderName: string;
  channelName: string;
  messagePreview: string;
  messageUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const escapedPreview = escapeHtml(params.messagePreview);
  const truncatedPreview =
    escapedPreview.length > 200
      ? escapedPreview.substring(0, 200) + "..."
      : escapedPreview;

  // Build footer with optional unsubscribe link
  const footerText = params.unsubscribeUrl
    ? `You received this email because you were mentioned while offline.
          <br/><a href="${params.unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe from these emails</a> or update your preferences in Flack settings.`
    : `You received this email because you were mentioned while offline.
          <br/>To stop these notifications, update your preferences in Flack settings.`;

  return {
    subject: `${params.senderName} mentioned you in #${params.channelName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">You were mentioned in Flack</h2>
        <p><strong>${escapeHtml(params.senderName)}</strong> mentioned you in <strong>#${escapeHtml(params.channelName)}</strong>:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #3B82F6;">
          <p style="margin: 0; color: #333;">${truncatedPreview}</p>
        </div>
        <a href="${params.messageUrl}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          View Message
        </a>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          ${footerText}
        </p>
      </div>
    `,
  };
}

/**
 * Check if user should receive notification based on their preferences.
 *
 * Queries the userPreferences table to check if user has opted out of email notifications.
 * Default behavior: If no preference exists, assume true (opt-out model).
 */
async function shouldNotifyUser(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<boolean> {
  const preference = await ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  // Default to true if no preference exists (opt-out model)
  return preference?.emailNotifications ?? true;
}

/**
 * Check if this notification should be sent (consolidation logic).
 * Only the first scheduled notification for a user's offline period in a channel should send.
 * Later scheduled notifications detect they're redundant and skip.
 *
 * Consolidation is per-channel: if a user is mentioned multiple times in the same channel
 * while offline, only the first mention triggers an email for that channel.
 * Mentions in different channels each trigger their own email.
 */
async function shouldSendNotification(
  ctx: MutationCtx,
  mentionedUserId: Id<"users">,
  messageId: Id<"messages">,
  channelId: Id<"channels">,
  mentionedAt: number
): Promise<boolean> {
  // Find when user was last online
  const presenceRecords = await ctx.db
    .query("presence")
    .withIndex("by_user", (q) => q.eq("userId", mentionedUserId))
    .collect();

  const lastOnline =
    presenceRecords.length > 0
      ? Math.max(...presenceRecords.map((p) => p.updated))
      : 0;

  // Query messages in THIS CHANNEL created after user went offline
  // Server-side filter prevents loading entire channel history into memory
  const recentMessages = await ctx.db
    .query("messages")
    .withIndex("by_channel", (q) => q.eq("channelId", channelId))
    .filter((q) => q.gt(q.field("_creationTime"), lastOnline))
    .order("asc")
    .collect();

  // Filter to messages that mention this user
  const pendingMentions = recentMessages.filter((msg) => {
    if (!msg.mentions) return false;
    return msg.mentions.some((id) => id === mentionedUserId);
  });

  if (pendingMentions.length === 0) {
    // No pending mentions found (edge case - message may have been deleted)
    return true;
  }

  // Only send if this is the FIRST (oldest) mention since going offline in this channel
  const firstMention = pendingMentions[0];
  return firstMention._id === messageId;
}

/**
 * Internal mutation to check if a mentioned user is offline and send email notification.
 * Called by the scheduler 4 hours after a mention is created.
 */
export const checkAndSendMentionEmail = internalMutation({
  args: {
    messageId: v.id("messages"),
    mentionedUserId: v.id("users"),
    channelId: v.id("channels"),
    mentionedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { messageId, mentionedUserId, channelId, mentionedAt } = args;

    // Check if message still exists (may have been deleted)
    const message = await ctx.db.get(messageId);
    if (!message) {
      console.log(
        `[notifications] Skipping notification: message ${messageId} deleted`
      );
      return { sent: false, reason: "message_deleted" };
    }

    // Check if mention still exists (message may have been edited to remove mention)
    if (!message.mentions?.includes(mentionedUserId)) {
      console.log(
        `[notifications] Skipping notification: mention removed from message ${messageId}`
      );
      return { sent: false, reason: "mention_removed" };
    }

    // Check if channel still exists
    const channel = await ctx.db.get(channelId);
    if (!channel) {
      console.log(
        `[notifications] Skipping notification: channel ${channelId} deleted`
      );
      return { sent: false, reason: "channel_deleted" };
    }

    // Get sender info
    const sender = await ctx.db.get(message.userId);
    if (!sender) {
      console.log(
        `[notifications] Skipping notification: sender ${message.userId} not found`
      );
      return { sent: false, reason: "sender_not_found" };
    }

    // Get mentioned user info
    const mentionedUser = await ctx.db.get(mentionedUserId);
    if (!mentionedUser) {
      console.log(
        `[notifications] Skipping notification: user ${mentionedUserId} not found`
      );
      return { sent: false, reason: "user_not_found" };
    }

    // Check if user has email
    if (!mentionedUser.email || mentionedUser.email.trim() === "") {
      console.log(
        `[notifications] Skipping notification: user ${mentionedUserId} has no email`
      );
      return { sent: false, reason: "no_email" };
    }

    // Check user preferences (extension point)
    if (!(await shouldNotifyUser(ctx, mentionedUserId))) {
      console.log(
        `[notifications] Skipping notification: user ${mentionedUserId} opted out`
      );
      return { sent: false, reason: "user_opted_out" };
    }

    // Check if user is still offline since the mention
    const isOffline = await isUserOfflineSinceMention(
      ctx,
      mentionedUserId,
      mentionedAt
    );
    if (!isOffline) {
      console.log(
        `[notifications] Skipping notification: user ${mentionedUserId} came online`
      );
      return { sent: false, reason: "user_online" };
    }

    // Check consolidation - only send if this is the first pending mention in this channel
    const shouldSend = await shouldSendNotification(
      ctx,
      mentionedUserId,
      messageId,
      channelId,
      mentionedAt
    );
    if (!shouldSend) {
      console.log(
        `[notifications] Skipping notification: consolidated with earlier mention`
      );
      return { sent: false, reason: "consolidated" };
    }

    // Build email content
    const baseUrl = process.env.SITE_URL ?? "http://localhost:5173";
    const messageUrl = `${baseUrl}/channel/${channelId}?message=${messageId}`;

    // Generate unsubscribe token for both footer link and headers
    const unsubscribeToken = await generateUnsubscribeToken(mentionedUserId);

    // Build frontend unsubscribe URL (for clickable link in email body)
    // Points to /unsubscribe page in the SvelteKit frontend
    const frontendUnsubscribeUrl = unsubscribeToken
      ? `${baseUrl}/unsubscribe?token=${unsubscribeToken}`
      : undefined;

    const { subject, html } = composeNotificationEmail({
      mentionedUserName: mentionedUser.name,
      senderName: sender.name,
      channelName: channel.name,
      messagePreview: message.body,
      messageUrl,
      unsubscribeUrl: frontendUnsubscribeUrl,
    });

    // Build headers array - only add unsubscribe headers if token generation succeeded
    // Resend expects headers as array of {name, value} objects
    const headers: { name: string; value: string }[] = [];
    if (unsubscribeToken) {
      // Use Convex HTTP endpoint for one-click unsubscribe
      // Format: https://<deployment>.convex.site/unsubscribe?token=xxx
      const convexSiteUrl = process.env.CONVEX_SITE_URL;
      if (convexSiteUrl) {
        const unsubscribeUrl = `${convexSiteUrl}/unsubscribe?token=${unsubscribeToken}`;
        // RFC 8058: List-Unsubscribe header with URL
        headers.push({ name: "List-Unsubscribe", value: `<${unsubscribeUrl}>` });
        // RFC 8058: Required for one-click unsubscribe
        headers.push({
          name: "List-Unsubscribe-Post",
          value: "List-Unsubscribe=One-Click",
        });
      } else {
        console.log(
          "[notifications] CONVEX_SITE_URL not set, skipping List-Unsubscribe headers"
        );
      }
    } else {
      console.log(
        "[notifications] Could not generate unsubscribe token, skipping headers"
      );
    }

    // Send email via Resend
    const fromEmail = process.env.RESEND_EMAIL ?? "onboarding@resend.dev";
    await resend.sendEmail(ctx, {
      from: `Flack <${fromEmail}>`,
      to: mentionedUser.email,
      subject,
      html,
      ...(headers.length > 0 && { headers }),
    });

    console.log(
      `[notifications] Sent mention notification to ${mentionedUser.email} for message ${messageId}`
    );

    return { sent: true, email: mentionedUser.email };
  },
});
