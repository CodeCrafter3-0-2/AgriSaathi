// Load environment variables from .env file
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const { generateResponse, generateResponseFromAudio } = require('./ai/geminiService');
const app = require('./app');
const User = require('./models/User');

const { getRawTTSAudio } = require('./ai/googleTtsService');
// (Google STT service removed as we are sending audio directly to Gemini)

// Define port the app should run on
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Function to convert Text to 8kHz raw PCM audio and send to Exotel
async function playAudioToCaller(ws, streamSid, text) {
    try {
        console.log(`Generating TTS for: "${text}"`);
        const rawAudio = await getRawTTSAudio(text);
        
        // Send base64 audio to Exotel
        ws.send(JSON.stringify({
            event: 'media',
            stream_sid: streamSid,
            media: {
                payload: rawAudio.toString('base64')
            }
        }));
        
        console.log('Audio sent to caller.');
    } catch (err) {
        console.error('Error generating TTS:', err);
    }
}

wss.on('connection', async (ws, req) => {
    console.log(`WebSocket connection established on ${req.url}`);
    
    let urlParams = new URLSearchParams(req.url.split('?')[1] || '');
    // Convert to lowercase keys for case-insensitive lookup
    const paramsObj = Object.fromEntries([...urlParams.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    let phoneNumber = paramsObj['from'] || paramsObj['caller_id'] || paramsObj['phone'] || 'Unknown';
    
    console.log("Phone number from query params:", phoneNumber);
    let userDoc = null;
    if (phoneNumber !== 'Unknown') {
        try {
            userDoc = await User.findOneAndUpdate(
                { phoneNumber }, 
                { $setOnInsert: { phoneNumber } }, 
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error("Error fetching user doc:", err);
        }
    }
    let audioBuffer = Buffer.alloc(0);
    let streamSid = null;
    let silenceTimer = null;
    let isProcessing = false;
    let sessionChatHistory = [];

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.event) {
                case 'connected':
                    console.log('Exotel Voicebot Connected.');
                    break;
                case 'start':
                    streamSid = data.stream_sid;
                    console.log(`Stream Started: ${streamSid}`);
                    console.log('Stream Start Data:', JSON.stringify(data.start, null, 2));

                    // If phone number is still unknown, try grabbing it from Exotel's start data
                    if (phoneNumber === 'Unknown' && (data.start?.from || data.start?.From || data.start?.custom_data)) {
                        try {
                            if (data.start?.from || data.start?.From) {
                                phoneNumber = data.start.from || data.start.From;
                                console.log("Extracted phone number from start data:", phoneNumber);
                            } else if (data.start?.custom_data) {
                                const customData = JSON.parse(data.start.custom_data);
                                phoneNumber = customData.From || customData.from || customData.caller_id || customData.phone || 'Unknown';
                                if (phoneNumber !== 'Unknown') {
                                    console.log("Extracted phone number from custom_data:", phoneNumber);
                                }
                            }
                            
                            if (phoneNumber !== 'Unknown') {
                                userDoc = await User.findOneAndUpdate(
                                    { phoneNumber }, 
                                    { $setOnInsert: { phoneNumber } }, 
                                    { upsert: true, new: true }
                                );
                            }
                        } catch (e) {
                            console.log("Could not parse phone number from start data");
                        }
                    }

                    // Greet the user when they connect
                    const greeting = "Hi there! I am your AI assistant. How can I help you today?";
                    sessionChatHistory.push(`AI: ${greeting}`);
                    await playAudioToCaller(ws, streamSid, greeting);
                    break;
                case 'media':
                    if (isProcessing) return; // Don't buffer while we are thinking
                    // Exotel sends raw 8kHz audio encoded in base64
                    const chunk = Buffer.from(data.media.payload, 'base64');
                    audioBuffer = Buffer.concat([audioBuffer, chunk]);

                    // Calculate average volume (energy) of this chunk to detect if someone is speaking
                    let energy = 0;
                    for (let i = 0; i < chunk.length; i += 2) {
                        const sample = Math.abs(chunk.readInt16LE(i));
                        energy += sample;
                    }
                    const averageEnergy = energy / (chunk.length / 2);
                    // console.log(`Average Energy: ${averageEnergy}`);
                    // If the user's voice volume is loud enough, reset the silence timer
                    // Adjust 2000 up or down if it's too sensitive or not sensitive enough
                    if (averageEnergy > 2000) {
                        clearTimeout(silenceTimer);
                        // If we hear 2 seconds of silence, process the audio
                        silenceTimer = setTimeout(async () => {
                            if (audioBuffer.length > 8000) { // Make sure they actually spoke (at least 0.5 seconds of data)
                                isProcessing = true;
                                const bufferToProcess = audioBuffer;
                                audioBuffer = Buffer.alloc(0); // clear buffer

                                console.log('Silence detected. Sending audio directly to Gemini...');
                                
                                const aiReply = await generateResponseFromAudio(bufferToProcess, userDoc);
                                console.log(`Gemini replied: "${aiReply}"`);
                                sessionChatHistory.push(`AI: ${aiReply}`);
                                
                                await playAudioToCaller(ws, streamSid, aiReply);
                                
                                isProcessing = false;
                            } else {
                                // Audio was too short, just clear it
                                audioBuffer = Buffer.alloc(0);
                            }
                        }, 2000); // 2 second silence timeout
                    }

                    break;
                case 'dtmf':
                    console.log('User pressed a key:', data.dtmf);
                    break;
                case 'stop':
                    console.log('Stream Stopped by Exotel:', data.stop);
                    if (sessionChatHistory.length > 0 && userDoc) {
                        try {
                            const { generateSummary } = require('./ai/geminiService');
                            const newSummary = await generateSummary(sessionChatHistory, userDoc.summary);
                            userDoc.summary = newSummary;
                            await userDoc.save();
                            console.log('Session summary saved.');
                        } catch (summaryErr) {
                            console.error('Error saving summary on stream stop:', summaryErr);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            isProcessing = false;
        }
    });

    ws.on('close', () => {
        console.log('Exotel WebSocket connection closed.');
        clearTimeout(silenceTimer);
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running accurately and waiting for calls on port ${PORT}...`);
    console.log(`Expose this server using ngrok: \`ngrok http ${PORT}\``);
    console.log(`WebSocket endpoint available at ws://<your-ngrok-domain>/`);
});