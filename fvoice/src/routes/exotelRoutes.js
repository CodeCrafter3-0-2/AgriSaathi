const express = require('express');
const { handleIncomingCall, handleAIResponse, handleErrorResponse } = require('../telephony/exotelHandler');
const { generateResponse } = require('../ai/geminiService');
const User = require('../models/User');

const router = express.Router();

/**
 * GET/POST /exotel/voice
 * Handle the initial incoming call from Exotel passthru applet.
 */
router.all('/voice', async (req, res) => {
    try {
        const phoneNumber = req.body?.From || req.query?.From || 'Unknown';
        
        if (phoneNumber !== 'Unknown') {
            await User.findOneAndUpdate(
                { phoneNumber }, 
                { $setOnInsert: { phoneNumber } }, 
                { upsert: true }
            );
        }

        // Generate a plain text greeting for Exotel's Dynamic Text Applet
        const responseText = handleIncomingCall();
        console.log("response", responseText)

        // Respond to Exotel (Expects HTTP 200 with plain text for TTS)
        res.type('text/plain').status(200).send(responseText);
    } catch (error) {
        console.error('Error handling Exotel /voice:', error);
        res.type('text/plain').status(500).send(handleErrorResponse());
    }
});

/**
 * GET/POST /exotel/process-speech
 * Receive the user's speech from Exotel, send it to Gemini, and reply back.
 * Note: Exotel's STT field naming depends on your specific applet configuration.
 */
router.all('/process-speech', async (req, res) => {
    try {
        console.log("Exotel Webhook Body:", req.body);
        console.log("Exotel Webhook Query:", req.query);

        // Extract speech text based on Exotel's webhook payload (check both body for POST and query for GET)
        const userSpeech = req.body?.TranscriptionText || req.body?.text || req.body?.CustomField || req.query?.TranscriptionText || req.query?.text || req.query?.CustomField || req.body?.Digits || req.query?.Digits || req.body?.Body;
        
        console.log(`Exotel User said: "${userSpeech}"`);

        // If the user didn't say anything, ask them again
        if (!userSpeech) {
            console.log('No speech detected from Exotel. Re-asking.');
            const retryText = handleIncomingCall('I did not catch that. How can I help you?');
            return res.type('text/plain').status(200).send(retryText);
        }

        const phoneNumber = req.body?.From || req.query?.From || 'Unknown';
        
        let userDoc = null;
        if (phoneNumber !== 'Unknown') {
            userDoc = await User.findOneAndUpdate(
                { phoneNumber },
                { $setOnInsert: { phoneNumber } },
                { upsert: true, new: true }
            );
        }

        // Call Gemini API to generate a response
        console.log('Generating Exotel response with Gemini...');
        const aiResponseText = await generateResponse(userSpeech, userDoc);
        
        console.log(`AI Replied: "${aiResponseText}"`);

        // Get the plain text response to send back
        const responseText = handleAIResponse(aiResponseText);
        
        // Respond to Exotel
        res.type('text/plain').status(200).send(responseText);
    } catch (error) {
        console.error('Error in Exotel /process-speech:', error);
        res.type('text/plain').status(500).send(handleErrorResponse());
    }
});

module.exports = router;