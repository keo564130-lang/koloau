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

app.use(express.static(path.join(__dirname, '../web')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'));
});

const DATABASE_URL = process.env.DATABASE_URL;
const botManager = new BotManager(process.env.F5AI_API_KEY, DATABASE_URL);

// API for models
app.get('/api/models', (req, res) => {
    res.json(botManager.getModelsConfig());
});

// API for listing bots
app.get('/api/bots/list', async (req, res) => {
    try {
        const bots = await botManager.listBots();
        res.json({ success: true, bots });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/bots/create', async (req, res) => {
    const { token, instructions, model } = req.body;
    try {
        await botManager.createBot(token, instructions, model);
        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message, model, chatHistory } = req.body;
    try {
        const history = chatHistory || [];
        const response = await botManager.f5aiClient.chatCompletion([
            ...history,
            { role: 'user', content: message }
        ], model);
        res.json({ success: true, response: response.message.content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/bots/toggle', async (req, res) => {
    const { token } = req.body;
    try {
        const isActive = await botManager.toggleBotStatus(token);
        res.json({ success: true, isActive });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/bots/stop', async (req, res) => {
    const { token } = req.body;
    try {
        await botManager.stopBot(token, true);
        res.json({ success: true, message: 'Bot stopped and removed' });
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
    }

    app.listen(PORT, () => {
        console.log(`Koloau Builder Server running on port ${PORT}`);
    });
}

startServer();
