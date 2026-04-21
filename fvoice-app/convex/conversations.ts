import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const messageValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  timestamp: v.number(),
  imageUrls: v.optional(v.array(v.string())),
  audioTranscript: v.optional(v.string()),
});

// Get the active conversation for a user
export const getActiveConversation = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_userId_and_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .first();
  },
});

// Get a conversation by its ID
export const getConversationById = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});


// Get recent summaries for a user
export const getConversationSummaries = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversationSummaries")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);
  },
});

// Always create a new conversation (never reuse an existing one)
export const startConversation = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: args.userId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });
  },
});

// Append a message — silently skips if conversation was already deleted
export const appendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    message: messageValidator,
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return; // already deleted (e.g. after back-button close)

    await ctx.db.patch(args.conversationId, {
      messages: [...conv.messages, args.message],
      updatedAt: Date.now(),
    });
  },
});

// Summarize and delete the conversation — safe to call even if already deleted
export const summarizeAndClose = mutation({
  args: {
    conversationId: v.id("conversations"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return; // already closed, nothing to do

    await ctx.db.insert("conversationSummaries", {
      userId: conv.userId,
      summary: args.summary,
      conversationDate: conv.createdAt,
      messageCount: conv.messages.length,
    });

    await ctx.db.delete(args.conversationId);
  },
});
