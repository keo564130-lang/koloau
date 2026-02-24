process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const BotManager = require('./bot-manager');

const app = express();
app.use(cors());
app.use(express.json());

// Serving static files from the 'web' directory
app.use(express.static(path.join(__dirname, '../web')));

// Root route to serve index.html explicitly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
});

const DATABASE_URL = process.env.DATABASE_URL;

const botManager = new BotManager(process.env.F5AI_API_KEY, DATABASE_URL);

app.post('/api/bots/create', async (req, res) => {
    const { token, instructions, model } = req.body;
    try {
        await botManager.createBot(token, instructions, model);
        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    if (DATABASE_URL) {
        try {
            await botManager.loadBotsFromDb();
        } catch (err) {
            console.error('Database initialization error:', err.message);
        }
    } else {
        console.warn('DATABASE_URL not found. Data will NOT be persistent!');
    }

    app.listen(PORT, () => {
        console.log(`Koloau Builder Server running on port ${PORT}`);
    });
}

startServer();
