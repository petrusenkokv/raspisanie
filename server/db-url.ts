/**
 * URL подключения к PostgreSQL.
 *
 * - `DATABASE_URL` — стандартное имя переменной (Vercel, Render, Replit,
 *   локальная разработка).
 * - `LAYERO_DATABASE_URL` — имя, которое платформа Layero подставляет сама,
 *   когда управляемая база подключена к проекту (см. docs.layero.ru/database).
 */
export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.LAYERO_DATABASE_URL;
}