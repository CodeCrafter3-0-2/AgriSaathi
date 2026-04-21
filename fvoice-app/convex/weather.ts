"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ─── WMO Weather Code → description ──────────────────────────────────────────
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Heavy freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall", 77: "Snow grains",
  80: "Slight showers", 81: "Moderate showers", 82: "Heavy showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Heavy thunderstorm with hail",
};

function wmoDescription(code: number): string {
  return WMO[code] ?? "Unknown";
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Main Action ──────────────────────────────────────────────────────────────
export const getWeatherContext = action({
  args: {
    userId: v.string(),      // mobile number — used to look up last conversation
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args): Promise<{ weatherContext: string | null }> => {
    // 1. Get the most recent conversation summary
    const summaries = await ctx.runQuery(
      api.conversations.getConversationSummaries,
      { userId: args.userId }
    );

    const lastSummary = summaries[0]; // ordered desc, so [0] is most recent
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // 2. Skip if no previous conversation or gap ≤ 1 day
    if (!lastSummary || now - lastSummary.conversationDate <= ONE_DAY) {
      return { weatherContext: null };
    }

    // 3. Calculate gap in days (cap at 30 so we don't request huge datasets)
    const gapMs = now - lastSummary.conversationDate;
    const gapDays = Math.min(Math.ceil(gapMs / ONE_DAY), 30);

    // 4. Fetch from Open-Meteo using past_days (free, no API key needed)
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(args.latitude));
    url.searchParams.set("longitude", String(args.longitude));
    url.searchParams.set("daily", [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "windspeed_10m_max",
      "weathercode",
    ].join(","));
    url.searchParams.set("past_days", String(gapDays));
    url.searchParams.set("forecast_days", "1"); // include today
    url.searchParams.set("timezone", "auto");

    let data: any;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) return { weatherContext: null };
      data = await res.json();
    } catch {
      return { weatherContext: null };
    }

    const daily = data?.daily;
    if (!daily?.time?.length) return { weatherContext: null };

    const times: string[]  = daily.time;
    const maxT: number[]   = daily.temperature_2m_max;
    const minT: number[]   = daily.temperature_2m_min;
    const rain: number[]   = daily.precipitation_sum;
    const wind: number[]   = daily.windspeed_10m_max;
    const codes: number[]  = daily.weathercode;

    // 5. Build a day-by-day raw table
    const rows = times.map((date, i) =>
      `  ${date}: ${wmoDescription(codes[i])}, ${minT[i]}–${maxT[i]}°C, ` +
      `Rain ${rain[i]} mm, Wind ${wind[i]} km/h`
    );

    // 6. Compute aggregate stats for the farming implications section
    const totalRain = rain.reduce((s, v) => s + (v ?? 0), 0);
    const avgMax    = (maxT.reduce((s, v) => s + v, 0) / maxT.length).toFixed(1);
    const maxWind   = Math.max(...wind);
    const rainyDays = rain.filter((r) => r >= 2.5).length;
    const hotDays   = maxT.filter((t) => t >= 38).length;
    const coldDays  = minT.filter((t) => t <= 10).length;

    // 7. Farming implication hints (rule-based, Gemini will elaborate)
    const implications: string[] = [];
    if (totalRain > 50)  implications.push("Heavy cumulative rainfall — check for waterlogging and fungal diseases.");
    if (rainyDays >= 3)  implications.push(`It rained on ${rainyDays} days — delay any fertiliser or pesticide application if still wet.`);
    if (hotDays >= 2)    implications.push(`${hotDays} very hot days (≥38°C) — advise early-morning irrigation and shade for sensitive crops.`);
    if (coldDays >= 2)   implications.push(`${coldDays} cold nights (≤10°C) — protect frost-sensitive crops.`);
    if (maxWind >= 50)   implications.push("High-wind event — check for physical crop damage and staking needs.");
    if (totalRain < 5 && gapDays >= 3) implications.push("Very little rain over the period — remind farmer about irrigation requirements.");

    const implicationBlock = implications.length
      ? "Farming implications to highlight:\n" + implications.map((i) => `  • ${i}`).join("\n")
      : "No extreme weather events — conditions were relatively normal.";

    const lastDate = new Date(lastSummary.conversationDate).toLocaleDateString("en-IN");
    const todayStr = new Date().toLocaleDateString("en-IN");

    const weatherContext = [
      `[WEATHER BRIEFING: ${lastDate} → ${todayStr} (${gapDays} day gap)]`,
      `Average high: ${avgMax}°C | Total rainfall: ${totalRain.toFixed(1)} mm`,
      "",
      "Daily breakdown:",
      ...rows,
      "",
      implicationBlock,
      "",
      "Task: Greet the farmer warmly. Briefly summarise the weather over this period in simple language, " +
      "then mention the key farming implications listed above. Keep it concise (3-5 sentences), " +
      "then let the farmer's actual message guide the rest of the conversation.",
    ].join("\n");

    return { weatherContext };
  },
});

export const getCurrentWeather = action({
  args: {
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args) => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(args.latitude));
    url.searchParams.set("longitude", String(args.longitude));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weathercode");
    url.searchParams.set("timezone", "auto");

    try {
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      
      const current = data?.current;
      if (!current) return null;

      return {
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        description: wmoDescription(current.weathercode),
        weatherCode: current.weathercode,
      };
    } catch {
      return null;
    }
  },
});
