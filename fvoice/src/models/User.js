const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        type: String,
        default: 'Unknown'
    },
    summary: {
        type: String,
        default: 'No summary available yet.'
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
