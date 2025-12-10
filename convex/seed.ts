import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if channels already exist (idempotent)
    const existingChannels = await ctx.db.query("channels").collect();
    if (existingChannels.length > 0) {
      return { message: "Seed data already exists", seeded: false };
    }

    // Create test user
    const userId = await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });

    // Create channels
    const generalId = await ctx.db.insert("channels", {
      name: "general",
    });

    const randomId = await ctx.db.insert("channels", {
      name: "random",
    });

    await ctx.db.insert("channels", {
      name: "engineering",
    });

    // Add sample messages to general channel
    await ctx.db.insert("messages", {
      channelId: generalId,
      userId,
      authorName: "Test User",
      body: "Welcome to Flack! This is a test message.",
      clientMutationId: "seed-msg-1",
    });

    await ctx.db.insert("messages", {
      channelId: generalId,
      userId,
      authorName: "Test User",
      body: "Feel free to try out the messaging features.",
      clientMutationId: "seed-msg-2",
    });

    await ctx.db.insert("messages", {
      channelId: generalId,
      userId,
      authorName: "Test User",
      body: "Messages appear instantly with optimistic updates!",
      clientMutationId: "seed-msg-3",
    });

    // Add sample messages to random channel
    await ctx.db.insert("messages", {
      channelId: randomId,
      userId,
      authorName: "Test User",
      body: "This is the random channel for off-topic discussions.",
      clientMutationId: "seed-msg-4",
    });

    await ctx.db.insert("messages", {
      channelId: randomId,
      userId,
      authorName: "Test User",
      body: "Share anything interesting here!",
      clientMutationId: "seed-msg-5",
    });

    return {
      message: "Seed data created successfully",
      seeded: true,
      channels: 3,
      messages: 5,
    };
  },
});
