const express = require('express');
const path = require('path');
const exotelRoutes = require('./routes/exotelRoutes');
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fvoice')
.then(() => console.log('Connected to MongoDB.'))
.catch(err => console.error('MongoDB connection error:', err));


// Initialize the Express app
const app = express();

// Serve statically generated audio files
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

// Middleware to parse JSON bodies (optional, just in case)
app.use(express.json());

// Mount Exotel routes under /exotel
app.use('/exotel', exotelRoutes);

module.exports = app;