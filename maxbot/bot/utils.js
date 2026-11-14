import { initDatabase, usersDb, authCodesDb } from './database.js';
// import { bot } from './bot.js';

// async function demo_getChatMembers(CHAT_ID) {
//     try {
//         // Вызов GET /chats/{chatId}/members через raw
//         const result = await bot.api.raw.get(`chats/${CHAT_ID}/members`, {
//             // query-параметры (необязательно)
//             // count: 50,
//             // marker: 0,
//         });

//         // result.members — массив участников (ChatMember)
//         // result.marker — указатель для следующей страницы (если есть)
//         console.log(result);
//         return result;
//     } catch (error) {
//         // 403 — бот не администратор; 401 — неверный токен; 404 — чат не найден
//         console.error('Ошибка получения участников:', error);
//     }
// }

export function checkInitDataHash(initData, botToken) {
    return true; // TODO: Implement hash checking logic here
}

export function getMaxBotUrl(param) {
    return `https://max.ru/${process.env.BOT_USERNAME}?startapp${param ? `=${param}` : ''}`
}

export function checkUser(user) {
    if (!!user && !!user.user_id) {
        let userName = user.username ?? user.name;

        let dbUser = usersDb.getOrCreate(user.user_id, {
            username: userName,
            first_name: user.first_name,
            last_name: user.last_name,
            avatar_url: user.avatar_url
        });

        let upd = {}
        if (userName != dbUser.username) { upd.username = userName }
        if (user.first_name != dbUser.first_name) { upd.first_name = user.first_name }
        if (user.last_name != dbUser.last_name) { upd.last_name = user.last_name }
        if (!!user.avatar_url && user.avatar_url != dbUser.avatar_url) { upd.avatar_url = user.avatar_url }


        if (Object.keys(upd).length > 0) {
            usersDb.update(user.user_id, upd);
            console.log('[USER1] Проверка пользователя:', user.user_id, 'Обновлено:', upd);
        }
        console.log('[USER2] Проверка пользователя:', user.user_id, 'Обновлений нет:', user.name);
    }
}

export function getPhoneFromVcf(vcfInfo) {
    if (!vcfInfo) return null;
    // Ищем строку TEL;TYPE=...:номер или TEL:номер
    const match = vcfInfo.match(/^TEL[^:]*:([+\d\s\-()]+)/im);
    if (!match) return null;
    // Очищаем от пробелов, скобок и дефисов, оставляем + и цифры
    let out = match[1].replace(/[^\d+]/g, '');

    if (out.length > 4) {
        return out;
    } else {
        return null;
    }
}

export function isUserAdmin(req, res) {
    // if (!req.user?.is_admin) {
    //     console.warn(`[API] Надо быть админом: user_id=${req.user?.user_id}`);
    //     res.status(403).json({ error: 'Admin access required' });
    //     return false
    // }
    return true
}

export function getCodeForUser(user_id) {
    // Генерируем одноразовый код авторизации
    const user = usersDb.getById(user_id);
    const code = authCodesDb.create(user_id, 60000); // TTL 60 секунд
    const url = `${process.env.WEBHOOK_DOMAIN}/app/#/auth?code=${code}`;


    console.log(`[AUTH] Создан код авторизации для user_id=${user_id}: ${code}`);
    return { code, url, user }
}