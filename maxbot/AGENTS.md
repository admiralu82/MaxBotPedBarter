# AGENTS.md

## Project structure

- `bot/index.js` — main bot entry point (webhook, меню, авторизация)
- `bot/api.js` — Express: `/api/*`, статика `/app`, webhook-роут
- `bot/database.js` — схема SQLite + CRUD (`bot/bot.db`)
- `bot/middleware/auth.js` — `authMiddleware`, `originRestriction`, `requireAuthForMutations`
- `app_dir/index.html` — заглушка статики SPA (`APP_DIR`); SPA — отдельный проект
- `files_dir/` — загруженные файлы (`FILES_DIR`)
- `.env` — required. Используемые переменные: `BOT_TOKEN`, `BOT_USERNAME`, `WEBHOOK_DOMAIN`, `WEBHOOK_SECRET`, `API_PORT`, `JWT_SECRET`, `AUTH_COOKIE`, `FILES_DIR`, `APP_DIR`, `DEBUG`

## Commands

```sh
npm run bot  # starts the bot (runs bot/index.js)
npm test     # заглушка, тестов нет
```

## Описание функционала бота

Бот управляет материалами, которыми обмениваются участники. Работает в режиме webhook. Также реализуется backend для работы SPA-сайта по пути `/app` по управлению материалами.

Бот по команде `/start` показывает меню из элементов:
- Авторизоваться — поделиться контактом
- Создать материал — заглушка

По команде `bot_started` берётся информация пользователя и записывается в базу `users`, по умолчанию `is_admin = false`.

## База данных

База данных бота хранится в SQLite. 
Таблица направлений `groups`: `group_id`, `name`, `description`, `user_id` (админ группы).

Стандартные значения (заполняются, если базы данных нет):

| group_id | name | description |
|---|---|---|
| 1 | Кафедра начального общего образования | Руководитель кафедры - Внукова Елена Александровна |
| 2 | Кафедра иностранных языков | Руководитель кафедры - Харская Яна Николаевна |
| 3 | Кафедра словесности | Руководитель кафедры - Васильева Ирина Александровна |
| 4 | Кафедра физической культуры и ОБЗР | Руководитель кафедры - Махов Валерий Игоревич |
| 5 | Кафедра математики, физики и ИТ | Руководитель кафедры - Голубев Александр Андреевич |
| 6 | Кафедра естественных наук | Руководитель кафедры - Буйлова Татьяна Ивановна |
| 7 | Кафедра искусств и технологии | Руководитель кафедры - Аверкова Зоя Сергеевна |
| 8 | Кафедра истории и социальных наук | Руководитель кафедры - Плужник Светлана Владимировна |

> В сиде `bot/database.js` у группы 8 опечатка: `Руководитель кафедра - ...`. Требует исправления в коде и в существующей БД.

- `users`: `user_id`, `username`, `first_name`, `phone`, `last_name`, `avatar_url` (поля профиля MAX), `is_admin` (возможность редактировать записи).
- `files`: `file_id`, `name`, `size`, `note`. Файлы хранятся в каталоге `${FILES_DIR}/${file_id}_${name}`.
- `notes`: `note_id`, `group_id`, `user_id` (автор материала), `name`, `description`.
- `attachments` (файлы, принадлежащие материалу): `note_id`, `file_id`.
- `auth_codes` (реализовано дополнительно): `code`, `user_id`, `expires`.

## База данных backend API

Доступ к таблицам через API — возвращает JSON-структуру.

**Требования:**

```
/api/groups   GET    - возвращает все группы
/api/groups   POST   - создать запись по json записи (есть у админа)
/api/groups?group_id=$ID   DELETE - удалить запись (есть у админа)

/api/users?user_id=$ID   GET      - чтение пользователя с ID
/api/users?user_id=$ID   PUT      - изменение пользователя
/api/users               POST     - создание пользователя
/api/users               GET      - получение всех пользователй

/api/files?file_id=$ID   GET    - download file с именем
/api/files               POST   - создать файл, метод возвращает json структуру файла
/api/files?file_id=$ID   DELETE - удалить запись (есть у админа)

/api/notes?note_id=$ID   GET - возвращает материал с ID
/api/notes?group_id=$ID  GET - возвращает все материалы группы с ID
/api/notes?user_id=$ID   GET - возвращает все материалы пользователя с ID
/api/notes               POST   - создать материал, возвращает json структуру материала
/api/notes?note_id=$ID   DELETE - удалить материал

/api/attachments?note_id=$ID              GET    - вложения материала:
                                                   { note_id, note (расшифровка по note_id),
                                                     files: [ { file_id, name, size, note } ] }
/api/attachments?note_id=$ID&file_id=$ID2 POST   - закрепляет файл за материалом
/api/attachments?note_id=$ID&file_id=$ID2 DELETE - открепляет файл от материала
```

