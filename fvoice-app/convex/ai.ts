"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

// ─── Tool Definitions ────────────────────────────────────────────────────────────────
// Edit this array to add/remove/modify tools available to the AI.
const TOOLS = [

  {
    name: "get_current_weather",
    description:
      "Fetches real-time current weather conditions (temperature, humidity, wind, rain, weather description) " +
      "for a given latitude and longitude using the Open-Meteo API. " +
      "Use the farmer's saved coordinates when they ask about current weather at their farm.",
    parameters: {
      type: "object",
      properties: {
        latitude:  { type: "number", description: "Latitude of the location" },
        longitude: { type: "number", description: "Longitude of the location" },
      },
      required: ["latitude", "longitude"],
    },
  },
  {
    name: "get_weather_forecast",
    description:
      "Fetches a 7-day daily weather forecast (max/min temperature, rainfall, wind, weather description) " +
      "for a given latitude and longitude using the Open-Meteo API. " +
      "Use this when the farmer asks about upcoming weather or plans to spray/irrigate.",
    parameters: {
      type: "object",
      properties: {
        latitude:  { type: "number", description: "Latitude of the location" },
        longitude: { type: "number", description: "Longitude of the location" },
        days: {
          type: "number",
          description: "Number of forecast days (1–7). Defaults to 7 if omitted.",
        },
      },
      required: ["latitude", "longitude"],
    },
  },
  {
    name: "search_web",
    description: "Simulates a web search. Replace with a real search API for live results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
];

// ─── WMO weather code map ────────────────────────────────────────────────────────────
const WMO_AI: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Heavy drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
  80: "Slight showers", 81: "Moderate showers", 82: "Heavy showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Heavy thunderstorm with hail",
};

// ─── Tool Executor (async — supports HTTP calls) ──────────────────────────────
type ToolArgs = Record<string, string | number | undefined>;

