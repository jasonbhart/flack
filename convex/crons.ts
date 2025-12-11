import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up stale presence records every hour
// This prevents the presence table from growing indefinitely
crons.hourly(
  "cleanup stale presence",
  { minuteUTC: 0 },
  internal.presence.cleanup
);

// Clean up expired auth tokens and sessions daily
crons.daily(
  "cleanup expired auth",
  { hourUTC: 3, minuteUTC: 0 }, // 3 AM UTC
  internal.auth.cleanupAuth
);

// Clean up expired and max-used channel invites daily
crons.daily(
  "cleanup expired invites",
  { hourUTC: 4, minuteUTC: 0 }, // 4 AM UTC
  internal.channelInvites.cleanupInvites
);

// Clean up expired rate limit records hourly
// Prevents unbounded growth of rateLimits table
crons.hourly(
  "cleanup rate limits",
  { minuteUTC: 30 }, // Offset from other hourly jobs to spread load
  internal.rateLimiter.cleanupRateLimits
);

export default crons;
