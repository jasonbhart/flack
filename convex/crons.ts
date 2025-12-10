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

export default crons;
