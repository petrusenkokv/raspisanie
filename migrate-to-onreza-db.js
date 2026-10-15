/**
 * Миграция данных из Neon в onreza PostgreSQL.
 * 
 * Запуск:
 *   NEON_URL="<neon_connection_string>" NODE_ENV=production node migrate-to-onreza-db.js
 * 
 * При этом текущий DATABASE_URL должен быть onreza-базой.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./shared/schema.ts";

const ONREZA_URL = process.env.DATABASE_URL;
const NEON_URL = process.env.NEON_URL;

if (!NEON_URL) {
  console.error("❌ Укажите NEON_URL через env");
  process.exit(1);
}
if (!ONREZA_URL) {
  console.error("❌ Укажите DATABASE_URL (onreza) через env");
  process.exit(1);
}

const neonPool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });
const onrezaPool = new Pool({ connectionString: ONREZA_URL });
const onrezaDb = drizzle(onrezaPool, { schema });

const TABLES = Object.keys(schema).filter(k => {
  const v = schema[k];
  return v && typeof v === "object" && "$tableName" in v;
});

console.log(`📋 Таблицы для миграции: ${TABLES.length}`);

async function copyTable(tableName, neonDb, onrezaDb) {
  try {
    const rows = await neonDb.select().from(tableName);
    if (rows.length === 0) {
      console.log(`  📭 ${tableName}: 0 строк`);
      return;
    }
    await onrezaDb.insert(tableName).values(rows);
    console.log(`  ✅ ${tableName}: ${rows.length} строк`);
  } catch (err) {
    console.error(`  ⚠️  ${tableName}: ${err.message}`);
  }
}

async function main() {
  console.log("🚀 Начало миграции...");
  
  // Сначала создаём все таблицы
  for (const name of TABLES) {
    try {
      const colNames = Object.keys(schema[name].columns);
      const colDefs = colNames.map(n => schema[name].columns[n]);
      await onrezaDb.execute(
        `CREATE TABLE IF NOT EXISTS "${name}" (${
          colDefs.map(c => {
            let type = c.dataType;
            if (c.dataType === "varchar") type = "varchar";
            return `"${c.name}" ${type}`;
          }).join(", ")
        })`
      );
      console.log(`  📦 ${name}: таблица создана`);
    } catch (err) {
      console.error(`  ⚠️  ${name}: не удалось создать таблицу: ${err.message}`);
    }
  }

  // Копируем данные
  console.log("\n📤 Копируем данные...");
  for (const name of TABLES) {
    await copyTable(name, drizzle(neonPool, { schema }), onrezaDb);
  }

  await neonPool.end();
  await onrezaPool.end();
  console.log("\n✅ Миграция завершена!");
}

main().catch(err => {
  console.error("❌ Ошибка:", err);
  process.exit(1);
});