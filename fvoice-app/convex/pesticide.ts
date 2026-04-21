"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

const SYSTEM_PROMPT = `You are an AI-powered agricultural assistant integrated inside a farmer support application.

Your role is to calculate pesticide usage and provide actionable recommendations based on user inputs, environmental conditions, and agricultural best practices.

### INPUT FORMAT:
You will receive structured input in JSON format:
{
  "crop": "string",
  "area": number,
  "area_unit": "acre" | "hectare",
  "pest_type": "string",
  "pest_severity": "low" | "medium" | "high",
  "temperature": number,
  "humidity": number,
  "wind_speed": number,
  "rain_expected": true | false
}

### YOUR TASK:
1. **Calculate pesticide requirement**
   - Use standard agricultural dosage ranges based on crop type.
   - Adjust dosage based on pest severity:
     - low → minimum dose
     - medium → average dose
     - high → maximum dose
2. **Convert area properly**
   - If unit = acre, use acre-based calculation
   - If unit = hectare, use hectare-based calculation
3. **Estimate water requirement**
   - Use standard ratio: 200–500 liters per hectare (adjust logically)
4. **Weather-based recommendations**
   - If rain_expected = true → warn user to delay spraying
   - If wind_speed > 15 km/h → warn about spray drift
   - If temperature > 35°C → suggest early morning/evening spraying
5. **Generate farmer-friendly output**
   - Keep language simple and practical
   - Avoid technical jargon
   - Provide clear steps

### OUTPUT FORMAT (STRICT):
Return ONLY this structured JSON:
{
  "pesticide_required_ml": number,
  "water_required_liters": number,
  "recommended_dose_range": "string",
  "advice": [
    "string",
    "string"
  ],
  "warnings": [
    "string"
  ]
}

### RULES:
- Never hallucinate unsafe values
- Always provide a dose range
- Keep outputs realistic and safe
- Prioritize farmer safety and crop health

[NOTE ON LANGUAGE]
If a language constraint is passed in the input as "language", you MUST translate all string outputs, particularly "advice" messages and "warnings", into that specific language. The keys in the JSON must remain exactly as defined above (e.g., "pesticide_required_ml", "advice", "warnings"), but their STRING VALUES should be correctly translated into the local language.`;

export const calculate = action({
  args: {
    crop: v.string(),
    area: v.number(),
    area_unit: v.union(v.literal("acre"), v.literal("hectare")),
    pest_type: v.string(),
    pest_severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    temperature: v.number(),
    humidity: v.number(),
    wind_speed: v.number(),
    rain_expected: v.boolean(),
    language: v.optional(v.string()), // Optional language preference
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to Convex Dashboard > Settings > Environment Variables."
      );
    }

    const MODEL = "gemini-2.5-flash";
    const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: JSON.stringify(args) }],
        },
      ],
      generationConfig: {
        temperature: 0.2, // Lower temperature for more deterministic, calculator-like outputs
        responseMimeType: "application/json",
      },
    };

    const response = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as any;
    const textData = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textData) {
      throw new Error("Failed to generate pesticide calculation from Gemini.");
    }

    try {
      const parsed = JSON.parse(textData);
      return parsed as {
        pesticide_required_ml: number;
        water_required_liters: number;
        recommended_dose_range: string;
        advice: string[];
        warnings: string[];
      };
    } catch (error) {
      console.error("Gemini returned invalid JSON:", textData);
      throw new Error("Invalid response format from Gemini.");
    }
  },
});
