import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// QUERY: Get a user by their mobile number
export const getUserByMobile = query({
  args: { mobileNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_mobileNumber", (q) => q.eq("mobileNumber", args.mobileNumber))
      .first();
  },
});

// QUERY: Get a user by their ID
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// INTERNAL MUTATION: Save OTP - only callable from Convex actions (not public)
export const saveOtp = internalMutation({
  args: { 
    mobileNumber: v.string(), 
    otpCode: v.string(), 
    expiresAt: v.number() 
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_mobileNumber", (q) => q.eq("mobileNumber", args.mobileNumber))
      .first();

    const now = Date.now();

    if (existingUser) {
      // Update existing user with new OTP
      await ctx.db.patch(existingUser._id, {
        otp: {
          code: args.otpCode,
          expiresAt: args.expiresAt,
        },
        isOtpVerified: false,
        updatedAt: now,
      });
      return existingUser._id;
    } else {
      // Create a new user
      return await ctx.db.insert("users", {
        mobileNumber: args.mobileNumber,
        otp: {
          code: args.otpCode,
          expiresAt: args.expiresAt,
        },
        isOtpVerified: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// MUTATION: Verify the OTP provided by the user
export const verifyOtp = mutation({
  args: { 
    mobileNumber: v.string(), 
    otpCode: v.string() 
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_mobileNumber", (q) => q.eq("mobileNumber", args.mobileNumber))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.otp) {
      throw new Error("No OTP was requested");
    }

    const now = Date.now();
    if (now > user.otp.expiresAt) {
      throw new Error("OTP has expired");
    }

    if (user.otp.code !== args.otpCode) {
      throw new Error("Invalid OTP");
    }

    // OTP is valid and verified
    await ctx.db.patch(user._id, {
      isOtpVerified: true,
      otp: undefined, // Clear OTP after successful verification
      updatedAt: now,
    });

    return user._id;
  },
});

// MUTATION: Update the user's selected language
export const updateLanguage = mutation({
  args: { 
    userId: v.id("users"), 
    language: v.string() 
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      language: args.language,
      updatedAt: now,
    });
  },
});

// MUTATION: Directly log in the user without OTP (dev/bypass mode)
export const loginDirectly = mutation({
  args: { mobileNumber: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_mobileNumber", (q) => q.eq("mobileNumber", args.mobileNumber))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isOtpVerified: true,
        otp: undefined,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      mobileNumber: args.mobileNumber,
      isOtpVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// MUTATION: Save user's location + language after login
export const updateProfileAfterLogin = mutation({
  args: {
    mobileNumber: v.string(),
    language: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    locationName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_mobileNumber", (q) => q.eq("mobileNumber", args.mobileNumber))
      .first();
    if (!user) return;

    await ctx.db.patch(user._id, {
      ...(args.language !== undefined && { language: args.language }),
      ...(args.latitude !== undefined && { latitude: args.latitude }),
      ...(args.longitude !== undefined && { longitude: args.longitude }),
      ...(args.locationName !== undefined && { locationName: args.locationName }),
      updatedAt: Date.now(),
    });
  },
});