async function executeTool(name: string, args: ToolArgs): Promise<string> {
  switch (name) {
    case "get_current_time":
      return new Date().toISOString();

    case "get_current_weather": {
      const lat = args.latitude;
      const lon = args.longitude;
      if (lat === undefined || lon === undefined) return "Error: latitude and longitude are required.";
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
          `precipitation,rain,weathercode,windspeed_10m,winddirection_10m,is_day` +
          `&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) return `Weather API error: ${res.status}`;
        const data: any = await res.json();
        const c = data.current;
        const cond = WMO_AI[c.weathercode] ?? "Unknown";
        return [
          `Current weather at (${lat}, ${lon}):`,
          `  Condition: ${cond}`,
          `  Temperature: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)`,
          `  Humidity: ${c.relative_humidity_2m}%`,
          `  Rain (last hour): ${c.rain} mm`,
          `  Wind: ${c.windspeed_10m} km/h`,
          `  Time: ${data.current_units ? c.time : new Date().toISOString()}`,
        ].join("\n");
      } catch (e: any) {
        return `Failed to fetch weather: ${e?.message ?? e}`;
      }
    }

    case "get_weather_forecast": {
      const lat = args.latitude;
      const lon = args.longitude;
      const days = Math.min(Number(args.days ?? 7), 7);
      if (lat === undefined || lon === undefined) return "Error: latitude and longitude are required.";
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode` +
          `&forecast_days=${days}&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) return `Forecast API error: ${res.status}`;
        const data: any = await res.json();
        const d = data.daily;
        const lines: string[] = [`${days}-day forecast at (${lat}, ${lon}):`];
        for (let i = 0; i < d.time.length; i++) {
          const cond = WMO_AI[d.weathercode[i]] ?? "Unknown";
          lines.push(
            `  ${d.time[i]}: ${cond}, ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, ` +
            `Rain ${d.precipitation_sum[i]}mm, Wind ${d.windspeed_10m_max[i]}km/h`
          );
        }
        return lines.join("\n");
      } catch (e: any) {
        return `Failed to fetch forecast: ${e?.message ?? e}`;
      }
    }

    case "search_web":
      return `Search results for "${args.query}": (No real search integration configured.)`;

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Message type ─────────────────────────────────────────────────────────────
// Wider part type that covers text, inline_data AND functionResponse turns
type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | { functionResponse: { name: string; response: { result: string } } };

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are FVoice — an expert AI agricultural assistant designed to help Indian farmers.

Your primary capabilities:
1. CROP DISEASE DETECTION & TREATMENT (highest priority)
   - When a farmer describes symptoms OR shares an image of a crop, ALWAYS:
     a) Identify the disease/pest/deficiency by name (common + scientific if relevant)
     b) Explain visible symptoms clearly in simple language
     c) MANDATORY: Provide a complete treatment & solution section that includes:
        • Immediate action (what to do today)
        • Chemical treatment: specific pesticide/fungicide name, dosage, and application method
        • Organic/natural alternative treatment
        • Preventive measures for future seasons
        • When to seek further help (e.g., local Krishi Vigyan Kendra)
   - NEVER detect a disease or pest without providing the full solution. The solution is always mandatory.
   - If the image is unclear, describe what you CAN see and ask a targeted follow-up question.

2. GENERAL FARMING ADVICE
   - Crop calendar, sowing/harvesting times, irrigation, fertilization, soil health
   - Market prices, government schemes (PM-KISAN, Pradhan Mantri Fasal Bima Yojana, etc.)
   - Weather-based farming decisions

3. VOICE & MULTILINGUAL SUPPORT
   - If the farmer speaks/writes in Hindi or any Indian regional language, reply in the SAME language.
   - Keep responses practical, jargon-free, and actionable for a smallholder farmer.

Response format for disease detection:
══ Disease/Problem Identified ══
[Disease name]

🔍 Symptoms: [brief description]

💚 Treatment & Solution:
• Immediate: ...
• Chemical: ...
• Organic: ...
• Prevention: ...

If no disease is detected in the image, confirm the plant looks healthy and offer general care tips.
Always be warm, patient, and encouraging to the farmer.`;


// ─── Main Action ──────────────────────────────────────────────────────────────
export const chat = action({
  args: {
    // Conversation history [{role, content}]
    history: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
    // The current user message text
    userMessage: v.string(),
    // Optional base64 images (up to 3)
    images: v.optional(
      v.array(
        v.object({
          data: v.string(),
          mimeType: v.string(),
        })
      )
    ),
    // Optional audio sent directly as inline_data
    audio: v.optional(
      v.object({
        data: v.string(),
        mimeType: v.string(),
      })
    ),
    // Optional weather briefing injected when gap since last conversation > 1 day
    weatherContext: v.optional(v.string()),
    // Optional user location — passed to system prompt so Gemini can use it for weather tools
    userLocation: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        locationName: v.optional(v.string()),
      })
    ),
    language: v.optional(v.string()), // Optional user language from AsyncStorage
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to Convex Dashboard > Settings > Environment Variables."
      );
    }

    // Build the combined user prompt text
    let promptText = args.userMessage?.trim() || "";
    
    // Send user location along with the user prompt to AI
    if (args.userLocation) {
      const locName = args.userLocation.locationName 
        ? args.userLocation.locationName 
        : `${args.userLocation.latitude}, ${args.userLocation.longitude}`;
      const locContext = `[Farmer's Location Context: ${locName}]`;
      if (promptText) {
        promptText += `\n\n${locContext}`;
      } else {
        promptText = locContext;
      }
    }

    // Build contents array from history
    const contents: GeminiMessage[] = args.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Build the new user turn parts
    // Order: text → audio → images  (Gemini processes them left-to-right)
    const userParts: GeminiMessage["parts"] = [];

    if (promptText) userParts.push({ text: promptText });

    // Inject audio directly as inline_data — Gemini will listen and understand it
    if (args.audio) {
      userParts.push({
        inline_data: { mime_type: args.audio.mimeType, data: args.audio.data },
      });
      // If there is no text prompt, add a minimal instruction so the model knows what to do
      if (!promptText) {
        userParts.unshift({ text: "Please respond to the audio message." });
      }
    }

    // Inject images
    if (args.images) {
      for (const img of args.images) {
        userParts.push({
          inline_data: { mime_type: img.mimeType, data: img.data },
        });
      }
    }

    // Gemini requires at least one part
    if (userParts.length === 0) userParts.push({ text: "Hello" });

    // If weather context is provided, inject it as a synthetic conversation turn
    // BEFORE the history so Gemini opens with a weather briefing
    if (args.weatherContext && contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: args.weatherContext }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "I have noted the weather conditions over the past few days and will incorporate this into my response to the farmer." }],
      });
    }

    contents.push({ role: "user", parts: userParts });

    const MODEL = "gemini-2.5-flash";
    const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    // ── Agentic loop: call Gemini → handle tool calls → feed back ──
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const body = {
        systemInstruction: {
          // Inject user location and language into system prompt
          parts: [{ 
            text: args.userLocation || args.language
              ? SYSTEM_PROMPT + 
                (args.userLocation ? `\n\n[FARMER'S LOCATION]\nLatitude: ${args.userLocation.latitude}\nLongitude: ${args.userLocation.longitude}` + (args.userLocation.locationName ? `\nLocation name: ${args.userLocation.locationName}` : "") + `\nWhen the farmer asks about weather, ALWAYS call the weather tools using these exact coordinates.` : "") +
                (args.language ? `\n\n[LANGUAGE PREFERENCE]\nThe user has explicitly selected the language code: "${args.language}". YOU MUST REPLY ENTIRELY IN THIS LANGUAGE (e.g., if 'hi', reply strictly in Hindi; if 'pa', reply in Punjabi; if 'mr', reply in Marathi, etc).` : "")
              : SYSTEM_PROMPT,
          }],
        },
        contents,
        tools: [{ function_declarations: TOOLS }],
        tool_config: { function_calling_config: { mode: "AUTO" } },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
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

      const data = (await response.json()) as {
        candidates: Array<{
          content: {
            role: string;
            parts: Array<{
              text?: string;
              functionCall?: { name: string; args: Record<string, string> };
            }>;
          };
          finishReason?: string;
        }>;
      };

      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error("No candidate returned from Gemini.");

      const { content, finishReason } = candidate;

      // Add model response to contents for context
      contents.push({ role: "model", parts: content.parts as GeminiMessage["parts"] });

      // If stopped normally, return the text
      if (finishReason === "STOP" || !finishReason) {
        const textPart = content.parts.find((p) => p.text);
        if (textPart?.text) return { response: textPart.text };
        // Might be tool call without STOP — continue
      }

      // Execute any tool calls (await because executeTool is now async)
      const toolCalls = content.parts.filter((p) => p.functionCall);
      if (toolCalls.length === 0) {
        const textPart = content.parts.find((p) => p.text);
        return { response: textPart?.text ?? "I'm not sure how to respond to that." };
      }

      // Build tool responses and add them to contents
      const toolResponseParts = await Promise.all(
        toolCalls.map(async (tc) => {
          const { name, args: toolArgs } = tc.functionCall!;
          const result = await executeTool(name, toolArgs as ToolArgs);
          return {
            functionResponse: {
              name,
              response: { result },
            },
          };
        })
      );

      contents.push({ role: "user", parts: toolResponseParts });
    }

    return { response: "I ran into an issue completing that request. Please try again." };
  },
});

// ─── Summarize Action ─────────────────────────────────────────────────────────
export const summarizeConversation = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
    language: v.optional(v.string()), // Ensure summaries are translated
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

    const transcript = args.messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const MODEL = "gemini-2.5-flash";
    const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Summarize the following conversation in 2-3 concise sentences, capturing the main topics and outcomes.${args.language ? `\n\nTRANSLATE YOUR SUMMARY TO THE FOLLOWING LANGUAGE CODE: "${args.language}". Output ONLY the translated summary.` : ""}\n\n${transcript}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
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

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    return { summary: text ?? "Conversation summary unavailable." };
  },
});
