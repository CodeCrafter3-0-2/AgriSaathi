/**
 * Generate a response for Exotel
 * Exotel typically expects plain text for its Dynamic Text applets to perform Text-to-Speech (TTS).
 * @param {string} message - The initial greeting or repeated message
 * @returns {string} - Plain text string
 */
function handleIncomingCall(message = "Hi there! How can I help you today?") {
    // Exotel Dynamic Text applet reads plain text responses
    return message;
}

/**
 * Generate plain text to read back the AI response 
 * @param {string} message - The AI response
 * @returns {string} - Plain text string
 */
function handleAIResponse(message) {
    return message;
}

/**
 * Generate text for unexpected errors
 * @returns {string} - Plain text string
 */
function handleErrorResponse() {
    return "Sorry, an error occurred while processing your request. Please try again later.";
}

module.exports = {
    handleIncomingCall,
    handleAIResponse,
    handleErrorResponse
};