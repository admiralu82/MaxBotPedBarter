import 'dotenv/config';
import './logger.js';
import { Bot, Webhook } from '@maxhub/max-bot-api';
import { Keyboard } from '@maxhub/max-bot-api';
import { initDatabase, usersDb, authCodesDb } from './database.js';
import { startApiServer } from './api.js';
import { checkUser, getPhoneFromVcf, getCodeForUser, getMaxBotUrl } from './utils.js';

export const bot = new Bot(process.env.BOT_TOKEN);

// webhook configuration
const WH_PARAM = {
    domain: process.env.WEBHOOK_DOMAIN,
    path: `/webhook/${Webhook.generateTokenRelatedHash(process.env.BOT_TOKEN)}`,
    secret: process.env.WEBHOOK_SECRET
}
// Регистрируем webhook в MAX и получаем готовый (req, res)-колбэк
const handleUpdate = await bot.createWebhook({
    ...WH_PARAM,
    allowedUpdates: ['message_created', "message_callback", "bot_started", "bot_added"],
});

// Инициализация базы данных при старте
initDatabase();

// Очистка истекших кодов авторизации каждые 5 минут
setInterval(() => {
    authCodesDb.cleanup();
}, 5 * 60 * 1000);

bot.catch(async (error, ctx) => {
    console.error('Необработанная ошибка middleware', error, ctx.update);
});



await bot.api.setMyCommands([
    {
        name: 'start',
        description: 'Авторизация и управление материалами',
    }
]);

// Команда /start с меню
bot.command('start', async (ctx) => {
    console.log('Команда /start вызвана пользователем:', ctx?.message?.from ?? ctx?.message?.sender ?? 0);
    const user = ctx?.message?.from ?? ctx?.message?.sender ?? 0;
    checkUser(user);

    await showMenu(ctx);
});

async function showMenu(ctx) {
    await ctx.reply('Добро пожаловать! Выберите действие:', {
        attachments: [
            Keyboard.inlineKeyboard([
                [Keyboard.button.requestContact('Авторизоваться')],
            ])
        ]
    });
}

// Обработка входящих сообщений
bot.on('message_callback', async (ctx) => {
    console.log('Получено сообщение message_callback');

    var user = ctx?.message?.from ?? ctx?.message?.sender ?? 0;
    checkUser(user);
})


bot.on('message_created', async (ctx) => {
    var user = ctx?.message?.from ?? ctx?.message?.sender ?? 0;
    checkUser(user);

    const messageText = ctx?.message?.body?.text || '';
    console.log('Получено сообщение:', messageText);

    if (messageText != "") await showMenu(ctx);

    const contact = ctx?.message?.body?.attachments?.[0] ?? false;
    if (contact && contact.type === 'contact' && contact?.payload?.vcf_info) {

        const phone = getPhoneFromVcf(contact.payload.vcf_info);
        console.log('[AUTH] Пользователь отправил контакт:', user.user_id);
        console.log('[AUTH] Телефон из контакта:', phone);

        // Обновляем пользователя в БД с телефоном
        usersDb.update(user.user_id, { phone: phone });

        // Генерируем одноразовый код авторизации
        const { code, url: urlCode } = getCodeForUser(user.user_id);

        // Отправляем пользователю ссылку для открытия панели управления
        await ctx.reply('Авторизация успешна! Откройте сайт:', {
            attachments: [
                Keyboard.inlineKeyboard([
                    [Keyboard.button.link('Открыть в МАКСЕ', getMaxBotUrl('app'))],
                    // [Keyboard.button.link('Открыть в браузере', urlCode)],
                ])
            ]
        });
    }
});

// Обработка события bot_started
bot.on('bot_started', async (ctx) => {
    console.log('[BOT_STARTED] Событие получено');
    var user = ctx?.message?.from ?? ctx?.message?.sender ?? ctx?.user ?? 0;
    console.log(`[BOT_STARTED] Регистрация пользователя: user_id=${user.user_id}`);
    checkUser(user);

    await showMenu(ctx);

    if (!user.user_id) {
        console.warn('[BOT_STARTED] Не удалось извлечь данные пользователя из события');
    }
});



// Запуск API сервера
startApiServer(handleUpdate, WH_PARAM);
console.log('Бот запущен');