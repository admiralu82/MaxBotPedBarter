import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { groupsDb, usersDb, filesDb, notesDb, attachmentsDb, authCodesDb } from './database.js';
import { generateJWT } from './auth.js';
import { authMiddleware, originRestriction, requireAuthForMutations } from './middleware/auth.js';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { BASE_DIR, AUTH_COOKIE, USER_COOKIE } from './logger.js';
import { isUserAdmin, getCodeForUser, checkInitDataHash, checkUser, getMaxBotUrl  } from './utils.js';
import { bot } from './index.js';



const app = express();
const PORT = process.env.API_PORT || 3000;
const FILESDIR = join(BASE_DIR, 'files');
const APPDIR = join(BASE_DIR, 'app');

// Создаем каталог для файлов, если не существует
if (!existsSync(FILESDIR)) {
    mkdirSync(FILESDIR, { recursive: true });
    console.log(`[FILES] Создан каталог для файлов: ${FILESDIR}`);
}

// Максимальная длина имени в байтах UTF-8 (с запасом под префикс file_id_ и лимит ФС в 255 байт)
const MAX_NAME_BYTES = 180;

function truncateToBytes(str, maxBytes) {
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return str;
    let end = maxBytes;
    // не разрываем многобайтовый символ
    while (end > 0 && (buf[end] & 0xC0) === 0x80) end--;
    return buf.subarray(0, end).toString('utf8');
}

/**
 * Приводит имя файла к безопасному виду для ФС и для сборки пути `${file_id}_${name}`.
 * Русские буквы, пробелы и точки сохраняются; режутся только то, что ломает путь
 * или запись на диск (разделители, управляющие символы, недопустимые в Windows символы).
 */
function sanitizeFileName(name) {
    let result = (typeof name === 'string' ? name : '')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[\\/]/g, '_')
        .replace(/[<>:"|?*]/g, '_')
        .trim();

    if (result === '' || result === '.' || result === '..') result = 'file';

    // обрезаем, сохраняя расширение
    if (Buffer.byteLength(result, 'utf8') > MAX_NAME_BYTES) {
        const dot = result.lastIndexOf('.');
        const ext = dot > 0 ? result.slice(dot) : '';
        const base = dot > 0 ? result.slice(0, dot) : result;
        const extTrimmed = Buffer.byteLength(ext, 'utf8') <= 20 ? ext : '';
        result = truncateToBytes(base, MAX_NAME_BYTES - Buffer.byteLength(extTrimmed, 'utf8')) + extTrimmed;
    }

    return result;
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, FILESDIR);
    },
    filename: (req, file, cb) => {
        // Генерируем file_id и формируем имя файла как file_id_originalname
        const fileId = (Date.now() / 1000).toFixed() + '_' + Math.random().toString(36).substring(2, 5);
        req.generatedFileId = fileId; // Сохраняем для использования в роуте
        // Имя на диске и имя в БД должны совпадать: путь всегда собирается как `${file_id}_${name}`
        req.safeFileName = sanitizeFileName(file.originalname);
        cb(null, `${fileId}_${req.safeFileName}`);
    }
});

// defParamCharset: 'utf8' - busboy по умолчанию декодирует filename из multipart как latin1,
// из-за чего русские имена превращаются в мусор ("Ð\u0090Ñ\u0080Ñ\u0085ÐµÐ¾Ð»Ð¾Ð³Ð¸Ñ\u008f ...").
const upload = multer({ storage, defParamCharset: 'utf8' });

// app.use(cors());
app.use(cookieParser());
app.use('/api', express.json());

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

app.use('/app', express.static(APPDIR));

// SPA использует hash-роутер: реальный адрес страницы авторизации — /app/#/auth.
// Ссылки, отправленные ботом ранее (и уже лежащие в чатах), приходят как /app/auth?code=...
// Редиректим их в hash-форму, сохраняя query.
app.get('/app/auth', (req, res) => {
    const query = req.originalUrl.split('?')[1];
    res.redirect(302, `/app/#/auth${query ? `?${query}` : ''}`);
});

// ========== ПРАВА НА ИЗМЕНЕНИЕ ==========

const isAdminRequest = (req) => req.user?.is_admin === 1;

/**
 * Проверка права на изменение материала: автор материала или администратор.
 * Возвращает { note } при успехе либо { status, error } для ответа клиенту.
 * Смотреть материалы может любой, менять — только автор и админ.
 */
