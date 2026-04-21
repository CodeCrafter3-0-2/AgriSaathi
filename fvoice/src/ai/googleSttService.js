const speech = require('@google-cloud/speech');

// Initialize Google Cloud Client for Speech-To-Text
const sttClient = new speech.SpeechClient();

/**
 * Function to convert raw 8kHz PCM audio buffer to text
 * Supports multi-language detection.
 * @param {Buffer} audioBuffer - The raw 8kHz linear16 audio buffer
 * @returns {Promise<string>} - The transcribed text
 */
async function transcribeAudio(audioBuffer) {
    try {
        const audio = { content: audioBuffer.toString('base64') };

        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 8000,
            // languageCode is still required as the "primary" or "default"
           
        };

        const request = { audio, config };

        const [response] = await sttClient.recognize(request);

        // The API returns the detected language code in the result
        const transcription = response.results
            .map(result => {
                if (result.languageCode) {
                    console.log(`Detected Language: ${result.languageCode}`);
                }
                return result.alternatives[0].transcript;
            })
            .join('\n');

        return transcription;
    } catch (err) {
        console.error('Error transcribing audio:', err);
        return '';
    }
}

module.exports = {
    transcribeAudio
};