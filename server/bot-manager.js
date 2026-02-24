const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const mongoose = require('mongoose');

// Define Bot Schema for MongoDB
const botSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    instructions: { type: String, required: true },
    model: { type: String, default: 'gpt-4o-mini' }
});

const BotModel = mongoose.model('Bot', botSchema);

class BotManager {
    constructor(f5aiApiKey) {
        this.f5aiApiKey = f5aiApiKey;
        this.f5aiClient = new F5AIClient(f5aiApiKey);
        this.bots = new Map();
        // Database loading is now handled asynchronously in index.js
    }

    async loadBotsFromDb() {
        console.log('Loading bots from database...');
        const configs = await BotModel.find({});
        for (const config of configs) {
            await this.createBot(config.token, config.instructions, config.model, false);
        }
        console.log(`Successfully loaded ${configs.length} bots`);
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

            if (shouldSave) {
                await BotModel.findOneAndUpdate(
                    { token },
                    { instructions, model },
                    { upsert: true, new: true }
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
            if (shouldDelete) {
                await BotModel.deleteOne({ token });
            }
        }
    }
}

module.exports = BotManager;
