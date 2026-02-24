const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const F5AIClient = require('../server/f5ai-client');
const BotManager = require('../server/bot-manager');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const bot = new Telegraf(process.env.MAIN_BOT_TOKEN);
const botManager = new BotManager(process.env.F5AI_API_KEY, process.env.DATABASE_URL);
const f5aiClient = new F5AIClient(process.env.F5AI_API_KEY);

const MODELS_CONFIG = botManager.getModelsConfig();

const DASHBOARD_URL = 'https://koloau.onrender.com';

// Global Reset for Menu Button (Removes "Console MAX" for all users)
bot.telegram.setChatMenuButton({ type: 'default' })
    .then(() => console.log('Telegram Menu Button reset to default globally.'))
    .catch(err => console.error('Failed to reset menu button:', err.message));

const SOUL_TEMPLATES = {
    'expert': { name: '🧠 AI Expert', desc: 'Advanced analysis and coding.', prompt: 'You are a technical AI expert. Provide deep and accurate answers.' },
    'creative': { name: '🎨 Creative', desc: 'Storytelling and roleplay.', prompt: 'You are a creative soul. Be artistic and engaging.' },
    'support': { name: '🤝 Support', desc: 'Helpful and polite assistant.', prompt: 'You are a friendly support assistant.' },
    'pure': { name: '🔗 Pure Relay', desc: 'Direct bridge to models.', prompt: 'Answer as a helpful assistant.' }
};

bot.start(async (ctx) => {
    console.log(`Bot started for user ${ctx.from.id}`);
    const settings = await botManager.getUserSettings(ctx.from.id);
    ctx.reply(`Koloau Hub: AI Soul Relay 🚀\n\nТвоя модель: *${settings.model}*\n\nОживи своего бота:\n1. Получи токен у @BotFather\n2. Выбери "Душу" в /souls\n3. Примени команду /bond\n\nИли управляй всем через веб-панель:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.url('🌐 Открыть Dashboard', DASHBOARD_URL)],
            [Markup.button.callback('📂 OpenAI', 'cat_openai'), Markup.button.callback('📂 Наши (RU)', 'cat_russian')],
            [Markup.button.callback('✨ Выбрать Soul', 'list_souls')]
        ])
    });
});

bot.command('souls', (ctx) => {
    const list = Object.entries(SOUL_TEMPLATES).map(([id, s]) => `*${s.name}*: ${s.desc} (\`/bond token ${id}\`)`).join('\n\n');
    ctx.reply(`Доступные "Souls":\n\n${list}`, { parse_mode: 'Markdown' });
});

bot.command('bond', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Формат: /bond <токен> <id_души>\nПример: \`/bond 123:ABC expert\`');
    
    const token = args[1];
    const soulId = args[2].toLowerCase();
    const soul = SOUL_TEMPLATES[soulId];
    
    if (!soul) return ctx.reply('Такой "души" нет. Список в /souls');

    ctx.reply('Начинаю "Бондинг"... 🧬');
    try {
        await botManager.createBot(token, soul.prompt, 'gpt-5.2-pro');
        ctx.reply('✅ Bonded! Твой бот теперь живой. Проверь его!');
    } catch (e) {
        ctx.reply('❌ Ошибка активации: ' + e.message);
    }
});

bot.action('list_souls', (ctx) => {
    const buttons = Object.entries(SOUL_TEMPLATES).map(([id, s]) => [Markup.button.callback(s.name, `info_soul_${id}`)]);
    ctx.editMessageText('Выбери "Душу" для проекта:', Markup.inlineKeyboard(buttons));
});

bot.action(/info_soul_(.+)/, (ctx) => {
    const id = ctx.match[1];
    const s = SOUL_TEMPLATES[id];
    ctx.editMessageText(`*${s.name}*\n\n${s.desc}\n\nКоманда:\n\`/bond <token> ${id}\``, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'list_souls')]])
    });
});

bot.action(/cat_(.+)/, (ctx) => {
    const catId = ctx.match[1];
    const category = MODELS_CONFIG[catId];
    if (!category) return ctx.answerCbQuery('Error');
    const buttons = Object.keys(category.models).map(id => [Markup.button.callback(category.models[id], `set_model_${id}`)]);
    buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_cats')]);
    ctx.editMessageText(`Модели ${category.label}:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
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
