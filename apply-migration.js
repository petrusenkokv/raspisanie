import { readFileSync } from "fs";
import { Pool } from "pg";

const url = readFileSync(".dburl", "utf8").trim();
const sql = readFileSync("migrations/0000_init.sql", "utf8");

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

const client = await pool.connect();
try {
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const [i, stmt] of statements.entries()) {
    const label = stmt.split("\n")[0].slice(0, 60);
    try {
      await client.query(stmt);
      console.log(`[${i + 1}/${statements.length}] OK  ${label}`);
    } catch (err) {
      // 42P07 = duplicate_table, 42701 = duplicate_column, 42P16 = index exists
      if (["42P07", "42701", "42P06"].includes(err.code)) {
        console.log(`[${i + 1}/${statements.length}] SKIP ${label} (${err.code})`);
      } else {
        console.log(`[${i + 1}/${statements.length}] FAIL ${label} -> ${err.message}`);
      }
    }
  }

  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  );
  console.log("\nТаблицы в базе:", rows.map((r) => r.table_name).join(", "));
} finally {
  client.release();
  await pool.end();
}
