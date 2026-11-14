import Database from 'better-sqlite3';
import crypto from 'crypto';
import { join } from 'path';
import { BASE_DIR } from './logger.js';

const DBFILE = join(BASE_DIR, 'bot.db');

// Создаём соединение с БД
const db = new Database(DBFILE);
db.pragma('journal_mode = WAL');

// Инициализация таблиц
export function initDatabase() {
    // Таблица направлений (кафедр)
    db.exec(`
        CREATE TABLE IF NOT EXISTS groups (
            group_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            user_id INTEGER
        )
    `);

    // Таблица пользователей
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            avatar_url TEXT,
            is_admin INTEGER DEFAULT 0
        )
    `);

    // Таблица файлов
    db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            file_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            size INTEGER,
            note TEXT
        )
    `);

    // Таблица материалов
    db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            FOREIGN KEY (group_id) REFERENCES groups(group_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    // Таблица вложений
    db.exec(`
        CREATE TABLE IF NOT EXISTS attachments (
            note_id INTEGER NOT NULL,
            file_id TEXT NOT NULL,
            PRIMARY KEY (note_id, file_id),
            FOREIGN KEY (note_id) REFERENCES notes(note_id),
            FOREIGN KEY (file_id) REFERENCES files(file_id)
        )
    `);

    // Таблица кодов авторизации
    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_codes (
            code TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires INTEGER NOT NULL
        )
    `);

    // Заполнение стандартных групп (если таблица пуста)
    const groupCount = db.prepare('SELECT COUNT(*) as count FROM groups').get();
    if (groupCount.count === 0) {
        const insertGroup = db.prepare('INSERT INTO groups (group_id, name, description) VALUES (?, ?, ?)');

        const defaultGroups = [
            [1, 'Кафедра начального общего образования', 'Руководитель кафедры - Внукова Елена Александровна'],
            [2, 'Кафедра иностранных языков', 'Руководитель кафедры - Харская Яна Николаевна'],
            [3, 'Кафедра словесности', 'Руководитель кафедры - Васильева Ирина Александровна'],
            [4, 'Кафедра физической культуры и ОБЗР', 'Руководитель кафедры - Махов Валерий Игоревич'],
            [5, 'Кафедра математики, физики и ИТ', 'Руководитель кафедры - Голубев Александр Андреевич'],
            [6, 'Кафедра естественных наук', 'Руководитель кафедры - Буйлова Татьяна Ивановна'],
            [7, 'Кафедра искусств и технологии', 'Руководитель кафедры - Аверкова Зоя Сергеевна'],
            [8, 'Кафедра истории и социальных наук', 'Руководитель кафедра - Плужник Светлана Владимировна']
        ];

        const insertMany = db.transaction((groups) => {
            for (const group of groups) {
                insertGroup.run(...group);
            }
        });

        insertMany(defaultGroups);
        console.log('Стандартные группы (кафедры) добавлены в БД');
    }

    console.log('База данных инициализирована');
}

// CRUD для groups
export const groupsDb = {
    // getAll: () => db.prepare('SELECT * FROM groups').all(),
    getAll: () => db.prepare(`
        SELECT g.*, COUNT(n.note_id) AS notes_count FROM groups g 
            LEFT JOIN notes n ON n.group_id = g.group_id
            GROUP BY g.group_id
            ORDER BY g.group_id`).all(),
    getById: (id) => db.prepare('SELECT * FROM groups WHERE group_id = ?').get(id),
    create: (data) => {
        const stmt = db.prepare('INSERT INTO groups (name, description, user_id) VALUES (?, ?, ?)');
        const result = stmt.run(data.name, data.description, data.user_id || null);
        return result.lastInsertRowid;
    },
    update: (id, data) => {
        const stmt = db.prepare('UPDATE groups SET name = ?, description = ?, user_id = ? WHERE group_id = ?');
        stmt.run(data.name, data.description, data.user_id || null, id);
    },
    delete: (id) => db.prepare('DELETE FROM groups WHERE group_id = ?').run(id)
};

// CRUD для users
export const usersDb = {
    getAll: () => db.prepare('SELECT * FROM users').all(),
    /** Список с числом материалов каждого пользователя (для админской таблицы). */
    getAllWithNoteCounts: () => db.prepare(`
        SELECT u.*, COUNT(n.note_id) AS notes_count
        FROM users u
        LEFT JOIN notes n ON n.user_id = u.user_id
        GROUP BY u.user_id
        ORDER BY u.user_id
    `).all(),
    getById: (id) => db.prepare('SELECT * FROM users WHERE user_id = ?').get(id),
    create: (data) => {
        const stmt = db.prepare('INSERT INTO users (user_id, username, first_name, last_name, phone, avatar_url, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)');
        stmt.run(data.user_id, data.username, data.first_name, data.last_name, data.phone || null, data.avatar_url || null, data.is_admin || 0);
    },
    update: (id, data) => {
        const fields = [];
        const values = [];

        if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
        if (data.first_name !== undefined) { fields.push('first_name = ?'); values.push(data.first_name); }
        if (data.last_name !== undefined) { fields.push('last_name = ?'); values.push(data.last_name); }
        if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
        if (data.avatar_url !== undefined) { fields.push('avatar_url = ?'); values.push(data.avatar_url); }
        if (data.is_admin !== undefined) { fields.push('is_admin = ?'); values.push(data.is_admin); }

        if (fields.length === 0) return;

        values.push(id);
        const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`);
        stmt.run(...values);
    },
    delete: (id) => db.prepare('DELETE FROM users WHERE user_id = ?').run(id),
    getOrCreate: (userId, data) => {
        let user = usersDb.getById(userId);
        if (!user) {
            usersDb.create({ user_id: userId, ...data, is_admin: 0 });
            user = usersDb.getById(userId);
        }
        return user;
    }
};

