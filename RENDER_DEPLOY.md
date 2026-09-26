# Деплой на Render (ONREZA)

Приложение полностью готово к размещению на [Render.com](https://render.com) — это та платформа, где проекты получают бесплатные адреса вида `https://имя.onrender.com`.

## Что уже подготовлено в проекте

| Файл | Назначение |
|---|---|
| [`Dockerfile`](Dockerfile) | Сборка образа: `npm ci` → `npm run build` → запуск сервера. При старте контейнера автоматически применяется схема БД (`npm run migrate:prod`), затем запускается сервер. |
| [`scripts/migrate.mjs`](scripts/migrate.mjs) | Идемпотентная миграция: создаёт все таблицы и внешние ключи из [`scripts/schema-export.sql`](scripts/schema-export.sql). Пропускает «уже существует», умеет ждать, пока база поднимется. |
| [`render.yaml`](render.yaml) | Blueprint: при подключении репозитория Render сам создаст **Web Service** (Docker) + **PostgreSQL** и подставит `DATABASE_URL`. |
| [`package.json`](package.json) | Добавлен скрипт `migrate:prod`. |

Схема базы создаётся автоматически при первом старте, а приложение само наполняет её данными:

- тренер: телефон `79991234567`, пароль `12345`;
- два документа по умолчанию;
- слоты на 30 дней вперёд.

Это делает `seed()` при `SEED_DATABASE_ON_STARTUP=true` (включено в Dockerfile и render.yaml).

---

## Способ 1 — Blueprint (рекомендуется, 5 минут)

1. **Залейте код в GitHub** (репозиторий уже есть):
   ```bash
   git add -A
   git commit -m "Deploy: Render (Docker + migrations + blueprint)"
   git push origin main
   ```
   Если ветка называется не `main`, просто запушьте в ту, что есть.

2. Зарегистрируйтесь / войдите на [dashboard.render.com](https://dashboard.render.com) (можно через GitHub).

3. Нажмите **New +** → **Blueprint**.

4. Выберите репозиторий `petrusenkokv/raspisanie`.

5. Render прочитает [`render.yaml`](render.yaml) и предложит создать:
   - **Web Service** `raspisanie` (runtime: Docker, план Free, регион Frankfurt);
   - **PostgreSQL** `raspisanie-db` (план Free).
   
   Проверьте, что у Web Service:
   - `Health Check Path` = `/healthz` ✅
   - `Environment` содержит `DATABASE_URL` (подставится из базы), `SESSION_SECRET` (сгенерируется), `SEED_DATABASE_ON_STARTUP=true`.

6. Нажмите **Apply** и дождитесь завершения деплоя (сборка Docker ~2–4 минуты, затем старт).

7. Откройте адрес вида `https://raspisanie.onrender.com` — приложение работает. Вход для тренера: телефон `79991234567`, пароль `12345`.

> 💡 Первый запуск может занять до минуты: Render поднимает контейнер и создаёт схему БД.

---

## Способ 2 — Вручную, без Blueprint

1. Dashboard → **New +** → **Web Service** → подключите репозиторий.
2. Runtime: **Docker** (Render сам найдёт [`Dockerfile`](Dockerfile)).
3. Регион: **Frankfurt** (ближайший к России), план **Free**.
4. Создайте базу: **New +** → **PostgreSQL** → план **Free**, регион тот же.
5. Вернитесь в Web Service → **Environment** и добавьте переменные:

   | Переменная | Значение |
   |---|---|
   | `DATABASE_URL` | Internal Database URL из созданной PostgreSQL |
   | `NODE_ENV` | `production` |
   | `SEED_DATABASE_ON_STARTUP` | `true` |
   | `SESSION_SECRET` | любая длинная случайная строка |

6. В разделе **Settings** укажите `Health Check Path: /healthz`.
7. **Deploy**. Готово.

---

## Push-уведомления (по желанию)

Без VAPID-ключей приложение работает, но push-уведомления на телефоны учеников недоступны.

Чтобы включить:

1. Сгенерируйте ключи (можно через https://web-push-codelab.glitch.me или командой из папки проекта):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Dashboard → ваш Web Service → **Environment** → **Add Environment Variable**:
   - `VAPID_PUBLIC_KEY` = публичный ключ
   - `VAPID_PRIVATE_KEY` = приватный ключ
3. Нажмите **Save Changes** → деплой перезапустится.

---

## Обновления приложения

Render привязан к GitHub-репозиторию: после каждого `git push` деплой запускается автоматически (настроено `autoDeploy: true`). Миграции применяются при каждом старте контейнера и безопасны (идемпотентны).

## Особенности бесплатного тарифа

- Контейнер «засыпает» после ~15 минут без запросов; первый запрос после сна занимает 30–60 секунд (холодный старт).
- У бесплатной PostgreSQL срок жизни **90 дней**, затем базу нужно будет обновить (кнопка в дашборде Render).
- Для постоянной доступности можно перейти на платный план (~$7/мес) — приложение менять не нужно.

## Диагностика

| Симптом | Что делать |
|---|---|
| Сайт не открывается / 502 | Dashboard → Service → **Logs** — смотрите ошибки запуска |
| Ошибка про `DATABASE_URL` | Проверьте, что переменная задана в Environment |
| Пустой экран с ошибкой JS | Откройте DevTools (F12) → Console; убедитесь, что API отвечает по `/api/healthz` |
| Изменения БД не появляются | Схема применяется при старте; перезапустите сервис (Manual Deploy → Restart) |

## Чек-лист перед публикацией

- [ ] Код запушен в GitHub
- [ ] Blueprint / Web Service создан, статус **Live**
- [ ] `https://raspisanie.onrender.com` открывается
- [ ] Вход тренера: `79991234567` / `12345`
- [ ] Запись ученика на слот работает
- [ ] (опционально) VAPID-ключи добавлены, push работает