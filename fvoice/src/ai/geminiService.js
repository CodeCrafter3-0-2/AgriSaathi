const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Google Generative AI with the API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_INSTRUCTION = "You are a helpful and friendly agricultural assistant speaking to a farmer on a phone call. Keep responses short, clear, very simple, and conversational. Always use practical, easy-to-understand terms suitable for farmers. Respond purely in the local language the farmer speaks.";

const tools = [
    {
        functionDeclarations: [
            {
                name: "get_weather",
                description: "Gets the current weather for a specified location.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        location: {
                            type: "STRING",
                            description: "The city or location to get weather for (e.g., 'London', 'New York').",
                        },
                    },
                    required: ["location"],
                },
            },
            {
                name: "update_user_location",
                description: "Updates the location for the current user.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        location: {
                            type: "STRING",
                            description: "The location of the user (e.g., 'New York', 'Los Angeles').",
                        },
                    },
                    required: ["location"],
                },
            },
            {
                name: "update_user_summary",
                description: "Updates the summary of the user's ongoing situation and chat context.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        summary: {
                            type: "STRING",
                            description: "A concise summary of the most important things discussed so far.",
                        },
                    },
                    required: ["summary"],
                },
            },
            {
                name: "search_google",
                description: "Uses Google Search to find current events, information, or factual data that you cannot answer from your existing knowledge.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: {
                            type: "STRING",
                            description: "The search query.",
                        },
                    },
                    required: ["query"],
                },
            },
        ],
    }
];

