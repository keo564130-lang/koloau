const { Telegraf } = require('telegraf');
const F5AIClient = require('./f5ai-client');
const { createClient } = require('@supabase/supabase-js');

class BotManager {
    constructor(f5aiApiKey, supabaseUrl, supabaseKey) {
        this.f5aiApiKey = f5aiApiKey;
        this.f5aiClient = new F5AIClient(f5aiApiKey);
        this.bots = new Map();
        
        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
    }

    async loadBotsFromDb() {
        if (!this.supabase) {
            console.warn('Supabase not configured. Skipping bot load.');
            return;
        }

        console.log('Loading bots from Supabase...');
        const { data, error } = await this.supabase
            .from('bots')
            .select('*');

        if (error) {
            console.error('Error loading bots from Supabase:', error.message);
            return;
        }

        if (data) {
            for (const config of data) {
                await this.createBot(config.token, config.instructions, config.model, false);
            }
            console.log(`Successfully loaded ${data.length} bots`);
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

            if (shouldSave && this.supabase) {
                await this.supabase
                    .from('bots')
                    .upsert({ token, instructions, model }, { onConflict: 'token' });
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
            if (shouldDelete && this.supabase) {
                await this.supabase
                    .from('bots')
                    .delete()
                    .eq('token', token);
            }
        }
    }
}

module.exports = BotManager;
