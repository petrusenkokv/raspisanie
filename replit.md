# Расписание тренировок

## Overview

Веб-приложение для управления расписанием тренировок в зале: студенты записываются на свободные слоты, тренер ведёт расписание, карточки учеников и согласия на обработку документов.

## User Preferences

Preferred communication style: Simple, everyday language (Russian).

## System Architecture

### Frontend
- React 18 + TypeScript, сборка через Vite
- UI: shadcn/ui поверх Radix UI, TailwindCSS
- Маршрутизация: wouter (одна страница `/` — `GymSchedulePage`, всё остальное → `NotFound`)
- Состояние: Zustand (`store/gym-store.ts`)
- Серверные данные: TanStack Query
- Формы: React Hook Form + Zod

### Backend
- Express.js + TypeScript
- REST API в `server/routes.ts`
- In-memory хранилище в `server/storage.ts` (интерфейс `IStorage` + `MemStorage`)
- Валидация запросов через Zod-схемы из `@shared/schema`

### Структура клиента
- `client/src/pages/` — `gym-schedule.tsx`, `not-found.tsx`
- `client/src/components/gym/` — модалки и виджеты расписания (календарь, слоты, авторизация, панель учеников, документы и т. д.)
- `client/src/components/ui/` — компоненты shadcn
- `client/src/store/gym-store.ts` — глобальное состояние приложения
- `client/src/lib/queryClient.ts` — настроенный TanStack Query + `apiRequest`

### Данные
- `shared/schema.ts` — таблицы `users`, `bookings`, `timeSlots`, `documents`, `userConsents`, `scheduleSettings` и Zod-схемы к ним
- Drizzle ORM (типы), но рантайм использует in-memory `MemStorage`

### Ключевые фичи
- День / неделя / месяц в расписании
- Запись на слот с лимитом мест
- Авторизация по телефону (демо-код в логах сервера)
- Карточки учеников: ФИО, дата рождения, заметки тренера, законный представитель для младше 14
- Документы и согласия: тренер управляет списком, ученик принимает при регистрации
- Блокировка периодов и настройки расписания тренером
- Управление вместимостью слотов: количество мест по умолчанию, переопределение по дням недели в шаблоне и индивидуально для каждого слота (не ниже текущего числа подтверждённых записей)
- Посещаемость: 4 статуса (Пришёл / Опоздал / Уважительная / Прогул), статистика в карточке ученика, режим больничного «болеет до даты X» с авто-отменой будущих записей как «уважительная»
- Оплаты:
  - Членский взнос: ЧВ за месяц (`monthly_cv`) или БВ — разовый благотворительный взнос на дату (`one_time_bv`)
  - Абонементы тренеру: разовая / неделя / месяц с заданным числом тренировок; отметка «Пришёл» или «Опоздал» автоматически списывает одну тренировку из активного абонемента (по очереди — старейший с остатком)
  - При отмене записи или переводе её в «уважительную/прогул» списанная тренировка возвращается обратно
  - В строке записи у тренера отображаются мини-бейджи статуса оплаты «ЧВ/БВ» и остатка тренировок «X/Y»

### Учётные данные тренера
- Тренер создаётся при первом запуске; вход — через модалку «Войти», далее доступна панель учеников и настройки

## Endpoints (основное)
- `POST /api/auth/send-verification`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/change-password`
- `GET /api/schedule/day/:date`, `GET /api/schedule/week/:date`, `GET /api/schedule/month/:date`
- `POST /api/bookings`, `DELETE /api/bookings/:id`
- `GET /api/documents`
- `GET|POST|PATCH|DELETE /api/trainer/documents`
- `GET|PATCH /api/trainer/students/:id`
- `POST /api/trainer/block`, `DELETE /api/trainer/block/:id`
- `GET|PATCH /api/trainer/schedule-settings`

## Запуск
- Workflow `Start application` запускает `npm run dev` (Express + Vite на одном порту 5000).