function resolveNoteEditor(req, rawNoteId) {
    const noteId = parseInt(rawNoteId);
    const note = notesDb.getById(noteId);

    if (!note) {
        return { status: 404, error: 'Note not found' };
    }

    if (!isAdminRequest(req) && req.user?.user_id !== note.user_id) {
        return { status: 403, error: 'Only author or admin can change this note' };
    }

    return { note };
}

// ========== API ROUTES ==========

// Применяем middleware к /api/* (кроме /api/auth/exchange)
app.use('/api', (req, res, next) => {
    if (req.path === '/auth/exchange') {
        return next(); // Пропускаем проверку origin для обмена кода
    }
    originRestriction(req, res, next);
});

app.use('/api', authMiddleware);
// app.use('/api', requireAuthForMutations);

// ----- AUTH -----

app.get('/app/auth/redirect', (req, res) => {
    return res.redirect(302, getMaxBotUrl('auth'));
});

/**
 * POST /api/auth/exchange
 * Обмен одноразового кода на JWT токен
 */
app.post('/api/auth/exchange', (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }

    const authData = authCodesDb.get(code);

    if (!authData || authData.expires < Date.now()) {
        console.warn(`[AUTH] Невалидный или истекший код: ${code}`);
        return res.status(401).json({ error: 'Invalid or expired code' });
    }

    // Удаляем одноразовый код
    authCodesDb.delete(code);


    let out = authProcess(req, res, authData.user_id);
    if (out.error) {
        return res.status(404).json(out);
    } else {
        res.json(out);
    }
});

function authProcess(req, res, user_id) {
    // Получаем пользователя
    const user = usersDb.getById(user_id);

    if (!user) {
        console.error(`[AUTH] Пользователь не найден: user_id=${user_id}`);
        return { error: 'User not found' };
    }

    // Генерируем JWT
    const token = generateJWT({
        user_id: user.user_id,
        is_admin: user.is_admin
    });

    // Устанавливаем cookie
    res.cookie(AUTH_COOKIE, token, {
        httpOnly: true,
        secure: true, // только HTTPS
        sameSite: 'strict', // для кросс-доменных запросов, если фронт на другом домене
        maxAge: 365 * 24 * 60 * 60 * 1000 // 1 год
    });

    res.cookie(USER_COOKIE, JSON.stringify(user), {
        httpOnly: true,
        secure: true, // только HTTPS
        sameSite: 'strict',
    });

    console.log(`[AUTH] Успешная авторизация: user_id=${user.user_id}, is_admin=${user.is_admin}`);
    user.token = token; // добавляем токен в объект пользователя для ответа клиенту
    return user
}

app.post('/api/sendmsg', (req, res) => {
    const { from_id, to_id, message } = req.body;
    console.log(`[MSG] Сообщение от ${from_id} к ${to_id}: ${message}`);
    // Здесь можно добавить логику отправки сообщения, например, через WebSocket или другой сервис
    let from_user = usersDb.getById(from_id);

    let out_message = `Сообщение от [${from_user?.username || from_user?.first_name || 'Пользователь'} ${from_user?.phone || ''}]: ${message}`;


    bot.api.sendMessageToUser(to_id, out_message);


    res.json({ success: true });
});

app.post('/api/auth/max', (req, res) => {
    const initData = req.body;

    if (!initData || !initData.user || !initData.hash) {
        console.warn('[AUTH] Некорректные данные авторизации Max: ', initData);
        return res.status(400).json({ error: 'Code is required' });
    }

    // проверяем hash в initData, чтобы убедиться, что данные пришли от MaxBot
    if (!checkInitDataHash(initData, process.env.BOT_TOKEN)) {
        console.warn('[AUTH] Некорректный hash в initData: ', initData);
        return res.status(401).json({ error: 'Access required' });
    }

    let userIn = {
        user_id: initData.user.id,
        avatar_url: initData.user?.avatar_url || initData.user?.photo_url,
        first_name: initData.user.first_name,
        last_name: initData.user.last_name,
        username: initData.user.username,
    }
    checkUser(userIn);


    let out = authProcess(req, res, userIn.user_id);
    if (out.error) {
        return res.status(404).json(out);
    } else {
        console.log('[AUTH] Успешная авторизация Max: ', out);
        return res.json(out);
    }
})


