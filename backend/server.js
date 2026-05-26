const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Base test route
app.get('/', (req, res) => {
    res.send('FlashBrain Backend API is running smoothly! 🧠');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is successfully running on port ${PORT} 🚀`);
});