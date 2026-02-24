const { Telegraf, Markup } = require('telegraf');
const BotManager = require('../server/bot-manager');
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bot = new Telegraf(process.env.MAIN_BOT_TOKEN);
const botManager = new BotManager(process.env.F5AI_API_KEY, process.env.DATABASE_URL);

const MODELS_CONFIG = botManager.getModelsConfig();

bot.start(async (ctx) => {
    const settings = await botManager.getUserSettings(ctx.from.id);
    ctx.reply(`Привет! Я Koloau 2.3 MAX. 🚀🎨🔊\n\nЯ теперь не только чат-бот, но и мощная творческая студия!\n\n🖌 /image <запрос> — сгенерировать картинку\n🔊 /tts <текст> — озвучить сообщение\n\nТвоя текущая модель: *${settings.model}*\n\nВыбери категорию моделей для смены:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📂 OpenAI', 'cat_openai'), Markup.button.callback('📂 Anthropic', 'cat_anthropic')],
            [Markup.button.callback('📂 Google', 'cat_google'), Markup.button.callback('📂 DeepSeek', 'cat_deepseek')],
            [Markup.button.callback('📂 Russian (MAX)', 'cat_russian')],
            [Markup.button.url('🌐 Открыть Билдер', 'https://koloau.onrender.com')]
        ])
    });
});

bot.command('image', async (ctx) => {
    const prompt = ctx.message.text.replace('/image', '').trim();
    if (!prompt) return ctx.reply('Введите запрос: /image котик в космосе');
    try {
        await ctx.sendChatAction('upload_photo');
        const res = await botManager.f5aiClient.generateImage(prompt);
        if (res.data && res.data[0].url) {
            await ctx.replyWithPhoto(res.data[0].url);
        }
    } catch (e) {
        ctx.reply('Ошибка генерации картинки.');
    }
});

bot.command('tts', async (ctx) => {
    const text = ctx.message.text.replace('/tts', '').trim();
    if (!text) return ctx.reply('Введите текст: /tts Привет, как дела?');
    try {
        await ctx.sendChatAction('record_voice');
        const buffer = await botManager.f5aiClient.generateSpeech(text);
        await ctx.replyWithVoice({ source: buffer });
    } catch (e) {
        ctx.reply('Ошибка синтеза речи.');
    }
});

bot.command('my_bots', async (ctx) => {
    const bots = await botManager.listBots();
    if (bots.length === 0) {
        return ctx.reply('У тебя пока нет созданных ботов. Создай первого на сайте!');
    }
    const list = bots.map((b, i) => `${i+1}. \`${b.token.substring(0, 10)}...\` [${b.is_active ? '✅' : '❌'}] (${b.model})`).join('\n');
    ctx.reply(`Твои боты:\n\n${list}\n\nУправлять ими можно через веб-панель.`, { parse_mode: 'Markdown' });
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
    ctx.editMessageText('Выбери категорию моделей:', {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📂 OpenAI', 'cat_openai'), Markup.button.callback('📂 Anthropic', 'cat_anthropic')],
            [Markup.button.callback('📂 Google', 'cat_google'), Markup.button.callback('📂 DeepSeek', 'cat_deepseek')],
            [Markup.button.callback('📂 Russian (MAX)', 'cat_russian')]
        ])
    });
});

bot.action(/set_model_(.+)/, async (ctx) => {
    const model = ctx.match[1];
    await botManager.saveUserSettings(ctx.from.id, model);
    ctx.answerCbQuery(`Модель установлена!`);
    ctx.reply(`✅ Готово! Теперь я отвечаю через *${model}*.`, { parse_mode: 'Markdown' });
});

bot.on(['text', 'photo', 'voice', 'sticker'], async (ctx) => {
    if (ctx.message.text && (ctx.message.text.startsWith('/image') || ctx.message.text.startsWith('/tts'))) return;
    
    const settings = await botManager.getUserSettings(ctx.from.id);
    const instructions = "Ты — Koloau, универсальный AI ассистент. Ты дружелюбен и помогаешь пользователям. Описывай фото, слушай голос и отвечай на вопросы.";
    
    try {
        await ctx.sendChatAction('typing');
        let userContent = [];

        if (ctx.message.text) {
            userContent.push({ type: 'text', text: ctx.message.text });
        }
        
        if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const link = await ctx.telegram.getFileLink(photo.file_id);
            const response = await axios.get(link.href, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` }
            });
            if (ctx.message.caption) {
                userContent.push({ type: 'text', text: ctx.message.caption });
            }
        }

        if (ctx.message.voice) {
            const voice = ctx.message.voice;
            const link = await ctx.telegram.getFileLink(voice.file_id);
            const response = await axios.get(link.href, { responseType: 'arraybuffer' });
            const transcription = await botManager.f5aiClient.transcribeAudio(Buffer.from(response.data));
            userContent.push({ type: 'text', text: `[Голосовое сообщение]: ${transcription.text || 'пусто'}` });
        }

        if (ctx.message.sticker) {
            userContent.push({ type: 'text', text: `[Стикер]: ${ctx.message.sticker.emoji || 'без текста'}` });
        }

        if (userContent.length === 0) return;

        const aiResponse = await botManager.f5aiClient.chatCompletion([
            { role: 'system', content: instructions },
            { role: 'user', content: userContent }
        ], settings.model);
        
        await ctx.reply(aiResponse.message.content);
    } catch (error) {
        console.error('Main bot error:', error.message);
        await ctx.reply('Упс, что-то пошло не так.');
    }
});

bot.launch().then(() => console.log('Main Koloau Bot started')).catch(err => console.error(err));