app.get('/api/auth/me', (req, res) => {

    const user_id = req?.query?.user_id ?? false;

    if (!req.user) {
        // Протухшая копия профиля не должна переживать сессию.
        res.clearCookie(process.env.USER_COOKIE);


        if (user_id) {
            const { code, url, user } = getCodeForUser(user_id);
            if (!!user) {
                return res.status(201).json({ code, url, user });
            }
        }

        return res.status(401).json({ error: 'Access required' });
    }

    const user = usersDb.getById(req.user.user_id);
    if (!user) {
        res.clearCookie(process.env.USER_COOKIE);
        return res.status(401).json({ error: 'User not found' });
    }

    // Копия профиля для SPA: читается из JS при старте страницы.
    // Без maxAge — живёт в рамках сессии браузера; источник правды всё равно JWT.
    res.cookie(process.env.USER_COOKIE, JSON.stringify(user), {
        httpOnly: false,
        secure: false,
        sameSite: 'none',
    });

    res.json(user);
})


// ----- GROUPS -----

/**
 * GET /api/groups - получить все группы
 */
app.get('/api/groups', (req, res) => {
    try {
        const groups = groupsDb.getAll();
        res.json(groups);
    } catch (error) {
        console.error('[API] Ошибка получения групп:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/groups - создать группу (только для админов)
 */
app.post('/api/groups', (req, res) => {
    if (!req.user?.is_admin) {
        console.warn(`[API] Попытка создать группу неадмином: user_id=${req.user?.user_id}`);
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        const groupId = groupsDb.create(req.body);
        const group = groupsDb.getById(groupId);
        res.status(201).json(group);
    } catch (error) {
        console.error('[API] Ошибка создания группы:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/groups?ID=xxx - удалить группу (только для админов)
 */
app.delete('/api/groups', (req, res) => {
    if (!req.user?.is_admin) {
        console.warn(`[API] Попытка удалить группу неадмином: user_id=${req.user?.user_id}`);
        return res.status(403).json({ error: 'Admin access required' });
    }

    const groupId = req.query.ID;
    if (!groupId) {
        return res.status(400).json({ error: 'ID parameter is required' });
    }

    try {
        groupsDb.delete(groupId);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Ошибка удаления группы:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ----- USERS -----

/**
 * GET /api/users?ID=xxx - получить пользователя
 */
app.get('/api/users', (req, res) => {
    isUserAdmin(req, res);

    const userId = req.query.user_id;

    if (userId) {
        try {
            const user = usersDb.getById(parseInt(userId));
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        } catch (error) {
            console.error('[API] Ошибка получения пользователя:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        try {
            // notes_count считается на сервере: иначе SPA пришлось бы запрашивать
            // материалы каждого пользователя отдельным запросом.
            const users = usersDb.getAllWithNoteCounts();
            res.json(users);
        } catch (error) {
            console.error('[API] Ошибка получения пользователей:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

});

/**
 * PUT /api/users?ID=xxx - обновить пользователя
 */
app.put('/api/users', (req, res) => {
    isUserAdmin(req, res);

    const userId = req.query.user_id;
    if (!userId) {
        return res.status(400).json({ error: 'ID parameter is required' });
    }

    try {
        // Статус администратора меняет только администратор: иначе любой клиент
        // мог бы выдать себе права через тело запроса.
        if (req.body.is_admin !== undefined) {
            if (!isAdminRequest(req)) {
                console.warn(`[API] Попытка изменить is_admin без прав: user_id=${req.user?.user_id} → ${userId}`);
                return res.status(403).json({ error: 'Only admin can change admin status' });
            }

            // Не даём снять права с себя: иначе администратор заблокирует сам себя
            if (parseInt(userId) === req.user?.user_id && !req.body.is_admin) {
                return res.status(400).json({ error: 'Admin cannot revoke own admin status' });
            }
        }

        usersDb.update(parseInt(userId), req.body);
        const user = usersDb.getById(parseInt(userId));
        res.json(user);
    } catch (error) {
        console.error('[API] Ошибка обновления пользователя:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/users - создать пользователя
 */
app.post('/api/users', (req, res) => {
    isUserAdmin(req, res);

    try {
        usersDb.create(req.body);
        const user = usersDb.getById(req.body.user_id);
        res.status(201).json(user);
    } catch (error) {
        console.error('[API] Ошибка создания пользователя:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ----- FILES -----

/**
 * GET /api/files?ID=xxx - скачать файл
 */
app.get('/api/files', (req, res) => {
    const fileId = req.query.file_id;
    if (!fileId) {
        return res.status(400).json({ error: 'ID parameter is required' });
    }

    try {
        const file = filesDb.getById(fileId);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const filePath = join(FILESDIR, `${fileId}_${file.name}`);
        if (!existsSync(filePath)) {
            console.error(`[FILES] Файл не найден на диске: ${filePath}`);
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.download(filePath, file.name);
    } catch (error) {
        console.error('[API] Ошибка скачивания файла:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/files - загрузить файл
 */
app.post('/api/files', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const fileId = req.generatedFileId;
        // Имя берём из того, что реально записано на диск - иначе GET/DELETE не найдут файл
        const fileName = req.safeFileName ?? sanitizeFileName(req.file.originalname);
        const note = req.body.note || null;

        filesDb.create({
            file_id: fileId,
            name: fileName,
            size: req.file.size,
            note: note
        });

        const file = filesDb.getById(fileId);
        console.log(`[FILES] Файл загружен: ${fileId}_${fileName}`);
        res.status(201).json(file);
    } catch (error) {
        console.error('[API] Ошибка загрузки файла:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/files?file_id=xxx - удалить файл
 * Администратор — любой файл; автор — файл, привязанный только к его материалам.
 * Вместе с файлом удаляются его записи в attachments, чтобы не оставалось сирот.
 */
app.delete('/api/files', (req, res) => {
    const fileId = req.query.file_id;
    if (!fileId) {
        return res.status(400).json({ error: 'file_id parameter is required' });
    }

    try {
        const file = filesDb.getById(fileId);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const noteIds = attachmentsDb.getNoteIdsByFileId(fileId);

        if (!isAdminRequest(req)) {
            // Автор материала может удалять только те файлы, которые не используются
            // в чужих материалах. Непривязанный файл (сирота) удаляет только админ.
            const foreignUsage = noteIds.some(
                (noteId) => notesDb.getById(noteId)?.user_id !== req.user?.user_id
            );

            if (!req.user || noteIds.length === 0 || foreignUsage) {
                console.warn(`[API] Попытка удалить файл без прав: user_id=${req.user?.user_id}, file_id=${fileId}`);
                return res.status(403).json({ error: 'Only admin or note author can delete this file' });
            }
        }

        // Снимаем связи с материалами, иначе останутся записи, указывающие в пустоту
        attachmentsDb.deleteByFileId(fileId);

        // Удаляем файл с диска
        const filePath = join(FILESDIR, `${fileId}_${file.name}`);
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }

        // Удаляем запись из БД
        filesDb.delete(fileId);
        console.log(`[FILES] Файл удалён: ${fileId}_${file.name}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Ошибка удаления файла:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ----- NOTES -----

/**
 * GET /api/notes?note_id=xxx - получить материал по ID
 * GET /api/notes?group_id=xxx - получить все материалы группы
 * GET /api/notes?user_id=xxx - получить все материалы пользователя
 */
app.get('/api/notes', (req, res) => {
    try {
        const { note_id, group_id, user_id } = req.query;

        if (note_id) {
            const note = notesDb.getById(parseInt(note_id));
            if (!note) {
                return res.status(404).json({ error: 'Note not found' });
            }
            return res.json(note);
        }

        if (group_id) {
            const notes = notesDb.getByGroupId(parseInt(group_id));
            return res.json(notes);
        }

        if (user_id) {
            const notes = notesDb.getByUserId(parseInt(user_id));
            return res.json(notes);
        }

        return res.status(400).json({ error: 'note_id, group_id or user_id parameter is required' });
    } catch (error) {
        console.error('[API] Ошибка получения материалов:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notes - создать материал
 */
app.post('/api/notes', (req, res) => {
    try {
        const noteId = notesDb.create(req.body);
        const note = notesDb.getById(noteId);
        res.status(201).json(note);
    } catch (error) {
        console.error('[API] Ошибка создания материала:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/notes?note_id=xxx - обновить материал
 * Доступно автору материала или администратору
 */
app.put('/api/notes', (req, res) => {
    const noteId = req.query.note_id;
    if (!noteId) {
        return res.status(400).json({ error: 'note_id parameter is required' });
    }

    try {
        const access = resolveNoteEditor(req, noteId);
        if (access.error) {
            console.warn(`[API] Попытка изменить чужой материал: user_id=${req.user?.user_id}, note_id=${noteId}`);
            return res.status(access.status).json({ error: access.error });
        }

        // user_id менять нельзя — владелец материала фиксирован
        const { group_id, name, description } = req.body;
        notesDb.update(parseInt(noteId), { group_id, name, description });

        res.json(notesDb.getById(parseInt(noteId)));
    } catch (error) {
        console.error('[API] Ошибка обновления материала:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/notes?note_id=xxx - удалить материал
 * Доступно автору материала или администратору
 */
app.delete('/api/notes', (req, res) => {
    const noteId = req.query.note_id;
    if (!noteId) {
        return res.status(400).json({ error: 'note_id parameter is required' });
    }

    try {
        const access = resolveNoteEditor(req, noteId);
        if (access.error) {
            console.warn(`[API] Попытка удалить чужой материал: user_id=${req.user?.user_id}, note_id=${noteId}`);
            return res.status(access.status).json({ error: access.error });
        }

        // Сначала снимаем связи, иначе FOREIGN KEY не даст удалить материал
        const attachedFiles = attachmentsDb.getByNoteId(parseInt(noteId))?.files || [];
        attachmentsDb.deleteByNoteId(parseInt(noteId));

        // Файлы, которые после этого не принадлежат ни одному материалу, удаляем
        // вместе с материалом — иначе они навсегда останутся мусором на диске.
        for (const file of attachedFiles) {
            if (attachmentsDb.getNoteIdsByFileId(file.file_id).length > 0) continue;

            const filePath = join(FILESDIR, `${file.file_id}_${file.name}`);
            if (existsSync(filePath)) {
                unlinkSync(filePath);
            }
            filesDb.delete(file.file_id);
        }
        attachmentsDb.deleteByNoteId(parseInt(noteId));
        notesDb.delete(parseInt(noteId));
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Ошибка удаления материала:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ----- ATTACHMENTS -----

/**
 * GET /api/attachments?note_id=xxx - получить вложения материала
 */
app.get('/api/attachments', (req, res) => {
    const noteId = req.query.note_id;
    if (!noteId) {
        return res.status(400).json({ error: 'note_id parameter is required' });
    }

    try {
        const attachments = attachmentsDb.getByNoteId(parseInt(noteId));
        if (!attachments) {
            return res.json({ note_id: parseInt(noteId), note: null, files: [] });
        }
        res.json(attachments);
    } catch (error) {
        console.error('[API] Ошибка получения вложений:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/attachments?note_id=xxx&file_id=xxx - прикрепить файл к материалу
 */
app.post('/api/attachments', (req, res) => {
    const { note_id, file_id } = req.query;

    if (!note_id || !file_id) {
        return res.status(400).json({ error: 'note_id and file_id parameters are required' });
    }

    try {
        const access = resolveNoteEditor(req, note_id);
        if (access.error) {
            console.warn(`[API] Попытка прикрепить файл к чужому материалу: user_id=${req.user?.user_id}, note_id=${note_id}`);
            return res.status(access.status).json({ error: access.error });
        }

        attachmentsDb.create(parseInt(note_id), file_id);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Ошибка прикрепления файла:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/attachments?note_id=xxx&file_id=xxx - открепить файл от материала
 * Доступно автору материала или администратору
 */
app.delete('/api/attachments', (req, res) => {
    const { note_id, file_id } = req.query;

    if (!note_id || !file_id) {
        return res.status(400).json({ error: 'note_id and file_id parameters are required' });
    }

    try {
        const access = resolveNoteEditor(req, note_id);
        if (access.error) {
            console.warn(`[API] Попытка открепить файл от чужого материала: user_id=${req.user?.user_id}, note_id=${note_id}`);
            return res.status(access.status).json({ error: access.error });
        }

        attachmentsDb.delete(parseInt(note_id), file_id);
        res.json({ success: true });
    } catch (error) {
        console.error('[API] Ошибка открепления файла:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ========== SERVER ==========

export function startApiServer(handleUpdateMax, WH_PARAM) {
    app.post(WH_PARAM.path, handleUpdateMax);

    app.listen(PORT, () => {
        console.log(`WEBHOOK: ${JSON.stringify(WH_PARAM)}`);
        console.log(`API сервер запущен на порту ${PORT}`);
    });
}

export default app;
