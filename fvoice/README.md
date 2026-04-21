# FVoice: AI Agricultural Voice Assistant

FVoice is an intelligent, voice-based assistant designed specifically for farmers. It integrates over standard phone calls using Exotel, processes live audio streams using Google Gemini (2.5 Flash), and maintains conversation context and user profiles using MongoDB. The assistant provides friendly, localized agricultural guidance, fetches real-time weather data, and uses Google Search for real-time agricultural information.

## Features

- **Live Audio Processing:** Receives raw 8kHz PCM audio streams from Exotel and directly interacts with Gemini for fast responses.
- **Farmer-focused AI Persona:** Prompts are heavily tailored to speak to farmers in their local language using simple, practical terms.
- **Smart Tooling:** Automatically searches Google for up-to-date facts and fetches real-time weather using WeatherStack.
- **Continuous Context (Memory):** Uses MongoDB to keep track of the farmer's phone number, location, and a running summary of past problems/context across multiple phone calls.
- **Real-time TTS:** Converts AI text responses back into audio using Google Cloud Text-to-Speech to play over the Exotel phone call.

## Prerequisites

Before you begin, ensure you have the following installed and set up:
- **Node.js** (v18+ recommended)
- **MongoDB** (Running locally on default port `27017` or via MongoDB Atlas)
- **ngrok** (For exposing your local server to Exotel)
- Accounts and API keys for:
  - **Exotel** (Phone numbers, applets, and streaming setup)
  - **Google Studio (Gemini)** (API Key)
  - **Google Cloud Platform** (Service Account JSON for TTS)
  - **WeatherStack** (API Key for weather queries)

## Installation & Initialization

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository-url>
   cd fvoice
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory of the project and add your keys:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/fvoice
   
   # Exotel Keys
   EXOTEL_ACCOUNT_SID=your_account_sid
   EXOTEL_API_KEY=your_api_key
   EXOTEL_API_TOKEN=your_api_token
   
   # Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key
   
   # Google Cloud TTS
   GOOGLE_PROJECT_ID=your_google_project_id
   GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"
   
   # WeatherStack API Key
   WEATHER_STACK_API_KEY=your_weatherstack_api_key
   ```

4. **Add Google Credentials:**
   Place your Google Cloud Service Account JSON file in the root directory and name it `google-credentials.json` (as configured in the `.env`).

## Running the Application

1. **Start MongoDB:**
   Ensure your local MongoDB instance is running, or that your `MONGODB_URI` correctly points to your hosted cluster.

2. **Start the Node.js server:**
   ```bash
   npm start
   # OR
   node src/server.js
   ```
   The server will start locally on port `3000`.

3. **Expose the server to the internet:**
   In a new terminal window, run ngrok:
   ```bash
   ngrok http 3000
   ```

## Exotel Setup

Once your server is publicly accessible via ngrok, configure your Exotel call flow:

1. **Call Webhook:** Point the passthru/dynamic text applets to `https://<your-ngrok-url>/exotel/voice` or `https://<your-ngrok-url>/exotel/process-speech`.
2. **WebSocket Streaming:** Set up the Exotel streaming component to connect to `ws://<your-ngrok-url>/`.
   - Sending `From` allows the app to fetch the farmer's conversation history correctly.

## Architecture

- `src/server.js` - Manages the WebSocket connection and live audio buffer/silence detection.
- `src/app.js` - Express application and MongoDB initialization.
- `src/ai/geminiService.js` - Handles LLM interactions, tool executions (weather/search), and session summarization.
- `src/models/User.js` - Mongoose schema for the farmer profiles.
