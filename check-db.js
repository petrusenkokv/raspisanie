import { Pool } from "pg";

const DATABASE_URL = "postgresql://neondb_owner:npg_QtV4jHsLpM6h@ep-steep-cake-ascu6wox-pooler.c-4.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

async function checkDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log("Подключение к базе данных...");
    
    // Проверим users
    const usersRes = await pool.query("SELECT count(*) FROM users");
    console.log(`\n📊 Таблица users: ${usersRes.rows[0].count} записей`);
    
    if (parseInt(usersRes.rows[0].count) > 0) {
      const users = await pool.query("SELECT id, first_name, last_name, phone, role FROM users LIMIT 10");
      console.log("\nПользователи:");
      users.rows.forEach(u => {
        console.log(`  - ${u.last_name} ${u.first_name} | ${u.phone} | role: ${u.role}`);
      });
    }
    
    // Проверим bookings
    const bookingsRes = await pool.query("SELECT count(*) FROM bookings");
    console.log(`\n📊 Таблица bookings: ${bookingsRes.rows[0].count} записей`);
    
    if (parseInt(bookingsRes.rows[0].count) > 0) {
      const bookings = await pool.query(`
        SELECT b.id, b.status, b.student_id, b.time_slot_id, b.created_at
        FROM bookings b 
        ORDER BY b.created_at DESC 
        LIMIT 5
      `);
      console.log("\nПоследние записи:");
      bookings.rows.forEach(b => {
        console.log(`  - ID: ${b.id.substring(0,8)}... | status: ${b.status} | created: ${b.created_at}`);
      });
    }
    
    // Проверим time_slots
    const slotsRes = await pool.query("SELECT count(*) FROM time_slots");
    console.log(`\n📊 Таблица time_slots: ${slotsRes.rows[0].count} записей`);
    
    // Проверим trainer_settings
    const settingsRes = await pool.query("SELECT count(*) FROM trainer_settings");
    console.log(`\n📊 Таблица trainer_settings: ${settingsRes.rows[0].count} записей`);
    
    // Проверим membership_payments
    const membershipRes = await pool.query("SELECT count(*) FROM membership_payments");
    console.log(`\n📊 Таблица membership_payments: ${membershipRes.rows[0].count} записей`);
    
    // Проверим trainer_payments
    const trainerPayRes = await pool.query("SELECT count(*) FROM trainer_payments");
    console.log(`\n📊 Таблица trainer_payments: ${trainerPayRes.rows[0].count} записей`);
    
    // Проверим recurring_bookings
    const recurringRes = await pool.query("SELECT count(*) FROM recurring_bookings");
    console.log(`\n📊 Таблица recurring_bookings: ${recurringRes.rows[0].count} записей`);
    
    console.log("\n✅ Проверка завершена!");
    
  } catch (err) {
    console.error("❌ Ошибка подключения:", err.message);
    if (err.code) console.error("Код ошибки:", err.code);
  } finally {
    await pool.end();
  }
}

checkDatabase();
