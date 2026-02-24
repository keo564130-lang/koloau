const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { Pool } = require('pg');

const MODELS_CONFIG = {
    'openai': {
        label: 'OpenAI',
        models: {
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o Mini',
            'o1-preview': 'o1-preview',
            'o3-mini': 'o3-mini',
            'gpt-5': 'GPT-5 (Experimental)'
        }
    },
    'anthropic': {
        label: 'Anthropic',
        models: {
            'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
            'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
            'claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
            'claude-sonnet-4-5': 'Claude 4.5 Sonnet',
            'claude-opus-4-5': 'Claude 4.5 Opus'
        }
    },
    'google': {
        label: 'Google',
        models: {
            'gemini-2.0-flash': 'Gemini 2.0 Flash',
            'gemini-1.5-pro': 'Gemini 1.5 Pro',
            'gemini-3-pro-preview': 'Gemini 3 Pro'
        }
    },
    'deepseek': {
        label: 'DeepSeek',
        models: {
            'deepseek-chat': 'DeepSeek V3.1',
            'deepseek-reasoner': 'DeepSeek Reasoning'
        }
    },
    'russian': {
        label: 'Russian Models',
        models: {
            'yandexgpt': 'YandexGPT Pro',
            'yandexgpt-lite': 'YandexGPT Lite',
            'GigaChat-Pro': 'GigaChat Pro',
            'GigaChat-Max': 'GigaChat Max'
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
            // Create bots table
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS bots (
                    token TEXT PRIMARY KEY,
                    instructions TEXT NOT NULL,
                    model TEXT DEFAULT 'gpt-4o-mini',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Create user_settings table for main bot
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id BIGINT PRIMARY KEY,
                    model TEXT DEFAULT 'gpt-4o-mini',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Database initialized');
        } catch (err) {
            console.error('Database init error:', err.message);
        }
    }

    getModelsConfig() {
        return MODELS_CONFIG;
    }

    async getUserSettings(userId) {
        if (!this.pool) return { model: 'gpt-4o-mini' };
        try {
            const res = await this.pool.query('SELECT model FROM user_settings WHERE user_id = $1', [userId]);
            return res.rows[0] || { model: 'gpt-4o-mini' };
        } catch (err) {
            return { model: 'gpt-4o-mini' };
        }
    }

    async saveUserSettings(userId, model) {
        if (!this.pool) return;
        try {
            await this.pool.query(
                'INSERT INTO user_settings (user_id, model, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (user_id) DO UPDATE SET model = $2, updated_at = CURRENT_TIMESTAMP',
                [userId, model]
            );
        } catch (err) {
            console.error('Save user settings error:', err.message);
        }
    }

    async listBots() {
        if (!this.pool) return Array.from(this.bots.keys()).map(t => ({ token: t, status: 'running' }));
        try {
            const res = await this.pool.query('SELECT * FROM bots ORDER BY created_at DESC');
            return res.rows.map(row => ({
                ...row,
                status: this.bots.has(row.token) ? 'running' : 'stopped'
            }));
        } catch (err) {
            return [];
        }
    }

    async loadBotsFromDb() {
        if (!this.pool) return;
        try {
            const res = await this.pool.query('SELECT * FROM bots');
            for (const config of res.rows) {
                await this.createBot(config.token, config.instructions, config.model, false);
            }
        } catch (err) {
            console.error('Error loading bots from DB:', err.message);
        }
    }

    async createBot(token, instructions, model = 'gpt-4o-mini', shouldSave = true) {
        if (this.bots.has(token)) {
            await this.stopBot(token, false);
        }

        try {
            const bot = new Telegraf(token);
            bot.instructions = instructions;
            bot.model = model;
            
            bot.on('text', async (ctx) => {
                const userMessage = ctx.message.text;
                try {
                    await ctx.sendChatAction('typing');
                    const response = await this.f5aiClient.chatCompletion([
                        { role: 'system', content: instructions },
                        { role: 'user', content: userMessage }
                    ], model);
                    
                    await ctx.reply(response.message.content);
                } catch (error) {
                    await ctx.reply('Ошибка. Проверьте API ключ.');
                }
            });

            bot.launch()
                .catch((err) => console.error(`Failed to launch bot:`, err.message));
                
            this.bots.set(token, bot);

            if (shouldSave && this.pool) {
                await this.pool.query(
                    'INSERT INTO bots (token, instructions, model) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET instructions = $2, model = $3',
                    [token, instructions, model]
                );
            }
        } catch (error) {
            console.error(`Failed to start bot:`, error);
        }
    }

    async stopBot(token, shouldDelete = true) {
        const bot = this.bots.get(token);
        if (bot) {
            try { await bot.stop('SIGTERM'); } catch(e) {}
            this.bots.delete(token);
            if (shouldDelete && this.pool) {
                await this.pool.query('DELETE FROM bots WHERE token = $1', [token]);
            }
        }
    }
}

module.exports = BotManager;
