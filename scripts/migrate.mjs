#!/usr/bin/env node
/**
 * Applies scripts/schema-export.sql to the database in an idempotent way.
 *
 * Used as the migration step on Render (ONREZA) before the app starts:
 *   - creates all base tables + foreign keys (skips "already exists" errors)
 *   - safe to run on every container start (idempotent)
 *   - retries while the database is still provisioning
 *
 * Extra tables/columns (push_subscriptions, blocked_periods, sick_periods,
 * payment_reports, parent_children, recurring_booking_exceptions,
 * trainer_services, pricing columns, ...) are created by DbStorage.seed()
 * at app startup when SEED_DATABASE_ON_STARTUP=true.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

// Render internal URLs don't need SSL; external URLs include sslmode=require.
const needsSsl = /(^|[?&])(sslmode=require|ssl=true)(&|$)/i.test(connectionString);

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema-export.sql");
const raw = readFileSync(schemaPath, "utf8");

const statements = (raw + "\n")
  .split(/;\s*\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

// PostgreSQL error codes meaning "already exists" — safe to skip.
const SKIP_CODES = new Set(["42P07", "42710", "42701"]);

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;

async function connectWithRetry() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const pool = new Pool({
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      return { pool, client };
    } catch (err) {
      console.error(
        `[migrate] DB not ready (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err?.message ?? err,
      );
      await pool.end().catch(() => {});
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      }
    }
  }
  console.error("[migrate] Could not connect to the database after retries");
  process.exit(1);
}

async function main() {
  const { pool, client } = await connectWithRetry();
  try {
    console.log(`[migrate] Applying ${statements.length} statement(s)…`);
    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log(`[migrate] OK: ${statement.replace(/\s+/g, " ").slice(0, 70)}…`);
      } catch (err) {
        if (SKIP_CODES.has(err?.code)) {
          console.log(`[migrate] skip (${err.code} already exists): ${statement.replace(/\s+/g, " ").slice(0, 60)}…`);
          continue;
        }
        throw err;
      }
    }
    console.log("[migrate] Schema is up to date ✅");
  } catch (err) {
    console.error("[migrate] Failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main();