import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const messageValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  timestamp: v.number(),
  imageUrls: v.optional(v.array(v.string())),
  audioTranscript: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    mobileNumber: v.string(),
    otp: v.optional(
      v.object({
        code: v.string(),
        expiresAt: v.number(),
      })
    ),
    isOtpVerified: v.boolean(),
    language: v.optional(v.string()),      // e.g. 'pa', 'hi', 'en'
    locationName: v.optional(v.string()),  // reverse-geocoded city/district name
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_mobileNumber", ["mobileNumber"]),

  conversations: defineTable({
    userId: v.string(), // mobile number used as stable user key
    messages: v.array(messageValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
    isActive: v.boolean(),
  }).index("by_userId_and_active", ["userId", "isActive"]),

  conversationSummaries: defineTable({
    userId: v.string(),
    summary: v.string(),
    conversationDate: v.number(),
    messageCount: v.number(),
  }).index("by_userId", ["userId"]),
});
