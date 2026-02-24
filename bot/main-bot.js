const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const F5AIClient = require('../server/f5ai-client');
const BotManager = require('../server/bot-manager');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const bot = new Telegraf(process.env.MAIN_BOT_TOKEN);
const botManager = new BotManager(process.env.F5AI_API_KEY, process.env.DATABASE_URL);
const f5aiClient = new F5AIClient(process.env.F5AI_API_KEY);

const MODELS_CONFIG = botManager.getModelsConfig();

const WEB_APP_URL = 'https://koloau.onrender.com';

bot.start(async (ctx) => {
    // Set the Bottom Menu Button for this user
    try {
        await ctx.setChatMenuButton({
            type: 'web_app',
            text: 'Консоль MAX',
            web_app: { url: WEB_APP_URL }
        });
    } catch (e) {}

    const settings = await botManager.getUserSettings(ctx.from.id);
    ctx.reply(`Привет! Я Koloau 2.5 MAX. 🚀\n\nТвоя текущая модель: *${settings.model}*\n\nВыбери категорию для смены модели или открой консоль управления флотом:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Консоль Управления', WEB_APP_URL)],
            [Markup.button.callback('📂 OpenAI', 'cat_openai'), Markup.button.callback('📂 Anthropic', 'cat_anthropic')],
            [Markup.button.callback('📂 Google', 'cat_google'), Markup.button.callback('📂 DeepSeek', 'cat_deepseek')],
            [Markup.button.callback('📂 Russian (MAX)', 'cat_russian')],
            [Markup.button.callback('🤖 Мои Боты', 'my_bots_list')]
        ])
    });
});

bot.action(/cat_(.+)/, (ctx) => {
    const catId = ctx.match[1];
    const category = MODELS_CONFIG[catId];
    
    if (!category) return ctx.answerCbQuery('Категория не найдена');

    const buttons = Object.keys(category.models).map(id => [
        Markup.button.callback(category.models[id], `set_model_${id}`)
    ]);
    buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_cats')]);

    ctx.editMessageText(`Выбери модель из категории *${category.label}*:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
    });
});

bot.action('back_to_cats', (ctx) => {
    ctx.editMessageText('Выбери категорию моделей:', Markup.inlineKeyboard([
        [Markup.button.callback('📂 OpenAI', 'cat_openai'), Markup.button.callback('📂 Anthropic', 'cat_anthropic')],
        [Markup.button.callback('📂 Google', 'cat_google'), Markup.button.callback('📂 DeepSeek', 'cat_deepseek')],
        [Markup.button.callback('📂 Наши (RU)', 'cat_russian')]
    ]));
});

bot.action(/set_model_(.+)/, async (ctx) => {
    const model = ctx.match[1];
    await botManager.saveUserSettings(ctx.from.id, model);
    ctx.answerCbQuery(`Модель установлена!`);
    ctx.reply(`✅ Готово! Теперь я отвечаю через *${model}*.`, { parse_mode: 'Markdown' });
});

bot.command('my_bots', async (ctx) => {
    const bots = await botManager.listBots();
    if (bots.length === 0) {
        return ctx.reply('У тебя пока нет созданных ботов. Создай первого на сайте!');
    }
    
    const list = bots.map((b, i) => `${i+1}. \`${b.token.substring(0, 10)}...\` [${b.status === 'running' ? '✅' : '❌'}]`).join('\n');
    ctx.reply(`Твои запущенные боты:\n\n${list}\n\nУправлять ими можно через веб-панель.`, { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
    const settings = await botManager.getUserSettings(ctx.from.id);
    try {
        await ctx.sendChatAction('typing');
        const response = await f5aiClient.chatCompletion([
            { role: 'user', content: ctx.message.text }
        ], settings.model);
        await ctx.reply(response.message.content);
    } catch (error) {
        ctx.reply('Ошибка. Проверь настройки сервера.');
    }
});

bot.launch().catch(err => console.error('Launch error:', err));
