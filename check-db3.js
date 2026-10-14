import { Pool } from "pg";

// Без channel_binding
const DATABASE_URL = "postgresql://neondb_owner:npg_QtV4jHsLpM6h@ep-steep-cake-ascu6wox-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function testConnection() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
    connectionTimeoutMillis: 15000,
    max: 5,
  });

  try {
    console.log("Тестирую подключение...");
    
    // Тест 1: простое подключение
    const res1 = await pool.query("SELECT 1 as test");
    console.log("✓ Подключение работает:", res1.rows);
    
    // Тест 2: users
    const res2 = await pool.query("SELECT count(*) FROM users");
    console.log("✓ users:", res2.rows[0].count);
    
    // Тест 3: bookings
    const res3 = await pool.query("SELECT count(*) FROM bookings WHERE status <> 'cancelled'");
    console.log("✓ active bookings:", res3.rows[0].count);
    
    // Тест 4: time_slots
    const res4 = await pool.query("SELECT count(*) FROM time_slots");
    console.log("✓ time_slots:", res4.rows[0].count);
    
    // Тест 5: trainer_settings
    const res5 = await pool.query("SELECT count(*) FROM trainer_settings");
    console.log("✓ trainer_settings:", res5.rows[0].count);
    
    // Тест 6: membership_payments
    const res6 = await pool.query("SELECT count(*) FROM membership_payments");
    console.log("✓ membership_payments:", res6.rows[0].count);
    
    // Тест 7: trainer_payments
    const res7 = await pool.query("SELECT count(*) FROM trainer_payments");
    console.log("✓ trainer_payments:", res7.rows[0].count);
    
    // Тест 8: recurring_bookings
    const res8 = await pool.query("SELECT count(*) FROM recurring_bookings");
    console.log("✓ recurring_bookings:", res8.rows[0].count);
    
    console.log("\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!");
    console.log("База подключается и данные доступны.");
    
  } catch (err) {
    console.error("❌ Ошибка:", err.message);
    if (err.code) console.error("Код ошибки:", err.code);
    if (err.sqlState) console.error("SQL State:", err.sqlState);
  } finally {
    await pool.end();
  }
}

testConnection();
