const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const fs = require('fs');
const path = require('path');

class BotManager {
    constructor(f5aiApiKey) {
        this.f5aiApiKey = f5aiApiKey;
        this.f5aiClient = new F5AIClient(f5aiApiKey);
        this.bots = new Map();
        this.dbPath = path.join(__dirname, 'bots-db.json');
        this.loadBots();
    }

    loadBots() {
        if (fs.existsSync(this.dbPath)) {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            data.forEach(config => {
                this.createBot(config.token, config.instructions, config.model, false);
            });
        }
    }

    saveBots() {
        const data = Array.from(this.bots.entries()).map(([token, bot]) => ({
            token,
            instructions: bot.instructions,
            model: bot.model
        }));
        fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
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
            if (shouldSave) this.saveBots();
        } catch (error) {
            console.error(`Failed to start bot ${token.substring(0, 10)}:`, error);
        }
    }

    async stopBot(token, shouldSave = true) {
        const bot = this.bots.get(token);
        if (bot) {
            await bot.stop('SIGTERM');
            this.bots.delete(token);
            if (shouldSave) this.saveBots();
        }
    }
}

module.exports = BotManager;
