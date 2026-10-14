import { Pool } from "pg";

const DATABASE_URL = "postgresql://neondb_owner:npg_QtV4jHsLpM6h@ep-steep-cake-ascu6wox-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function checkDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
  });

  try {
    console.log("Подключение к базе данных...");
    
    const usersRes = await pool.query("SELECT count(*) FROM users");
    console.log(`\n📊 Таблица users: ${usersRes.rows[0].count} записей`);
    
    const bookingsRes = await pool.query("SELECT count(*) FROM bookings WHERE status <> 'cancelled'");
    console.log(`📊 Активные bookings: ${bookingsRes.rows[0].count} записей`);
    
    const slotsRes = await pool.query("SELECT count(*) FROM time_slots");
    console.log(`📊 time_slots: ${slotsRes.rows[0].count} записей`);
    
    const settingsRes = await pool.query("SELECT count(*) FROM trainer_settings");
    console.log(`📊 trainer_settings: ${settingsRes.rows[0].count} записей`);
    
    const membershipRes = await pool.query("SELECT count(*) FROM membership_payments");
    console.log(`📊 membership_payments: ${membershipRes.rows[0].count} записей`);
    
    const trainerPayRes = await pool.query("SELECT count(*) FROM trainer_payments");
    console.log(`📊 trainer_payments: ${trainerPayRes.rows[0].count} записей`);
    
    const recurringRes = await pool.query("SELECT count(*) FROM recurring_bookings");
    console.log(`📊 recurring_bookings: ${recurringRes.rows[0].count} записей`);
    
    // Проверим сегодняшние слоты
    const today = "2026-10-13";
    const todaySlots = await pool.query("SELECT count(*) FROM time_slots WHERE date = $1", [today]);
    console.log(`\n📊 Слотов на ${today}: ${todaySlots.rows[0].count}`);
    
    const todayBookings = await pool.query("SELECT count(*) FROM bookings WHERE created_at::date = $1 AND status <> 'cancelled'", [today]);
    console.log(`📊 Активных записей на ${today}: ${todayBookings.rows[0].count}`);
    
    console.log("\n✅ Проверка завершена успешно!");
    
  } catch (err) {
    console.error("❌ Ошибка:", err.message);
    if (err.code) console.error("Код ошибки:", err.code);
  } finally {
    await pool.end();
  }
}

checkDatabase();
