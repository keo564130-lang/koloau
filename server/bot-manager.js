const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { Pool } = require('pg');
const axios = require('axios');

const MODELS_CONFIG = {
    'openai': {
        label: 'OpenAI (Flagship)',
        models: {
            'gpt-5.2-pro': 'GPT-5.2 Pro',
            'gpt-5.1': 'GPT-5.1',
            'gpt-5': 'GPT-5 Standard',
            'gpt-5-mini': 'GPT-5 Mini',
            'o3': 'o3 Reasoning',
            'o3-mini': 'o3 Mini',
            'o4-mini': 'o4 Mini'
        }
    },
    'anthropic': {
        label: 'Anthropic (Claude 4)',
        models: {
            'claude-opus-4-5': 'Claude 4.5 Opus',
            'claude-sonnet-4-5': 'Claude 4.5 Sonnet',
            'claude-haiku-4-5': 'Claude 4.5 Haiku',
            'claude-sonnet-4-0': 'Claude 4.0 Sonnet',
            'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet'
        }
    },
    'google': {
        label: 'Google (Gemini 3)',
        models: {
            'gemini-3-pro-preview': 'Gemini 3 Pro',
            'gemini-2.5-pro': 'Gemini 2.5 Pro',
            'gemini-2.5-flash': 'Gemini 2.5 Flash'
        }
    },
    'deepseek': {
        label: 'DeepSeek (V3.1)',
        models: {
            'deepseek-chat': 'DeepSeek V3.1',
            'deepseek-reasoner': 'DeepSeek V3.1 Thinking'
        }
    },
    'russian': {
        label: 'Russian (MAX)',
        models: {
            'GigaChat-2-Max': 'GigaChat 2 Max',
            'GigaChat-Max': 'GigaChat Max',
            'yandexgpt': 'YandexGPT Pro',
            'yandexgpt-lite': 'YandexGPT Lite'
        }
    }
};

class BotManager {
    constructor(f5aiApiKey, dbUrl) {
        this.f5aiApiKey = f5aiApiKey;
        this.f5aiClient = new F5AIClient(f5aiApiKey);
        this.bots = new Map();
        
        if (dbUrl) {
            this.pool = new Pool({
                connectionString: dbUrl,
                ssl: { rejectUnauthorized: false }
            });
            this.initDb();
        }
    }