// CRUD для files
export const filesDb = {
    getAll: () => db.prepare('SELECT * FROM files').all(),
    getById: (id) => db.prepare('SELECT * FROM files WHERE file_id = ?').get(id),
    create: (data) => {
        const fileId = data.file_id || crypto.randomUUID();
        const stmt = db.prepare('INSERT INTO files (file_id, name, size, note) VALUES (?, ?, ?, ?)');
        stmt.run(fileId, data.name, data.size || 0, data.note || null);
        return fileId;
    },
    update: (id, data) => {
        const stmt = db.prepare('UPDATE files SET name = ?, size = ?, note = ? WHERE file_id = ?');
        stmt.run(data.name, data.size, data.note || null, id);
    },
    delete: (id) => {
        attachmentsDb.deleteByFileId(id); // Удаляем все связи с материалами
        db.prepare('DELETE FROM files WHERE file_id = ?').run(id) // Удаляем сам файл
    }
};

// CRUD для notes
const NOTE_FIELDS = `
    n.note_id, n.group_id, n.user_id, n.name, n.description,
    u.username AS author_username,
    u.first_name AS author_first_name,
    u.last_name AS author_last_name,
    u.avatar_url AS author_avatar_url`;

// Автор подтягивается JOIN'ом: SPA показывает его на карточке материала,
// а GET /api/users доступен не всем, да и лишний запрос на каждую карточку ни к чему.
const NOTE_SELECT = `SELECT ${NOTE_FIELDS} FROM notes n LEFT JOIN users u ON u.user_id = n.user_id`;

export const notesDb = {
    getAll: () => db.prepare(`${NOTE_SELECT}`).all(),
    getById: (id) => db.prepare(`${NOTE_SELECT} WHERE n.note_id = ?`).get(id),
    getByGroupId: (groupId) => db.prepare(`${NOTE_SELECT} WHERE n.group_id = ?`).all(groupId),
    getByUserId: (userId) => db.prepare(`${NOTE_SELECT} WHERE n.user_id = ?`).all(userId),
    create: (data) => {
        const stmt = db.prepare('INSERT INTO notes (group_id, user_id, name, description) VALUES (?, ?, ?, ?)');
        const result = stmt.run(data.group_id, data.user_id, data.name, data.description || null);
        return result.lastInsertRowid;
    },
    update: (id, data) => {
        const fields = [];
        const values = [];

        if (data.group_id !== undefined) { fields.push('group_id = ?'); values.push(data.group_id); }
        if (data.user_id !== undefined) { fields.push('user_id = ?'); values.push(data.user_id); }
        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }

        if (fields.length === 0) return;

        values.push(id);
        const stmt = db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE note_id = ?`);
        stmt.run(...values);
    },
    delete: (id) => db.prepare('DELETE FROM notes WHERE note_id = ?').run(id)

};

// CRUD для attachments
export const attachmentsDb = {
    getByNoteId: (noteId) => {
        const attachments = db.prepare(`
            SELECT a.note_id, a.file_id, f.name, f.size, f.note
            FROM attachments a
            JOIN files f ON a.file_id = f.file_id
            WHERE a.note_id = ?
        `).all(noteId);

        if (attachments.length === 0) return null;

        const note = notesDb.getById(noteId);
        return {
            note_id: noteId,
            note: note,
            files: attachments.map(a => ({
                file_id: a.file_id,
                name: a.name,
                size: a.size,
                note: a.note
            }))
        };
    },
    create: (noteId, fileId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO attachments (note_id, file_id) VALUES (?, ?)');
        stmt.run(noteId, fileId);
    },
    getNoteIdsByFileId: (fileId) => {
        return db.prepare('SELECT note_id FROM attachments WHERE file_id = ?')
            .all(fileId)
            .map(row => row.note_id);
    },
    deleteByNoteId: (noteId) => {
        db.prepare('DELETE FROM attachments WHERE note_id = ?').run(noteId);
    },
    deleteByFileId: (fileId) => {
        db.prepare('DELETE FROM attachments WHERE file_id = ?').run(fileId);
    },
    delete: (noteId, fileId) => {
        const stmt = db.prepare('DELETE FROM attachments WHERE note_id = ? AND file_id = ?');
        stmt.run(noteId, fileId);
    }
};

// CRUD для auth_codes
export const authCodesDb = {
    create: (userId, ttlMs = 60000) => {
        const code = crypto.randomUUID();
        const expires = Date.now() + ttlMs;
        const stmt = db.prepare('INSERT INTO auth_codes (code, user_id, expires) VALUES (?, ?, ?)');
        stmt.run(code, userId, expires);
        return code;
    },
    get: (code) => {
        const stmt = db.prepare('SELECT * FROM auth_codes WHERE code = ?');
        return stmt.get(code);
    },
    delete: (code) => {
        const stmt = db.prepare('DELETE FROM auth_codes WHERE code = ?');
        stmt.run(code);
    },
    cleanup: () => {
        const stmt = db.prepare('DELETE FROM auth_codes WHERE expires < ?');
        stmt.run(Date.now());
    }
};

export default db;
