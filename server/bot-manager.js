const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { Pool } = require('pg');

class BotManager {
    constructor(f5aiApiKey, dbUrl) {
        this.f5aiApiKey = f5aiApiKey;
        this.f5aiClient = new F5AIClient(f5aiApiKey);
        this.bots = new Map();
        
        if (dbUrl) {
            this.pool = new Pool({
                connectionString: dbUrl,
                ssl: { rejectUnauthorized: false } // Required for Render/Heroku
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
                    model TEXT DEFAULT 'gpt-4o-mini'
                )
            `);
            console.log('Database initialized');
        } catch (err) {
            console.error('Database init error:', err.message);
        }
    }

    async loadBotsFromDb() {
        if (!this.pool) {
            console.warn('No database URL provided. Data will not be persistent.');
            return;
        }

        console.log('Loading bots from PostgreSQL...');
        try {
            const res = await this.pool.query('SELECT * FROM bots');
            for (const config of res.rows) {
                await this.createBot(config.token, config.instructions, config.model, false);
            }
            console.log(`Successfully loaded ${res.rows.length} bots`);
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
                    
                    const aiResponse = response.message.content;
                    await ctx.reply(aiResponse);
                } catch (error) {
                    console.error('Error in custom bot:', error);
                    await ctx.reply('Извините, произошла ошибка при общении с ИИ.');
                }
            });

            bot.launch()
                .then(() => console.log(`Bot with token ${token.substring(0, 10)}... started`))
                .catch((err) => console.error(`Failed to launch bot ${token.substring(0, 10)}...:`, err.message));
                
            this.bots.set(token, bot);

            if (shouldSave && this.pool) {
                await this.pool.query(
                    'INSERT INTO bots (token, instructions, model) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET instructions = $2, model = $3',
                    [token, instructions, model]
                );
            }
        } catch (error) {
            console.error(`Failed to start bot ${token.substring(0, 10)}:`, error);
        }
    }

    async stopBot(token, shouldDelete = true) {
        const bot = this.bots.get(token);
        if (bot) {
            await bot.stop('SIGTERM');
            this.bots.delete(token);
            if (shouldDelete && this.pool) {
                await this.pool.query('DELETE FROM bots WHERE token = $1', [token]);
            }
        }
    }
}

module.exports = BotManager;