    async initDb() {
        if (!this.pool) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS bots (
                    token TEXT PRIMARY KEY,
                    instructions TEXT NOT NULL,
                    model TEXT DEFAULT 'gpt-5-nano',
                    message_count INT DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await this.pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0`);
            await this.pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id BIGINT PRIMARY KEY,
                    model TEXT DEFAULT 'gpt-5-nano',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Database initialized');
        } catch (err) {
            console.error('Database init error:', err.message);
        }
    }

    getModelsConfig() { return MODELS_CONFIG; }

    async getUserSettings(userId) {
        if (!this.pool) return { model: 'gpt-5-nano' };
        try {
            const res = await this.pool.query('SELECT model FROM user_settings WHERE user_id = $1', [userId]);
            return res.rows[0] || { model: 'gpt-5-nano' };
        } catch (err) { return { model: 'gpt-5-nano' }; }
    }

    async saveUserSettings(userId, model) {
        if (!this.pool) return;
        try {
            await this.pool.query(
                'INSERT INTO user_settings (user_id, model, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET model = $2, updated_at = CURRENT_TIMESTAMP',
                [userId, model]
            );
        } catch (err) {}
    }

    async listBots() {
        if (!this.pool) return Array.from(this.bots.keys()).map(t => ({ token: t, status: 'running', message_count: 0 }));
        try {
            const res = await this.pool.query('SELECT * FROM bots ORDER BY created_at DESC');
            return res.rows.map(row => ({
                ...row,
                status: this.bots.has(row.token) ? 'running' : 'stopped'
            }));
        } catch (err) { return []; }
    }

    async toggleBotStatus(token) {
        if (!this.pool) return;
        const res = await this.pool.query('SELECT is_active FROM bots WHERE token = $1', [token]);
        if (res.rows.length === 0) return;
        
        const newStatus = !res.rows[0].is_active;
        await this.pool.query('UPDATE bots SET is_active = $1 WHERE token = $1', [newStatus, token]);
        
        if (newStatus) {
            const botRes = await this.pool.query('SELECT * FROM bots WHERE token = $1', [token]);
            await this.createBot(botRes.rows[0].token, botRes.rows[0].instructions, botRes.rows[0].model, false);
        } else {
            await this.stopBot(token, false);
        }
        return newStatus;
    }

    async loadBotsFromDb() {
        if (!this.pool) return;
        try {
            const res = await this.pool.query('SELECT * FROM bots WHERE is_active = TRUE');
            for (const config of res.rows) {
                await this.createBot(config.token, config.instructions, config.model, false);
            }
        } catch (err) { console.error('Error loading bots:', err.message); }
    }

    async createBot(token, instructions, model = 'gpt-5-nano', shouldSave = true) {
        if (this.bots.has(token)) {
            await this.stopBot(token, false);
        }

        try {
            const bot = new Telegraf(token);
            bot.instructions = instructions;
            bot.model = model;
            
            bot.on(['text', 'photo', 'voice', 'sticker'], async (ctx) => {
                try {
                    await ctx.sendChatAction('typing');
                    let userContent = [];

                    // Handle text
                    if (ctx.message.text) {
                        userContent.push({ type: 'text', text: ctx.message.text });
                    }
                    
                    // Handle photo
                    if (ctx.message.photo) {
                        const photo = ctx.message.photo[ctx.message.photo.length - 1];
                        const link = await ctx.telegram.getFileLink(photo.file_id);
                        const response = await axios.get(link.href, { responseType: 'arraybuffer' });
                        const base64 = Buffer.from(response.data, 'binary').toString('base64');
                        userContent.push({
                            type: 'image_url',
                            image_url: { url: `data:image/jpeg;base64,${base64}` }
                        });
                        if (ctx.message.caption) {
                            userContent.push({ type: 'text', text: ctx.message.caption });
                        }
                    }

                    // Handle voice
                    if (ctx.message.voice) {
                        const voice = ctx.message.voice;
                        const link = await ctx.telegram.getFileLink(voice.file_id);
                        const response = await axios.get(link.href, { responseType: 'stream' });
                        const transcription = await this.f5aiClient.transcribeAudio(response.data);
                        userContent.push({ type: 'text', text: `[Голосовое сообщение]: ${transcription.text}` });
                    }

                    // Handle sticker
                    if (ctx.message.sticker) {
                        userContent.push({ type: 'text', text: `[Стикер]: ${ctx.message.sticker.emoji || 'без текста'}` });
                    }

                    if (userContent.length === 0) return;

                    const response = await this.f5aiClient.chatCompletion([
                        { role: 'system', content: instructions },
                        { role: 'user', content: userContent }
                    ], model);
                    
                    await ctx.reply(response.message.content);
                    
                    if (this.pool) {
                        this.pool.query('UPDATE bots SET message_count = message_count + 1 WHERE token = $1', [token]);
                    }
                } catch (error) {
                    console.error('Bot processing error:', error.message);
                    await ctx.reply('Ошибка при обработке сообщения.');
                }
            });

            bot.launch().catch(() => {});
            this.bots.set(token, bot);

            if (shouldSave && this.pool) {
                await this.pool.query(
                    'INSERT INTO bots (token, instructions, model, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT (token) DO UPDATE SET instructions = $2, model = $3, is_active = TRUE',
                    [token, instructions, model]
                );
            }
        } catch (error) { console.error(`Failed to start bot:`, error.message); }
    }

    async stopBot(token, shouldDelete = true) {
        const bot = this.bots.get(token);
        if (bot) {
            try { await bot.stop('SIGTERM'); } catch(e) {}
            this.bots.delete(token);
        }
        if (shouldDelete && this.pool) {
            await this.pool.query('DELETE FROM bots WHERE token = $1', [token]);
        } else if (this.pool) {
            await this.pool.query('UPDATE bots SET is_active = FALSE WHERE token = $1', [token]);
        }
    }
}

module.exports = BotManager;
