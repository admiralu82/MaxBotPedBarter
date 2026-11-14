import 'dotenv/config';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, fsync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

/**
 * Дублирование console.log/info/debug/warn/error в файл лога.
 *
 * - файл: ${BASE_DIR}/logs/bot.log (каталог создаётся при необходимости);
 * - BASE_DIR резолвится от корня проекта (от import.meta.url), а не от cwd;
 * - ротация по размеру: 100 МБ x 3 файла (bot.log, bot.log.1, bot.log.2);
 * - каждая строка записи имеет префикс [ISO-дата] [LEVEL];
 * - консольный вывод сохраняется без изменений;
 * - запись через fs.createWriteStream, принудительный сброс (fsync) раз в 10 секунд.
 *
 * Подключается один раз в точке входа (bot/index.js) до импорта остальных
 * модулей, чтобы перехватить и их логи на этапе загрузки.
 */

// bot/logger.js -> bot/ -> <корень проекта>
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BASE_DIR = resolve(PROJECT_ROOT, 'data');
export const APP_DIR = resolve(PROJECT_ROOT, 'app');
export const LOG_DIR = join(BASE_DIR, 'logs');
export const LOG_FILE = join(LOG_DIR, 'bot.log');

export const AUTH_COOKIE = process.env.AUTH_COOKIE || 'BOT_AUTH51';
export const USER_COOKIE = process.env.USER_COOKIE || 'USER_INFO';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 МБ
const MAX_FILES = 3;                     // bot.log + 2 архивных
const FLUSH_INTERVAL_MS = 10000;

const INSPECT_OPTIONS = {
    depth: 4,
    breakLength: Infinity,
    maxArrayLength: 50,
    maxStringLength: 4096,
    colors: false,
};

let stream = null;
let size = 0;
let rotating = false;
/** Строки, ожидающие записи (во время ротации поток закрыт). */
const queue = [];

function reportInternalError(message) {
    try {
        process.stderr.write(`[logger] ${message}\n`);
    } catch {
        // логгер не должен ронять приложение
    }
}

function openStream() {
    try {
        if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
        try {
            size = statSync(LOG_FILE).size;
        } catch {
            size = 0;
        }
        stream = createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
        stream.on('error', (error) => {
            reportInternalError(`Ошибка записи в ${LOG_FILE}: ${error.message}`);
        });
    } catch (error) {
        stream = null;
        reportInternalError(`Не удалось открыть ${LOG_FILE}: ${error.message}`);
    }
}

function rotateFiles() {
    // bot.log.N — самый старый; удаляем, остальные сдвигаем на шаг вверх
    const oldest = `${LOG_FILE}.${MAX_FILES - 1}`;
    if (existsSync(oldest)) unlinkSync(oldest);

    for (let i = MAX_FILES - 2; i >= 1; i--) {
        const src = `${LOG_FILE}.${i}`;
        if (existsSync(src)) renameSync(src, `${LOG_FILE}.${i + 1}`);
    }

    if (existsSync(LOG_FILE)) renameSync(LOG_FILE, `${LOG_FILE}.1`);
}

function rotate() {
    if (rotating) return;
    rotating = true;
    const oldStream = stream;
    stream = null;

    const proceed = () => {
        try {
            rotateFiles();
        } catch (error) {
            reportInternalError(`Ошибка ротации лог-файла: ${error.message}`);
        }
        size = 0;
        openStream();
        rotating = false;
        drain();
    };

    // На Windows переименовать открытый файл нельзя, поэтому ждём закрытия потока
    if (!oldStream) return proceed();
    oldStream.end(proceed);
}

function emit(line) {
    if (rotating || !stream) {
        queue.push(line);
        return;
    }

    const bytes = Buffer.byteLength(line, 'utf8') + 1;
    if (size + bytes > MAX_FILE_SIZE) {
        queue.push(line);
        rotate();
        return;
    }

    size += bytes;
    stream.write(`${line}\n`);
}

function drain() {
    while (queue.length > 0 && stream && !rotating) {
        emit(queue.shift());
    }
}

/**
 * Форматирует запись в одну или несколько строк вида `[ISO] [LEVEL] текст`.
 * Многострочные значения (например, стек ошибки) получают префикс на каждой строке.
 */
function formatLine(level, args) {
    const prefix = `[${new Date().toISOString()}] [${level}]`;
    const text = util.formatWithOptions(INSPECT_OPTIONS, ...args);
    return text
        .split(/\r?\n/)
        .map((line) => `${prefix} ${line}`)
        .join('\n');
}

/** Перехват методов console: сначала пишем в файл, затем вызываем оригинал. */
function patchConsole() {
    for (const method of ['log', 'info', 'debug', 'warn', 'error']) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            try {
                emit(formatLine(method.toUpperCase(), args));
            } catch (error) {
                reportInternalError(`Ошибка логирования: ${error.message}`);
            }
            original(...args);
        };
    }
}

/** Дописывает очередь и сбрасывает буфер потока на диск. */
export function flushLogs() {
    try {
        drain();
    } catch (error) {
        reportInternalError(`Ошибка сброса логов: ${error.message}`);
    }

    const fd = stream && stream.fd;
    if (typeof fd === 'number') {
        try {
            fsync(fd, () => {});
        } catch {
            // сброс не критичен
        }
    }
}

/** Останавливает таймер и закрывает поток (последние записи дописываются). */
export function closeLogs() {
    clearInterval(flushTimer);
    try {
        drain();
    } catch {
        // игнорируем
    }
    const oldStream = stream;
    stream = null;
    if (oldStream) oldStream.end();
}

openStream();
patchConsole();

const flushTimer = setInterval(flushLogs, FLUSH_INTERVAL_MS);
// Таймер не должен удерживать процесс живым
flushTimer.unref();

process.on('exit', () => {
    try {
        closeLogs();
    } catch {
        // игнорируем
    }
});


console.log(`PROJECT_ROOT = ${PROJECT_ROOT}`);
console.log(`BASE_DIR = ${BASE_DIR}`);
console.log(`APP_DIR = ${APP_DIR}`);
console.log(`LOG_DIR = ${LOG_DIR}`);