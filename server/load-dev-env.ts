import fs from "fs";
import path from "path";

/**
 * Load .env.local / .env in development.
 *
 * DATABASE_URL, DATABASE_URL_UNPOOLED и SESSION_SECRET загружаются из .env.local
 * **всегда** — они должны побеждать системные переменные окружения (на машине
 * разработчика может остаться DATABASE_URL от другого проекта/провайдера).
 * Все остальные переменные подставляются только если ещё не заданы.
 */

// Ключи, которые всегда перезаписываются из .env.local
const OVERRIDE_KEYS = new Set(["DATABASE_URL", "DATABASE_URL_UNPOOLED", "SESSION_SECRET"]);

let loaded = false;

export const loadDevEnv = () => {
  if (loaded) return;
  if (process.env.NODE_ENV !== "development") return;
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

      if (OVERRIDE_KEYS.has(key) || !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
};

// В ESM все import исполняются до тела модуля, поэтому storage-instance.ts
// успевал прочитать DATABASE_URL из окружения ОС раньше loadDevEnv().
// Загружаем переменные прямо при импорте этого модуля (как это делает dotenv).
loadDevEnv();