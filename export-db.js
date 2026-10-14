import { Pool } from "pg";
import fs from "fs";

// Подключение к Neon (текущая база с данными)
const NEON_URL = "postgresql://neondb_owner:npg_QtV4jHsLpM6h@ep-steep-cake-ascu6wox.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require";

async function exportDatabase() {
  const pool = new Pool({
    connectionString: NEON_URL,
    ssl: false,
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log("📤 Экспорт данных из Neon...");
    
    // Экспортируем пользователей
    const users = await pool.query("SELECT * FROM users");
    console.log(`  users: ${users.rows.length} записей`);
    
    // Экспортируем документы
    const documents = await pool.query("SELECT * FROM documents");
    console.log(`  documents: ${documents.rows.length} записей`);
    
    // Экспортируем настройки тренера
    const settings = await pool.query("SELECT * FROM trainer_settings");
    console.log(`  trainer_settings: ${settings.rows.length} записей`);
    
    // Экспортируем слоты
    const slots = await pool.query("SELECT * FROM time_slots LIMIT 100");
    console.log(`  time_slots: ${slots.rows.length} записей (первые 100)`);
    
    // Экспортируем записи
    const bookings = await pool.query("SELECT * FROM bookings LIMIT 50");
    console.log(`  bookings: ${bookings.rows.length} записей (первые 50)`);
    
    // Экспортируем оплаты
    const membership = await pool.query("SELECT * FROM membership_payments LIMIT 20");
    console.log(`  membership_payments: ${membership.rows.length} записей (первые 20)`);
    
    const trainerPay = await pool.query("SELECT * FROM trainer_payments LIMIT 20");
    console.log(`  trainer_payments: ${trainerPay.rows.length} записей (первые 20)`);
    
    // Экспортируем постоянные записи
    const recurring = await pool.query("SELECT * FROM recurring_bookings LIMIT 20");
    console.log(`  recurring_bookings: ${recurring.rows.length} записей (первые 20)`);
    
    // Экспортируем согласия
    const consents = await pool.query("SELECT * FROM user_consents LIMIT 50");
    console.log(`  user_consents: ${consents.rows.length} записей (первые 50)`);
    
    // Экспортируем parent_children
    const parentChildren = await pool.query("SELECT * FROM parent_children LIMIT 50");
    console.log(`  parent_children: ${parentChildren.rows.length} записей (первые 50)`);
    
    // Экспортируем уведомления
    const notifications = await pool.query("SELECT * FROM notifications LIMIT 50");
    console.log(`  notifications: ${notifications.rows.length} записей (первые 50)`);
    
    // Экспортируем push подписки
    const pushSubs = await pool.query("SELECT * FROM push_subscriptions LIMIT 50");
    console.log(`  push_subscriptions: ${pushSubs.rows.length} записей (первые 50)`);
    
    console.log("\n✅ Экспорт завершён!");
    console.log("\n📋 Теперь нужно:");
    console.log("1. Создать базу на Layero");
    console.log("2. Скопировать DATABASE_URL из Layero");
    console.log("3. Заменить NEON_URL в этом файле на URL из Layero");
    console.log("4. Запустить импорт");
    
  } catch (err) {
    console.error("❌ Ошибка:", err.message);
  } finally {
    await pool.end();
  }
}

exportDatabase();
