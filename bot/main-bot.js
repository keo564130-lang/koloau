process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const F5AIClient = require('../server/f5ai-client');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

if (!process.env.MAIN_BOT_TOKEN) {
    console.error('MAIN_BOT_TOKEN is not defined in .env');
    process.exit(1);
}

const bot = new Telegraf(process.env.MAIN_BOT_TOKEN);
const f5aiClient = new F5AIClient(process.env.F5AI_API_KEY);

const userSettings = new Map(); // In-memory storage for prototype

const MODELS = {
    'gpt-4o': 'GPT-4o',
    'o3-mini': 'o3-mini',
    'gpt-5': 'GPT-5 (Exp)',
    'claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
    'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
    'claude-sonnet-4-5': 'Claude 4.5 Sonnet',
    'claude-opus-4-5': 'Claude 4.5 Opus',
    'gemini-3-pro-preview': 'Gemini 3 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'deepseek-chat': 'DeepSeek V3.1',
    'deepseek-reasoner': 'DeepSeek Reasoning',
    'yandexgpt': 'YandexGPT Pro',
    'GigaChat-Pro': 'GigaChat Pro'
};

bot.start((ctx) => {
    ctx.reply('Привет! Я Koloau — твой вход в мир ИИ. Выбери модель для общения:', 
        Markup.inlineKeyboard(
            Object.keys(MODELS).map(id => [Markup.button.callback(MODELS[id], `set_model_${id}`)])
        )
    );
});

bot.action(/set_model_(.+)/, (ctx) => {
    const model = ctx.match[1];
    userSettings.set(ctx.from.id, { model });
    ctx.answerCbQuery(`Выбрана модель: ${MODELS[model]}`);
    ctx.reply(`Отлично! Теперь я буду отвечать, используя ${MODELS[model]}. Просто напиши мне что-нибудь.`);
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const settings = userSettings.get(userId) || { model: 'gpt-4o-mini' };
    
    try {
        await ctx.sendChatAction('typing');
        const response = await f5aiClient.chatCompletion([
            { role: 'user', content: ctx.message.text }
        ], settings.model);
        
        await ctx.reply(response.message.content);
    } catch (error) {
        console.error('Error in main bot:', error);
        await ctx.reply('Ошибка. Проверь API ключ в настройках сервера.');
    }
});

bot.launch()
    .then(() => console.log('Main Koloau Bot started'))
    .catch((err) => console.error('Failed to launch Main Koloau Bot:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
