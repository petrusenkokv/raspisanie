import fs from "fs";
import path from "path";

/**
 * Load .env.local / .env in development and production.
 *
 * В development: DATABASE_URL, DATABASE_URL_UNPOOLED и SESSION_SECRET
 * загружаются **всегда** из .env.local — они должны побеждать системные
 * переменные окружения (на машине разработчика может остаться DATABASE_URL
 * от другого проекта/провайдера).
 *
 * В production (onreza.app): загружаются только как fallback, если
 * переменные ещё не заданы на платформе.
 */

// Ключи, которые в development всегда перезаписываются из .env.local
const OVERRIDE_KEYS = new Set(["DATABASE_URL", "DATABASE_URL_UNPOOLED", "SESSION_SECRET"]);
const IN_PRODUCTION = process.env.NODE_ENV === "production";

let loaded = false;

export const loadDevEnv = () => {
  if (loaded) return;
  // Загружаем .env.local в development и в production (как fallback,
  // если DATABASE_URL / SESSION_SECRET не заданы на платформе).
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "production") return;
  loaded = true;

  const root = path.resolve(import.meta.dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) continue;

    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // В production — только fallback (если переменная ещё не задана на платформе)
      const shouldOverwrite = IN_PRODUCTION
        ? !process.env[key]
        : OVERRIDE_KEYS.has(key) || !process.env[key];
      if (shouldOverwrite) {
        process.env[key] = value;
      }
    }
  }
};

// В ESM все import исполняются до тела модуля, поэтому storage-instance.ts
// успевал прочитать DATABASE_URL из окружения ОС раньше loadDevEnv().
// Загружаем переменные прямо при импорте этого модуля (как это делает dotenv).
loadDevEnv();