const handleFunctionCall = async (functionCall, userDoc) => {
    const { name, args } = functionCall;
    if (name === 'get_weather') {
        try {
            const apiKey = process.env.WEATHER_STACK_API_KEY;
            const url = `http://api.weatherstack.com/current?access_key=${apiKey}&query=${encodeURIComponent(args.location)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.current) {
                return {
                    location: data.location.name,
                    country: data.location.country,
                    temperature: data.current.temperature,
                    descriptions: data.current.weather_descriptions.join(', '),
                    humidity: data.current.humidity,
                    feelslike: data.current.feelslike
                };
            } else {
                return { error: 'Could not fetch weather data for the specified location.', details: data.error };
            }
        } catch (error) {
            console.error("Error fetching weather:", error);
            return { error: 'Failed to connect to weather service.' };
        }
    } else if (name === 'update_user_location') {
        userDoc.location = args.location;
        await userDoc.save();
        return { location: userDoc.location, status: "Location updated successfully." };
    } else if (name === 'update_user_summary') {
        userDoc.summary = args.summary;
        await userDoc.save();
        return { summary: userDoc.summary, status: "Summary updated successfully." };
    } else if (name === 'search_google') {
        try {
            const searchModel = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ googleSearch: {} }]
            });
            const searchResult = await searchModel.generateContent(args.query);
            const response = await searchResult.response;
            return { searchResults: response.text() };
        } catch (error) {
            console.error("Error performing Google Search:", error);
            return { error: 'Failed to perform Google Search.' };
        }
    }
    return { error: "Unknown function" };
};

/**
 * Generate a response using Google Gemini API
 * @param {string} prompt - The user speech converted to text
 * @param {Object} userDoc - The MongoDB User document for the caller
 * @returns {Promise<string>} - The AI generated response
 */
async function generateResponse(prompt, userDoc) {
    try {
        const userInfoContext = userDoc ? `User's current location: ${userDoc.location}\nUser's chat summary: ${userDoc.summary}\n\nYou MUST use tools to update location or summary if the user mentions them.` : '';

        // Use the gemini-2.5-flash model for fast, conversational responses
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION + '\n' + userInfoContext,
            tools: tools
        });

        const result = await model.generateContent(prompt);
        let response = await result.response;
        const functionCalls = response.functionCalls ? response.functionCalls() : null;

        if (functionCalls && functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            console.log(`Gemini called function: ${functionCall.name} with args`, functionCall.args);

            if (functionCall.name === 'search_google') {
                const searchModel = genAI.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    systemInstruction: SYSTEM_INSTRUCTION + '\n' + userInfoContext,
                    tools: [{ googleSearch: {} }] // Second call with ONLY Google Search enabled
                });
                console.log(`Executing Google Search fallback for query: "${functionCall.args.query}"`);
                const followUpPrompt = `Search Google for information regarding: "${functionCall.args.query}". 
Then, answer the farmer's query based on the search results. Ensure you explain things very simply in plain agricultural terms, and you MUST respond in the exact same local language as the farmer's query:

"${prompt}"`;
                const searchResult = await searchModel.generateContent(followUpPrompt);
                response = await searchResult.response;
            } else {
                const functionResponseData = await handleFunctionCall(functionCall, userDoc);

                const followUpResult = await model.generateContent({
                    contents: [
                        { role: "user", parts: [{ text: prompt }] },
                        { role: "model", parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }] },
                        { role: "user", parts: [{ functionResponse: { name: functionCall.name, response: functionResponseData } }] }
                    ]
                });
                response = await followUpResult.response;
            }
        }

        return response.text();
    } catch (error) {
        console.error('Error generating response with Gemini:', error);
        return 'Sorry, I am having trouble thinking right now. Please try again.';
    }
}

/**
 * Wraps raw PCM 16-bit 8000Hz mono audio into a WAV buffer
 */
function wrapPcmToWav(pcmBuffer, sampleRate = 8000, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const audioDataLength = pcmBuffer.length;
    const fileSize = audioDataLength + 36;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(audioDataLength, 40);

    return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generate a response from an audio buffer directly using Google Gemini API
 * @param {Buffer} audioBuffer - The user speech raw audio buffer
 * @param {Object} userDoc - The MongoDB User document for the caller
 * @returns {Promise<string>} - The AI generated response
 */
async function generateResponseFromAudio(audioBuffer, userDoc) {
    try {
        const wavBuffer = wrapPcmToWav(audioBuffer);
        const userInfoContext = userDoc ? `User's current location: ${userDoc.location}\nUser's chat summary: ${userDoc.summary}\n\nYou MUST use tools to update location or summary if the user mentions them.` : '';
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION + '\n' + userInfoContext,
            tools: tools
        });

        const prompt = "Please respond to this audio query from a farmer. Act as a friendly, helpful agricultural assistant on a phone call. Keep responses short, conversational, and use simple farming terms. You MUST respond in the exact same local language that the farmer spoke in the audio. If no speech is detected, do not respond.";

        const audioPart = {
            inlineData: {
                mimeType: "audio/wav",
                data: wavBuffer.toString("base64")
            }
        };

        const result = await model.generateContent([prompt, audioPart]);
        let response = await result.response;
        const functionCalls = response.functionCalls ? response.functionCalls() : null;

        if (functionCalls && functionCalls.length > 0) {
            const functionCall = functionCalls[0];
            console.log(`Gemini called function: ${functionCall.name} with args`, functionCall.args);

            if (functionCall.name === 'search_google') {
                const searchModel = genAI.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    systemInstruction: SYSTEM_INSTRUCTION + '\n' + userInfoContext,
                    tools: [{ googleSearch: {} }]
                });
                console.log(`Executing Google Search fallback for query: "${functionCall.args.query}"`);
                const followUpPrompt = `${prompt}\n\nPlease first search Google for: "${functionCall.args.query}". 
Then, answer the farmer based on the results. Explain things very simply using plain agricultural terms, and ensure you reply in the exact same local language the farmer spoke in the audio.`;
                const searchResult = await searchModel.generateContent([followUpPrompt, audioPart]);
                response = await searchResult.response;
            } else {
                const functionResponseData = await handleFunctionCall(functionCall, userDoc);

                const followUpResult = await model.generateContent({
                    contents: [
                        { role: "user", parts: [{ text: prompt }, audioPart] },
                        { role: "model", parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }] },
                        { role: "user", parts: [{ functionResponse: { name: functionCall.name, response: functionResponseData } }] }
                    ]
                });
                response = await followUpResult.response;
            }
        }

        return response.text();
    } catch (error) {
        console.error('Error generating audio response with Gemini:', error);
        return 'Sorry, I am having trouble understanding that voice segment. Please try again.';
    }
}

/**
 * Ask Gemini to summarize the current session.
 * @param {Array<string>} chatHistoryArray - Array of AI responses from the session
 * @param {string} previousSummary - The existing user summary
 * @returns {Promise<string>} - The combined new summary
 */
async function generateSummary(chatHistoryArray, previousSummary) {
    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION
        });
        const prompt = `You are tasked with summarizing a phone call conversation between a friendly agricultural assistant and a farmer. 
Previous summary of the farmer: ${previousSummary || 'None'}

Recent AI responses to the farmer during this call:
${chatHistoryArray.join('\n')}

Based on the old summary and these recent AI responses (which imply what the farmer was asking), please provide a concise, updated summary of the farmer's situation and intent. Limit the summary to a few sentences. Ignore small talk or pleasantries. Focus on facts, crop details, weather concerns, locations, and context.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating session summary:", error);
        return previousSummary; // fallback to the old summary if something goes wrong
    }
}

module.exports = {
    generateResponse,
    generateResponseFromAudio,
    generateSummary
};