**Фактические отклонения от требований** (подробности — `README.md`, `API.md`):

- `DELETE /api/groups` принимает `?ID=`, а не `?group_id=`;
- `/api/attachments` отдаёт `files: [...]`, а не `note` внутри элемента массива;
- ошибки валидации отдаются как `500` (SQLite-ограничения), а не `400`;
- отсутствует `PUT /api/groups`, `PUT /api/files`, а также `GET`-списки пользователей и файлов без идентификатора.

### Авторизация

`/api/auth` — путь для авторизации по JWT-токенам. В токене хранятся ID пользователя и его статус `is_admin`. Авторизация хранится в cookie с именем из `AUTH_COOKIE`.

Реализовано: `POST /api/auth/exchange` (обмен одноразового кода на JWT). Требуются, но не реализованы: `GET /api/auth` (проверка сессии), logout.

По требованию токен — без срока действия. Фактически `expiresIn: '365d'` (`bot/auth.js`).

### Middleware

- Проверка прав пользователя по JWT для `/api/*`, **не блокирующая** действия пользователя (включается в ручном режиме). Реализовано как `authMiddleware`, включён в `bot/api.js`.
- Ограничение доступа к API только с сайта и с самого сервера, запрет внешних подключений. Реализовано как `originRestriction` (проверка `Referer`), активно.

Не реализовано требование «мутации только для авторизованных»: `requireAuthForMutations` написан, но закомментирован (`bot/api.js`). Без него `POST/PUT /api/users`, `POST /api/notes`, `POST /api/files`, `POST/DELETE /api/attachments`, `DELETE /api/notes` доступны анонимам, а через `POST`/`PUT /api/users` можно выдать себе `is_admin`.

### Статика SPA

`/app` — путь `APP_DIR` для публикации статического содержимого. Отдельный проект single page application по управлению материалами с использованием `/api`.

## Dependencies

- `@maxhub/max-bot-api` — Bot API и webhook-сервер для платформы MAX
- `express`, `cookie-parser`, `multer`, `cors` — HTTP-слой
- `jsonwebtoken` — JWT
- `better-sqlite3` — SQLite (нативная сборка)
- `dotenv` — загружает `.env` при импорте

## Important conventions

- **ES modules**: `"type": "module"` в `package.json`. Использовать `import`, не `require`.
- **Environment**: `BOT_TOKEN` обязателен в `.env`, иначе бот не стартует.
- **Language**: все пользовательские строки и комментарии — на русском.
- **Не коммитить**: `.env`, `bot/bot.db*`, `files_dir/`, `node_modules/`. `.gitignore` отсутствует.

## MAX platform specifics

- Бот использует MAX Bot API через `@maxhub/max-bot-api`
- Клавиатуры — `Keyboard.inlineKeyboard()` с типами кнопок `open_app`, `callback`, `link`, `request_contact`, `request_geo_location`; в коде — хелперы `Keyboard.button.*` (`link`, `requestContact`, `callback`, `openApp`, `requestGeoLocation`, `message`, `clipboard`)
- Mini-app ссылается на username бота из `BOT_USERNAME` (например, `id3123190950_bot`)
- Mini-app загружает MAX Bridge SDK с `https://st.max.ru/js/max-web-app.js`
- Webhook регистрируется через `bot.createWebhook()` c путём `/webhook/${Webhook.generateTokenRelatedHash(BOT_TOKEN)}`

## Notes

- `bot/index.js` обрабатывает `/start` с инлайн-клавиатурой и `message_created` (разбор contact-вложения)
- `bot/utils.js` — `checkUser()` (идемпотентная запись пользователя) и `getPhoneFromVcf()` (парсинг телефона из vCard)
- `bot/demo.js` отсутствует — примеры работы с вложениями удалены
- CI, линтеры и автотесты не настроены
