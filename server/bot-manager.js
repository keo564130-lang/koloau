const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { Pool } = require('pg');

const MODELS_CONFIG = {
    'openai': {
        label: 'OpenAI (Next-Gen)',
        models: {
            'gpt-5.3': 'GPT-5.3 (Latest)',
            'gpt-5': 'GPT-5 Standard',
            'o3-ultra': 'o3-ultra Reasoning',
            'gpt-4o-extreme': 'GPT-4o Extreme',
            'gpt-4o-mini-v2': 'GPT-4o Mini v2'
        }
    },
    'anthropic': {
        label: 'Anthropic (Claude 4.6)',
        models: {
            'claude-4.6-opus': 'Claude 4.6 Opus',
            'claude-4.6-sonnet': 'Claude 4.6 Sonnet',
            'claude-4-haiku-v2': 'Claude 4 Haiku v2',
            'claude-3.7-legacy': 'Claude 3.7 (Legacy)'
        }
    },
    'google': {
        label: 'Google (Gemini 3.1)',
        models: {
            'gemini-3.1-pro': 'Gemini 3.1 Pro',
            'gemini-3.1-flash': 'Gemini 3.1 Flash',
            'gemini-3-pro-ultra': 'Gemini 3 Ultra',
            'gemini-3-deepthink-v2': 'Gemini 3 DeepThink v2'
        }
    },
    'deepseek': {
        label: 'DeepSeek (V4.1)',
        models: {
            'deepseek-v4.1': 'DeepSeek V4.1',
            'deepseek-reasoner-v4': 'DeepSeek V4 Reasoner',
            'deepseek-coder-v4': 'DeepSeek V4 Coder'
        }
    },
    'xai': {
        label: 'xAI (Grok)',
        models: {
            'grok-4.20': 'Grok 4.20 (Super)',
            'grok-3.5-bolt': 'Grok 3.5 Bolt'
        }
    },
    'russian': {
        label: 'Russian (MAX)',
        models: {
            'yandexgpt-4-pro': 'YandexGPT 4 Pro',
            'yandexgpt-4-lite': 'YandexGPT 4 Lite',
            'gigachat-max-2': 'GigaChat Max 2.0',
            'sber-reasoner': 'Sber Reasoner'
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
                    model TEXT DEFAULT 'gpt-4o-mini',
                    message_count INT DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Add missing columns if they don't exist (migrations)
            await this.pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0`);
            await this.pool.query(`ALTER TABLE bots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id BIGINT PRIMARY KEY,
                    model TEXT DEFAULT 'gpt-4o-mini',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Database initialized with analytics support');
        } catch (err) {
            console.error('Database init error:', err.message);
        }
    }

    getModelsConfig() { return MODELS_CONFIG; }

    async getUserSettings(userId) {
        if (!this.pool) return { model: 'gpt-5' };
        try {
            const res = await this.pool.query('SELECT model FROM user_settings WHERE user_id = $1', [userId]);
            return res.rows[0] || { model: 'gpt-5' };
        } catch (err) { return { model: 'gpt-5' }; }
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

    async createBot(token, instructions, model = 'gpt-5', shouldSave = true) {
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
                    
                    // Analytics: Increment message count
                    if (this.pool) {
                        this.pool.query('UPDATE bots SET message_count = message_count + 1 WHERE token = $1', [token]);
                    }
                } catch (error) {
                    await ctx.reply('Ошибка. Проверьте настройки.');
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
