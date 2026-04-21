"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Helper: generate a 6-digit OTP
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Public action: Send OTP via Exotel SMS API.
 * Credentials are read from Convex environment variables (set via Convex dashboard).
 * Required env vars:
 *   EXOTEL_API_KEY
 *   EXOTEL_API_TOKEN
 *   EXOTEL_ACCOUNT_SID
 *   EXOTEL_SENDER_ID   (your registered ExoPhone or Sender ID)
 */
export const sendOtp = action({
  args: { mobileNumber: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const senderId = process.env.EXOTEL_SENDER_ID;

    if (!apiKey || !apiToken || !accountSid || !senderId) {
      throw new Error("Exotel credentials are not configured. Please set EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_ACCOUNT_SID, and EXOTEL_SENDER_ID in Convex environment variables.");
    }

    const otpCode = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const messageBody = `Your FVoice verification code is: ${otpCode}. Valid for 10 minutes. Do not share this OTP.`;

    // Exotel SMS API endpoint
    const url = `https://${apiKey}:${apiToken}@api.exotel.com/v1/Accounts/${accountSid}/Sms/send.json`;

    const formData = new URLSearchParams();
    formData.append("From", senderId);
    formData.append("To", args.mobileNumber);
    formData.append("Body", messageBody);
    formData.append("Priority", "high"); // Recommended for OTPs

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Exotel SMS send failed:", errorText);
      throw new Error(`Failed to send OTP: ${response.status} ${response.statusText}`);
    }

    // Save OTP in DB via the requestOtp mutation
    await ctx.runMutation(internal.users.saveOtp, {
      mobileNumber: args.mobileNumber,
      otpCode,
      expiresAt,
    });

    return { success: true, message: "OTP sent successfully" };
  },
});
