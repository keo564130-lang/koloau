const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { Pool } = require('pg');

const MODELS_CONFIG = {
    'openai': {
        label: 'OpenAI (Next-Gen)',
        models: {
            'gpt-5': 'GPT-5 (Standard)',
            'gpt-5.3': 'GPT-5.3 (Latest)',
            'o3-ultra': 'o3-ultra',
            'gpt-4o-extreme': 'GPT-4o Extreme'
        }
    },
    'anthropic': {
        label: 'Anthropic (Claude 4)',
        models: {
            'claude-4-opus-latest': 'Claude 4 Opus',
            'claude-4-sonnet-latest': 'Claude 4 Sonnet',
            'claude-4.6-opus': 'Claude 4.6 Opus',
            'claude-4.6-sonnet': 'Claude 4.6 Sonnet'
        }
    },
    'google': {
        label: 'Google (Gemini 3)',
        models: {
            'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
            'gemini-3-flash-latest': 'Gemini 3 Flash',
            'gemini-3-deepthink': 'Gemini 3 DeepThink'
        }
    },
    'deepseek': {
        label: 'DeepSeek (V4)',
        models: {
            'deepseek-v4': 'DeepSeek V4',
            'deepseek-reasoner-v4': 'DeepSeek V4 Reasoner'
        }
    },
    'xai': {
        label: 'xAI (Grok)',
        models: {
            'grok-4.20': 'Grok 4.20',
            'grok-3.5-bolt': 'Grok 3.5 Bolt'
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
