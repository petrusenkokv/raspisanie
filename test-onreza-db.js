import { Pool } from "pg";

const url = "postgresql://kaiki_c_a247231c83088ceb899a5a4b:Kk1!KC6fwJgZnWEe6ahBEkuFtfEn4o4E@ep-134ea96c94f9.kaiki.ru:5432/raspisanie_db?sslmode=require";

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  const r = await pool.query("SELECT version()");
  console.log("OK:", r.rows[0].version);
} catch (e) {
  console.log("FAIL:", e.message, e.code);
}
await pool.end();
