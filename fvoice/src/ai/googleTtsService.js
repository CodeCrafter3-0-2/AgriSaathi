const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const path = require('path');
const crypto = require('crypto');
const { franc } = require('franc-min');

// Initialize Google Cloud TTS Client
const ttsClient = new textToSpeech.TextToSpeechClient();

/**
 * Detect the language of the text and map to Google Cloud TTS language code
 */
function detectLanguageCode(text) {
    // Restrict franc to common Indian languages and English
    const detectedLang = franc(text, {  
        minLength: 1, 
        only: ['hin', 'mar', 'guj', 'tam', 'tel', 'kan', 'mal', 'ben', 'pan', 'eng']
    });

    // Map franc ISO 639-3 codes to Google Cloud TTS BCP-47 codes
    const languageMap = {
        'hin': 'hi-IN',   // Hindi
        'mar': 'mr-IN',   // Marathi
        'guj': 'gu-IN',   // Gujarati
        'tam': 'ta-IN',   // Tamil
        'tel': 'te-IN',   // Telugu
        'kan': 'kn-IN',   // Kannada
        'mal': 'ml-IN',   // Malayalam
        'ben': 'bn-IN',   // Bengali
        'pan': 'pa-IN',   // Punjabi
        'eng': 'en-IN'    // Indian English
    };

    return languageMap[detectedLang] || 'en-IN'; // Default to Indian English if undetected
}

/**
 * Generate TTS audio (MP3) for HTTP handlers and save locally.
 * Returns the URL path to the generated audio.
 */
async function generateTTSAudioUrl(text, req) {
    try {
        const langCode = detectLanguageCode(text);
        const request = {
            input: { text: text },
            voice: { languageCode: langCode }, // Google will automatically select an appropriate voice
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        
        // Generate unique filename based on hash of text
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const filename = `${hash}.mp3`;
        const audioPath = path.join(__dirname, '../../public/audio', filename);
        
        await util.promisify(fs.writeFile)(audioPath, response.audioContent, 'binary');
        
        // Dynamically get base URL from headers or use ngrok
        const host = req.get('host');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const baseUrl = `${protocol}://${host}`;
        
        return `${baseUrl}/audio/${filename}`;
    } catch (err) {
        console.error('Error in googleTtsService generating MP3:', err);
        throw err;
    }
}

/**
 * Generate TTS raw 8kHz PCM audio for Exotel WebSockets.
 */
async function getRawTTSAudio(text) {
    const langCode = detectLanguageCode(text);
    const request = {
        input: { text: text },
        voice: { languageCode: langCode }, // Google will automatically select an appropriate voice
        audioConfig: { 
            audioEncoding: 'LINEAR16', 
            sampleRateHertz: 8000 
        },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    // Google Cloud TTS LINEAR16 includes a 44-byte WAV header we need to strip for Exotel (raw PCM)
    const rawAudio = response.audioContent.slice(44); 
    
    return rawAudio;
}

module.exports = {
    generateTTSAudioUrl,
    getRawTTSAudio,
    detectLanguageCode,
    ttsClient
};