# MAX Bot — управление материалами

Бот в мессенджере MAX для обмена методическими материалами между кафедрами + REST backend для SPA.

> Документ описывает **фактическое состояние** кода. Требования — в [`AGENTS.md`](./AGENTS.md), контракты API — в [`API.md`](./API.md).

## Быстрый старт

```bash
npm install
npm run bot      # старт бота + API (bot/index.js)
```

Требуемые переменные в `.env`: `BOT_TOKEN`, `BOT_USERNAME`, `WEBHOOK_DOMAIN`, `WEBHOOK_SECRET`, `JWT_SECRET`, `AUTH_COOKIE`, `API_PORT`, `FILES_DIR`, `APP_DIR`.

---

## 1. База данных (`bot/database.js`)

SQLite через `better-sqlite3`, WAL-режим, файл `bot/bot.db`. Схема создаётся `initDatabase()` при старте.

| Таблица | Поля | Назначение |
|---|---|---|
| `groups` | group_id, name, description, user_id | Кафедры (8 стандартных, заполняются при пустой таблице) |
| `users` | user_id, username, first_name, last_name, phone, avatar_url, is_admin | Пользователи MAX |
| `files` | file_id (TEXT PK), name, size, note | Метаданные загруженных файлов |
| `notes` | note_id, group_id, user_id, name, description | Материалы |
| `attachments` | note_id, file_id | M:N материал ↔ файл, PK `(note_id, file_id)` |
| `auth_codes` | code, user_id, expires | Одноразовые коды авторизации (TTL 60 с) |

CRUD-объекты: `groupsDb`, `usersDb`, `filesDb`, `notesDb`, `attachmentsDb`, `authCodesDb`.

- `usersDb.getOrCreate(userId, data)` — идемпотентное создание (используется в `checkUser()` из `bot/utils.js` для всех событий бота).
- `usersDb.update()` и `notesDb.update()` — частичное обновление (только переданные поля).
- `notesDb.update()` формально умеет менять `user_id`, но `PUT /api/notes` это поле вырезает.
- Внешние ключи объявлены, каскады не настроены.

## 2. Авторизация

```
/start → кнопка requestContact
      → message_created (attachment.type === 'contact')
      → usersDb.update(user_id, { phone: из vcf_info })
      → authCodesDb.create(user_id, 60 c)
      → ссылка ${WEBHOOK_DOMAIN}/app/auth?code=<uuid>
      → SPA: POST /api/auth/exchange { code }
      → JWT (365 дней) в httpOnly cookie BOT_AUTH51
```

- `bot/auth.js` — `generateJWT()` / `verifyJWT()`, секрет из `JWT_SECRET` (при отсутствии — fallback-константа в коде).
- Payload: `{ user_id, is_admin }`, `expiresIn: '365d'`. Токен **не бессрочный**, перевыпуск — только повторной авторизацией.
- Телефон извлекается из `vcf_info` регуляркой (`bot/utils.js: getPhoneFromVcf`), значения короче 5 символов отбрасываются.
- Просроченные коды чистятся `setInterval` каждые 5 минут.

## 3. Middleware (`bot/middleware/auth.js`)

| Middleware | Состояние | Поведение |
|---|---|---|
| `originRestriction` | **включён** | Пропуск без `Referer` и при совпадении `Referer.host` с `Host`; иначе `403` + лог. Исключение — `/api/auth/exchange` |
| `authMiddleware` | **включён** (`bot/api.js:65`) | Проверяет JWT и заполняет `req.user`, не блокируя запрос |
| `requireAuthForMutations` | **закомментирован** (`bot/api.js:66`) | Блокировал бы `POST/PUT/PATCH/DELETE` без JWT ответом `401` |

**Главное следствие:** проверки `is_admin` работают (админ-роуты доступны админу, `PUT /api/notes` — автору), но анонимные мутации не отсекаются:

- `POST /api/users` и `PUT /api/users` без токена принимают `is_admin: 1` — прямая эскалация прав;
- `POST /api/notes`, `POST /api/files`, `POST/DELETE /api/attachments`, `DELETE /api/notes` доступны без авторизации;
- ни один защищённый роут не отдаёт `401` — только `403`.

CORS: `cors` в зависимостях, `app.use(cors())` закомментирован (`bot/api.js:37`) — SPA должна работать с того же origin.

## 4. API (`bot/api.js`)

Все маршруты под `/api`, JSON, без кэширования. Полные контракты — в [`API.md`](./API.md).

| Метод | Путь | Фактические права |
|---|---|---|
| POST | `/api/auth/exchange` | — |
| GET | `/api/groups` | все |
| POST | `/api/groups` | admin |
| DELETE | `/api/groups?ID=` | admin |
| GET | `/api/users?user_id=` | все |
| PUT | `/api/users?user_id=` | **без проверки** (принимает `is_admin` от анонима) |
| POST | `/api/users` | **без проверки** (принимает `is_admin` от анонима) |
| GET | `/api/files?file_id=` | все (download) |
| POST | `/api/files` | **без проверки** (multipart) |
| DELETE | `/api/files?file_id=` | admin |
| GET | `/api/notes?note_id=`, `?group_id=`, `?user_id=` | все |
| POST | `/api/notes` | **без проверки** |
| PUT | `/api/notes?note_id=` | автор или admin |
| DELETE | `/api/notes?note_id=` | **без проверки**, всегда `200` |
| GET | `/api/attachments?note_id=` | все |
| POST | `/api/attachments?note_id=&file_id=` | **без проверки** |
| DELETE | `/api/attachments?note_id=&file_id=` | **без проверки**, всегда `200` |

