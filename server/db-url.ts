/**
 * URL подключения к PostgreSQL.
 *
 * - `DATABASE_URL` — стандартное имя переменной (Vercel, Render, Replit,
 *   локальная разработка).
 * - `LAYERO_DATABASE_URL` — имя, которое платформа Layero подставляет сама,
 *   когда управляемая база подключена к проекту (см. docs.layero.ru/database).
 */
export function getDatabaseUrl(): string | undefined {
  // DATABASE_URL_UNPOOLED работает стабильнее (без pgbouncer и channel_binding)
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.LAYERO_DATABASE_URL;
}

/**
 * Clean connection string — remove channel_binding=require which breaks on serverless.
 */
export function cleanDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/channel_binding=require&?/g, "");
}