Полная матрица «аноним / пользователь / админ» — в [`API.md`](./API.md#матрица-прав-проверена-на-живом-сервере).

Файлы: `multer.diskStorage` → `${FILES_DIR}/${file_id}_${name}`, каталог создаётся при старте. `file_id` = `${Date.now()}_${random36}`.

## 5. Бот (`bot/index.js`)

- `/start` — `checkUser()` + инлайн-меню: **Авторизоваться** (`requestContact`), **Создать материал (заглушка)** (`link` на `https://max.ru/<BOT_USERNAME>?startapp=create`).
- `message_created` — `checkUser()`, разбор contact-attachment, запись телефона, выдача кода и ссылки на `/app/auth?code=`.
- `message_callback`, `bot_started` — только `checkUser()`, бизнес-логики нет.
- `allowedUpdates`: `message_created`, `message_callback`, `bot_started`, `bot_added`.
- Команда бота в меню MAX: `/start`.
- Кнопка «Создать материал» — заглушка (требование AGENTS.md), SPA-страницы `/app/auth` и `/app/create` в `app_dir` отсутствуют.

## 6. Структура

```
bot/
  index.js             # entry point: бот, webhook, меню, авторизация
  api.js               # express: /api/*, статика /app, webhook-роут
  database.js          # схема + CRUD (bot/bot.db)
  auth.js              # JWT
  utils.js             # checkUser(), getPhoneFromVcf()
  middleware/auth.js   # authMiddleware, originRestriction, requireAuthForMutations
  bot.db[-wal|-shm]    # рабочая БД
files_dir/             # загруженные файлы (FILES_DIR)
app_dir/index.html     # заглушка статики (APP_DIR), SPA — внешний проект
API.md                 # контракты API
AGENTS.md              # исходные требования
README.md              # это описание фактического состояния
```

## 7. Известные расхождения и TODO

### Блокирующие

1. **`requireAuthForMutations` отключён** (`bot/api.js:66`). `authMiddleware` уже включён, проверки `is_admin` и `PUT /api/notes` работают, но анонимные мутации не отсекаются: без токена можно вызвать `POST /api/users` с `is_admin: 1` или `PUT /api/users` и повысить права любому пользователю, а также удалить любой материал через `DELETE /api/notes`. Включение middleware закроет это, но потребует JWT для `POST /api/attachments` и `DELETE /api/notes` в SPA.
2. **Имена query-параметров не унифицированы:** `ID` для групп, `user_id` для пользователей, `file_id` для файлов. AGENTS.md требует `group_id`/`user_id`/`file_id` — расхождение по группам остаётся открытым.
3. **Ссылка авторизации ведёт на `/app/auth?code=`**, страницы нет. API.md ранее указывал `/app?code=`.
4. **Ошибки валидации отдаются как `500`:** `POST /api/notes` без `group_id`/`user_id` или с несуществующими FK, `POST /api/users` с дублем `user_id`, `POST /api/attachments` с несуществующим `file_id`.
5. **`POST /api/notes` не проверяет автора:** без токена можно создать материал с произвольным `user_id`, в том числе от имени другого пользователя.

### Логические

6. **`GET /api/attachments`** возвращает `{ note_id, note: null, files: [] }` и для отсутствующего материала, и для материала без вложений — по ответу случаи неразличимы. Нужен `404` либо флаг.
7. **`DELETE /api/notes` и `DELETE /api/attachments`** всегда отдают `{ success: true }`, даже когда записи не было (проверки существования нет).
8. **Нет каскадов:** `DELETE /api/notes` оставляет строки в `attachments`; `DELETE /api/files` — тоже; удаление группы с материалами падает с `500` по `FOREIGN KEY`.
9. **`POST /api/users` без `user_id`** → `201` с пустым телом, запись не создаётся. Нужна валидация.
10. **`GET /api/notes?group_id=abc`** → `200 []` (`parseInt` → `NaN`) вместо `400`; `?note_id=abc` → `404`.
11. **`is_admin`** назначается только через `PUT /api/users` — отдельной админ-панели нет.
12. **`originRestriction`** опирается на `Referer`, который подделывается тривиально; запросы без `Referer` пропускаются намеренно.
13. **`secure: true`** на cookie — по `http://` браузер cookie не сохранит; для локальной отладки нужен HTTPS.

### Незакрытые требования AGENTS.md

14. `/api/auth` как «путь для авторизации» — реализован только `POST /api/auth/exchange`; `GET /api/auth` (проверка сессии) и logout отсутствуют.
15. Нет `PUT /api/groups`, `PUT /api/files`, `GET /api/files` (список), `GET /api/users` (список) — CRUD в `database.js` для этого есть, роутов нет.
16. `/app` — заглушка `index.html`, SPA вынесена в отдельный проект.
17. Тестов нет: `npm test` — заглушка (`exit 1`). Проверка API выполнялась разовыми скриптами.

## Проверка

```bash
npm run bot                            # старт бота + API
node -e "require('better-sqlite3')"    # проверка нативной сборки
```

`better-sqlite3` требует локальной сборки (node-gyp + MSVC/Build Tools на Windows). При успешном старте: сервер слушает `API_PORT`, БД инициализирована, 8 кафедр записаны (`Groups count: 8`).
