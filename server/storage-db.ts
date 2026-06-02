import { db } from "./db";
import { eq, and, or, ne, asc, desc, inArray, gte, lte, lt, sql as drizzleSql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import {
  users, documents, userConsents, parentChildren, timeSlots, trainerSettings,
  holidays, recurringBookings, recurringBookingExceptions, bookings, membershipPayments, trainerPayments, notifications,
  type User, type InsertUser,
  type TimeSlot, type InsertTimeSlot,
  type Booking, type InsertBooking,
  type Notification, type InsertNotification,
  type Document, type InsertDocument,
  type UserConsent,
  type StudentWithConsents,
  type RecurringBooking, type InsertRecurringBooking,
  type Holiday,
  type TrainerSettings, type TrainerSettingsUpdate, type WeeklyTemplate,
  type AttendanceStatus,
  type MembershipPayment, type MembershipPaymentInput,
  type TrainerPayment, type TrainerPaymentInput, type TrainerPaymentWithUsage,
  type StudentPaymentStatus,
  type TimeSlotWithBookings, type BookingWithDetails, type DaySchedule, type ScheduleBookingStudent,
  type BroadcastLog,
  type ParentChild,
  type InsertParentChild,
} from "@shared/schema";
import { randomUUID } from "crypto";
import type { IStorage, AttendanceStats, BlockedPeriod } from "./storage";
import type { PushSubscriptionData } from "./push";
import {
  moscowDateString,
  addDaysToDateStr,
  cvValidUntilForDate,
  eachDateStrInRange,
  nextCvAllowedDateStr,
} from "./moscow-date";

// Sick periods table (not in shared schema, defined locally)
const sickPeriods = pgTable("sick_periods", {
  id: varchar("id").primaryKey().default(drizzleSql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

const blockedPeriods = pgTable("blocked_periods", {
  id: varchar("id").primaryKey().default(drizzleSql`gen_random_uuid()`),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------- helpers ----------

function localDateStr(d: Date): string {
  return moscowDateString(d);
}

function bookingStudentFromUser(u: {
  firstName: string;
  lastName: string | null;
  phone: string;
  role: string;
  exemptMembership: boolean | null;
  exemptTrainerPayment: boolean | null;
}): ScheduleBookingStudent {
  return {
    firstName: u.firstName,
    lastName: u.lastName || "",
    phone: u.phone,
    role: u.role as ScheduleBookingStudent["role"],
    exemptMembership: u.exemptMembership ?? false,
    exemptTrainerPayment: u.exemptTrainerPayment ?? false,
  };
}

function isoWeekday(date: Date): number {
  const w = date.getDay();
  return w === 0 ? 7 : w;
}

function eachDateInRange(startStr: string, endStr: string): Date[] {
  const out: Date[] = [];
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

function defaultWeeklyTemplate(startHour: number, endHour: number): WeeklyTemplate {
  const out: WeeklyTemplate = {};
  for (let i = 1; i <= 7; i++) {
    out[String(i) as "1"] = { enabled: true, startHour, endHour };
  }
  return out;
}

function isWorkingHour(template: WeeklyTemplate, date: string, hour: number): boolean {
  const wd = isoWeekday(new Date(date + "T00:00:00"));
  const entry = template[String(wd) as "1"];
  if (!entry || !entry.enabled) return false;
  if (hour < entry.startHour || hour >= entry.endHour) return false;
  if (entry.breakStartHour != null && entry.breakEndHour != null) {
    if (hour >= entry.breakStartHour && hour < entry.breakEndHour) return false;
  }
  return true;
}

function resolveCapacity(template: WeeklyTemplate, defaultCapacity: number, date: string): number {
  const wd = isoWeekday(new Date(date + "T00:00:00"));
  const entry = template[String(wd) as "1"];
  if (entry && entry.capacity != null) return entry.capacity;
  return defaultCapacity;
}

function normalizeTime(t: string): string {
  return t ? t.slice(0, 5) : t;
}

function slotHourFromTime(t: string): number {
  const norm = normalizeTime(t);
  const fromColon = parseInt(norm.slice(0, 2), 10);
  if (!Number.isNaN(fromColon)) return fromColon;
  return parseInt(norm, 10);
}

function normalizeSlot(s: TimeSlot): TimeSlot {
  return { ...s, time: normalizeTime(s.time), date: typeof s.date === 'object' ? localDateStr(s.date as any) : String(s.date) };
}

export class DbStorage implements IStorage {
  private settingsCache: TrainerSettings | null = null;
  private broadcastLogs: Map<string, BroadcastLog> = new Map();
  private recurringExceptionsSchemaReady = false;
  private blockedPeriodsSchemaReady = false;

  private async ensureRecurringExceptionsSchema(): Promise<void> {
    if (this.recurringExceptionsSchemaReady) return;
    try {
      await db.execute(drizzleSql`
        CREATE TABLE IF NOT EXISTS recurring_booking_exceptions (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          recurring_booking_id varchar NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
          date text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      await db.execute(drizzleSql`
        CREATE UNIQUE INDEX IF NOT EXISTS recurring_booking_exceptions_rule_date
        ON recurring_booking_exceptions (recurring_booking_id, date)
      `);
    } catch { /* ignore */ }
    this.recurringExceptionsSchemaReady = true;
  }

  private async ensureBlockedPeriodsSchema(): Promise<void> {
    if (this.blockedPeriodsSchemaReady) return;
    try {
      await db.execute(drizzleSql`
        CREATE TABLE IF NOT EXISTS blocked_periods (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          start_date text NOT NULL,
          end_date text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      this.blockedPeriodsSchemaReady = true;
    } catch {
      // ignore schema race/fallback issues
    }
  }

  // ======================== SETTINGS ========================

  private async loadSettings(): Promise<TrainerSettings> {
    if (this.settingsCache) return this.settingsCache;
    const rows = await db.select().from(trainerSettings).limit(1);
    if (rows.length === 0) {
      const wt = defaultWeeklyTemplate(8, 20);
      const inserted = await db.insert(trainerSettings).values({
        dayStartHour: 8,
        dayEndHour: 20,
        weeklyTemplate: JSON.stringify(wt),
        cancelDeadlineHours: 3,
        bookingDeadlineHours: 1,
        defaultCapacity: 2,
        reminderMinutes: null,
      }).returning();
      this.settingsCache = this.mapSettings(inserted[0]);
    } else {
      this.settingsCache = this.mapSettings(rows[0]);
    }
    return this.settingsCache!;
  }

  private mapSettings(row: typeof trainerSettings.$inferSelect): TrainerSettings {
    return {
      id: row.id,
      dayStartHour: row.dayStartHour,
      dayEndHour: row.dayEndHour,
      weeklyTemplate: row.weeklyTemplate ? JSON.parse(row.weeklyTemplate) : defaultWeeklyTemplate(8, 20),
      cancelDeadlineHours: (row as any).cancelDeadlineHours ?? 3,
      bookingDeadlineHours: (row as any).bookingDeadlineHours ?? 1,
      defaultCapacity: (row as any).defaultCapacity ?? 2,
      reminderMinutes: row.reminderMinutes ?? null,
      welcomeMessage: (row as any).welcomeMessage ?? null,
      updatedAt: row.updatedAt ?? null,
    };
  }

  async getTrainerSettings(): Promise<TrainerSettings> {
    return this.loadSettings();
  }

  // ======================== SEED ========================

  async seed(): Promise<void> {
    // Ensure DB columns exist (safe migrations)
    try {
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pending_approval boolean NOT NULL DEFAULT false`);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS exempt_membership boolean NOT NULL DEFAULT false`);
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS exempt_trainer_payment boolean NOT NULL DEFAULT false`);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_parent boolean NOT NULL DEFAULT false`);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_also_student boolean NOT NULL DEFAULT false`);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_representative_confirmed boolean NOT NULL DEFAULT false`);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`
        CREATE TABLE IF NOT EXISTS parent_children (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          parent_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          child_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamp DEFAULT now(),
          UNIQUE(parent_id, child_id)
        )
      `);
    } catch { /* ignore */ }
    try {
      await db.execute(drizzleSql`
        CREATE TABLE IF NOT EXISTS recurring_booking_exceptions (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          recurring_booking_id varchar NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
          date text NOT NULL,
          created_at timestamp DEFAULT now()
        )
      `);
      await db.execute(drizzleSql`
        CREATE UNIQUE INDEX IF NOT EXISTS recurring_booking_exceptions_rule_date
        ON recurring_booking_exceptions (recurring_booking_id, date)
      `);
    } catch { /* ignore */ }

    // Ensure trainer exists
    const trainer = await this.getTrainer();
    if (!trainer) {
      await db.insert(users).values({
        phone: "79991234567",
        firstName: "Константин",
        lastName: "Владимирович",
        role: "trainer",
        isVerified: true,
        password: "12345",
        mustChangePassword: false,
        isActive: true,
        exemptMembership: true,
        exemptTrainerPayment: true,
      });
    } else if (trainer.role === "trainer" && (!trainer.exemptMembership || !trainer.exemptTrainerPayment)) {
      await db.update(users).set({
        exemptMembership: true,
        exemptTrainerPayment: true,
      }).where(eq(users.id, trainer.id));
    }
    // Ensure default documents exist
    const docs = await db.select().from(documents);
    if (docs.length === 0) {
      await db.insert(documents).values([
        {
          title: "Правила техники безопасности в тренажёрном зале",
          content: "1. Перед тренировкой обязательно проведите разминку.\n2. Используйте оборудование строго по назначению.\n3. Не допускайте перегрузок, при недомогании немедленно прекратите занятие и сообщите тренеру.\n4. Соблюдайте чистоту, после упражнений возвращайте инвентарь на место.\n5. Запрещено заниматься в состоянии алкогольного или наркотического опьянения.\n\nЯ ознакомлен(а) с правилами техники безопасности и обязуюсь их соблюдать.",
          isActive: true,
        },
        {
          title: "Разрешение на фото- и видеосъёмку",
          content: "Я даю согласие тренеру и администрации зала на проведение фото- и видеосъёмки во время тренировок, а также на использование полученных материалов в информационных, рекламных и образовательных целях (соцсети, сайт, отчётность).\n\nСогласие может быть отозвано в любой момент по письменному заявлению.",
          isActive: true,
        },
      ]);
    }
    // Ensure time slots exist for next 30 days
    const settings = await this.loadSettings();
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      await this.generateTimeSlotsForDate(localDateStr(d), settings);
    }
  }

  // ======================== USERS ========================

  async getUser(id: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.phone, phone));
    return rows[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const rows = await db.insert(users).values({
      phone: insertUser.phone,
      firstName: insertUser.firstName,
      lastName: insertUser.lastName ?? null,
      middleName: insertUser.middleName ?? null,
      birthDate: insertUser.birthDate ?? null,
      trainerNotes: insertUser.trainerNotes ?? null,
      parentFullName: insertUser.parentFullName ?? null,
      parentPhone: insertUser.parentPhone ?? null,
      legalRepresentativeConfirmed: (insertUser as any).legalRepresentativeConfirmed ?? false,
      sickUntil: insertUser.sickUntil ?? null,
      sickNote: insertUser.sickNote ?? null,
      exemptMembership: (insertUser as any).exemptMembership ?? false,
      exemptTrainerPayment: (insertUser as any).exemptTrainerPayment ?? false,
      isActive: true,
      isPendingApproval: insertUser.isPendingApproval ?? false,
      cvRestartDate: null,
      role: insertUser.role || "student",
      isParent: (insertUser as any).isParent ?? false,
      isAlsoStudent: (insertUser as any).isAlsoStudent ?? false,
      isVerified: insertUser.isVerified ?? false,
      verificationCode: null,
      password: insertUser.password ?? "",
      mustChangePassword: insertUser.mustChangePassword ?? false,
    }).returning();
    return rows[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const rows = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!rows[0]) throw new Error("Пользователь не найден");
    return rows[0];
  }

  async verifyUser(id: string): Promise<User> {
    return this.updateUser(id, { isVerified: true, verificationCode: null });
  }

  async getChildrenByParent(parentId: string): Promise<User[]> {
    const links = await db.select().from(parentChildren).where(eq(parentChildren.parentId, parentId));
    if (links.length === 0) return [];
    const childIds = links.map((l) => l.childId);
    const rows = await db.select().from(users).where(inArray(users.id, childIds));
    return rows.filter((u) => u.role === "student");
  }

  async getParentsByChild(childId: string): Promise<User[]> {
    const links = await db.select().from(parentChildren).where(eq(parentChildren.childId, childId));
    if (links.length === 0) return [];
    const parentIds = links.map((l) => l.parentId);
    const rows = await db.select().from(users).where(inArray(users.id, parentIds));
    return rows.filter((u) => u.role === "parent");
  }

  async addParentChild(link: InsertParentChild): Promise<ParentChild> {
    const existing = await db.select().from(parentChildren).where(
      and(eq(parentChildren.parentId, link.parentId), eq(parentChildren.childId, link.childId)),
    );
    if (existing[0]) return existing[0];
    const rows = await db.insert(parentChildren).values(link).returning();
    return rows[0];
  }

  async isParentOfChild(parentId: string, childId: string): Promise<boolean> {
    const rows = await db.select().from(parentChildren).where(
      and(eq(parentChildren.parentId, parentId), eq(parentChildren.childId, childId)),
    );
    return rows.length > 0;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUser(id);
    if (!user) throw new Error("Пользователь не найден");
    if (user.role === "trainer") throw new Error("Нельзя удалить тренера");
    await db.delete(parentChildren).where(
      or(eq(parentChildren.parentId, id), eq(parentChildren.childId, id)),
    );
    // Get all booking IDs for this student so we can nullify FK references in notifications
    const studentBookingRows = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.studentId, id));
    const studentBookingIds = studentBookingRows.map(r => r.id);

    await db.delete(userConsents).where(eq(userConsents.userId, id));
    // Delete student's own notifications
    await db.delete(notifications).where(eq(notifications.userId, id));
    // Nullify relatedUserId in any notifications referencing this student
    await db.update(notifications).set({ relatedUserId: null }).where(eq(notifications.relatedUserId, id));
    // Nullify relatedBookingId in any notifications referencing this student's bookings (FK constraint)
    if (studentBookingIds.length > 0) {
      await db.update(notifications).set({ relatedBookingId: null }).where(inArray(notifications.relatedBookingId, studentBookingIds));
    }
    // Delete membership and trainer payment records for this student
    await db.delete(membershipPayments).where(eq(membershipPayments.studentId, id));
    await db.delete(trainerPayments).where(eq(trainerPayments.studentId, id));
    // Delete sick periods for this student
    await db.delete(sickPeriods).where(eq(sickPeriods.studentId, id));
    await db.update(bookings).set({ recurringBookingId: null }).where(eq(bookings.studentId, id));
    await db.delete(recurringBookings).where(eq(recurringBookings.studentId, id));
    await db.delete(bookings).where(eq(bookings.studentId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  // ======================== DOCUMENTS ========================

  async getDocuments(activeOnly = false): Promise<Document[]> {
    const rows = activeOnly
      ? await db.select().from(documents).where(eq(documents.isActive, true)).orderBy(asc(documents.createdAt))
      : await db.select().from(documents).orderBy(asc(documents.createdAt));
    return rows;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const rows = await db.select().from(documents).where(eq(documents.id, id));
    return rows[0];
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const rows = await db.insert(documents).values({
      title: doc.title,
      content: doc.content,
      isActive: doc.isActive ?? true,
    }).returning();
    return rows[0];
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
    const rows = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    if (!rows[0]) throw new Error("Документ не найден");
    return rows[0];
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) throw new Error("Документ не найден");
    await db.delete(userConsents).where(eq(userConsents.documentId, id));
    await db.delete(documents).where(eq(documents.id, id));
  }

  // ======================== CONSENTS ========================

  async getConsentsByUser(userId: string): Promise<(UserConsent & { document: Document })[]> {
    const rows = await db.select().from(userConsents)
      .innerJoin(documents, eq(userConsents.documentId, documents.id))
      .where(eq(userConsents.userId, userId));
    const mapped = rows.map(r => ({ ...r.user_consents, document: r.documents }));
    const seen = new Set<string>();
    return mapped.filter((row) => {
      if (seen.has(row.documentId)) return false;
      seen.add(row.documentId);
      return true;
    });
  }

  async recordConsent(userId: string, documentId: string): Promise<UserConsent> {
    const existing = await db
      .select()
      .from(userConsents)
      .where(and(eq(userConsents.userId, userId), eq(userConsents.documentId, documentId)))
      .limit(1);
    if (existing[0]) return existing[0];

    const rows = await db.insert(userConsents).values({ userId, documentId }).returning();
    return rows[0];
  }

  async getStudentWithConsents(id: string): Promise<StudentWithConsents | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    const consents = await this.getConsentsByUser(id);
    return { ...user, consents };
  }

  // ======================== TIME SLOTS ========================

  async getTimeSlotById(id: string): Promise<TimeSlot | undefined> {
    const rows = await db.select().from(timeSlots).where(eq(timeSlots.id, id));
    return rows[0] ? normalizeSlot(rows[0]) : undefined;
  }

  async getTimeSlotsByDate(date: string): Promise<TimeSlotWithBookings[]> {
    const slots = await db.select().from(timeSlots).where(eq(timeSlots.date, date)).orderBy(asc(timeSlots.time));
    return Promise.all(slots.map(s => this.enrichSlot(normalizeSlot(s))));
  }

  async getTimeSlotsByDateRange(startDate: string, endDate: string): Promise<TimeSlotWithBookings[]> {
    const slots = await db.select().from(timeSlots)
      .where(and(gte(timeSlots.date, startDate), lte(timeSlots.date, endDate)))
      .orderBy(asc(timeSlots.date), asc(timeSlots.time));
    return Promise.all(slots.map(s => this.enrichSlot(normalizeSlot(s))));
  }

  private async enrichSlot(slot: TimeSlot): Promise<TimeSlotWithBookings> {
    const slotBookings = await this.getBookingsByTimeSlot(slot.id);
    const active = slotBookings.filter(b => b.status !== "cancelled");
    const confirmed = slotBookings.filter(b => b.status === "confirmed");
    return { ...slot, bookings: active, availableSpots: Math.max(0, slot.maxCapacity - confirmed.length) };
  }

  async createTimeSlot(insertTS: InsertTimeSlot): Promise<TimeSlot> {
    const settings = await this.loadSettings();
    const rows = await db.insert(timeSlots).values({
      date: insertTS.date,
      time: insertTS.time,
      maxCapacity: insertTS.maxCapacity || resolveCapacity(settings.weeklyTemplate, settings.defaultCapacity, insertTS.date),
      isManualCapacity: insertTS.isManualCapacity ?? false,
      isBlocked: insertTS.isBlocked ?? false,
      blockReason: insertTS.blockReason ?? null,
    }).returning();
    return normalizeSlot(rows[0]);
  }

  async updateTimeSlot(id: string, updates: Partial<TimeSlot>): Promise<TimeSlot> {
    const rows = await db.update(timeSlots).set(updates).where(eq(timeSlots.id, id)).returning();
    if (!rows[0]) throw new Error("Временной слот не найден");
    return normalizeSlot(rows[0]);
  }

  async generateTimeSlots(date: string): Promise<TimeSlot[]> {
    const settings = await this.loadSettings();
    await this.generateTimeSlotsForDate(date, settings);
    const rows = await db.select().from(timeSlots).where(eq(timeSlots.date, date));
    return rows.map(normalizeSlot);
  }

  private async findSlotsAtHour(date: string, hour: number): Promise<TimeSlot[]> {
    const rows = await db.select().from(timeSlots).where(eq(timeSlots.date, date));
    return rows.filter(s => slotHourFromTime(s.time) === hour).map(normalizeSlot);
  }

  /** Merge duplicate slots for the same date/hour (keeps the one with bookings). */
  private async dedupeTimeSlotsForDate(date: string): Promise<void> {
    const rows = await db.select().from(timeSlots).where(eq(timeSlots.date, date));
    const byHour = new Map<number, TimeSlot[]>();
    for (const raw of rows) {
      const s = normalizeSlot(raw);
      const hour = slotHourFromTime(s.time);
      const list = byHour.get(hour) ?? [];
      list.push(s);
      byHour.set(hour, list);
    }

    for (const group of Array.from(byHour.values())) {
      if (group.length <= 1) continue;

      const scored = await Promise.all(group.map(async (slot: TimeSlot) => {
        const confirmed = await db.select().from(bookings).where(
          and(eq(bookings.timeSlotId, slot.id), eq(bookings.status, "confirmed")),
        );
        const active = await db.select().from(bookings).where(
          and(eq(bookings.timeSlotId, slot.id), ne(bookings.status, "cancelled")),
        );
        return { slot, confirmed: confirmed.length, active: active.length };
      }));

      scored.sort((a, b) => {
        if (b.confirmed !== a.confirmed) return b.confirmed - a.confirmed;
        if (b.active !== a.active) return b.active - a.active;
        if (a.slot.isBlocked !== b.slot.isBlocked) return a.slot.isBlocked ? 1 : -1;
        const aCreated = a.slot.createdAt?.getTime() ?? 0;
        const bCreated = b.slot.createdAt?.getTime() ?? 0;
        return aCreated - bCreated;
      });

      const keeper = scored[0].slot;
      for (const { slot: dup } of scored.slice(1)) {
        await this.mergeDuplicateSlotInto(keeper.id, dup.id);
      }
    }
  }

  private async mergeDuplicateSlotInto(keeperId: string, dupId: string): Promise<void> {
    const keeperRows = await db.select().from(timeSlots).where(eq(timeSlots.id, keeperId));
    const keeper = keeperRows[0];
    if (!keeper) return;

    const dupBookings = await db.select().from(bookings).where(eq(bookings.timeSlotId, dupId));
    for (const b of dupBookings) {
      if (b.status === "cancelled") continue;
      await db.update(bookings).set({ timeSlotId: keeperId }).where(eq(bookings.id, b.id));
    }

    const dupBookingIds = dupBookings.map(b => b.id);
    if (dupBookingIds.length > 0) {
      await db.update(notifications).set({ relatedBookingId: null }).where(inArray(notifications.relatedBookingId, dupBookingIds));
      await db.delete(bookings).where(eq(bookings.timeSlotId, dupId));
    }

    const dupRows = await db.select().from(timeSlots).where(eq(timeSlots.id, dupId));
    const dup = dupRows[0];
    if (dup) {
      const confirmedOnKeeper = (await db.select().from(bookings).where(
        and(eq(bookings.timeSlotId, keeperId), eq(bookings.status, "confirmed")),
      )).length;
      const mergedCapacity = Math.max(keeper.maxCapacity, dup.maxCapacity, confirmedOnKeeper);
      await db.update(timeSlots).set({
        maxCapacity: mergedCapacity,
        isManualCapacity: keeper.isManualCapacity || dup.isManualCapacity,
      }).where(eq(timeSlots.id, keeperId));
    }

    await db.delete(timeSlots).where(eq(timeSlots.id, dupId));
  }

  private async generateTimeSlotsForDate(date: string, settings: TrainerSettings): Promise<void> {
    const holidayRows = await db.select().from(holidays).where(eq(holidays.date, date));
    const isHoliday = holidayRows.length > 0;
    const capacity = resolveCapacity(settings.weeklyTemplate, settings.defaultCapacity, date);
    for (let hour = settings.dayStartHour; hour < settings.dayEndHour; hour++) {
      const existing = await this.findSlotsAtHour(date, hour);
      if (existing.length > 0) continue;
      const timeStr = `${hour.toString().padStart(2, "0")}:00`;
      const working = isWorkingHour(settings.weeklyTemplate, date, hour);
      let blockReason: string | null = null;
      if (isHoliday) blockReason = "holiday";
      else if (!working) blockReason = "template";
      await db.insert(timeSlots).values({
        date,
        time: timeStr,
        maxCapacity: capacity,
        isManualCapacity: false,
        isBlocked: blockReason !== null,
        blockReason,
      });
    }
  }

  private async ensureSlot(date: string, hour: number, settings: TrainerSettings): Promise<TimeSlot> {
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    let existing = await this.findSlotsAtHour(date, hour);
    if (existing.length > 1) {
      await this.dedupeTimeSlotsForDate(date);
      existing = await this.findSlotsAtHour(date, hour);
    }
    if (existing.length > 0) return existing[0];
    const holidayRows = await db.select().from(holidays).where(eq(holidays.date, date));
    const isHoliday = holidayRows.length > 0;
    const working = isWorkingHour(settings.weeklyTemplate, date, hour);
    let blockReason: string | null = null;
    if (isHoliday) blockReason = "holiday";
    else if (!working) blockReason = "template";
    const rows = await db.insert(timeSlots).values({
      date,
      time: timeStr,
      maxCapacity: resolveCapacity(settings.weeklyTemplate, settings.defaultCapacity, date),
      isManualCapacity: false,
      isBlocked: blockReason !== null,
      blockReason,
    }).returning();
    return normalizeSlot(rows[0]);
  }

  // ======================== BOOKINGS ========================

  async getBooking(id: string): Promise<BookingWithDetails | undefined> {
    const rows = await db.select().from(bookings)
      .innerJoin(users, eq(bookings.studentId, users.id))
      .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .where(eq(bookings.id, id));
    if (!rows[0]) return undefined;
    const { bookings: b, users: u, time_slots: ts } = rows[0];
    return { ...b, student: bookingStudentFromUser(u), timeSlot: normalizeSlot(ts) };
  }

  async getRawBooking(id: string): Promise<Booking | undefined> {
    const rows = await db.select().from(bookings).where(eq(bookings.id, id));
    return rows[0];
  }

  async getBookingsByStudent(studentId: string): Promise<BookingWithDetails[]> {
    const rows = await db.select().from(bookings)
      .innerJoin(users, eq(bookings.studentId, users.id))
      .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .where(eq(bookings.studentId, studentId));
    return rows.map(r => ({
      ...r.bookings,
      student: bookingStudentFromUser(r.users),
      timeSlot: normalizeSlot(r.time_slots),
    }));
  }

  async getBookingsByTimeSlot(timeSlotId: string): Promise<BookingWithDetails[]> {
    const rows = await db.select().from(bookings)
      .innerJoin(users, eq(bookings.studentId, users.id))
      .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .where(eq(bookings.timeSlotId, timeSlotId));
    return rows.map(r => ({
      ...r.bookings,
      student: bookingStudentFromUser(r.users),
      timeSlot: normalizeSlot(r.time_slots),
    }));
  }

  async listActiveBookings(): Promise<Booking[]> {
    return db.select().from(bookings).where(ne(bookings.status, "cancelled"));
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const status = insertBooking.status || "pending";
    const rows = await db.insert(bookings).values({
      studentId: insertBooking.studentId,
      timeSlotId: insertBooking.timeSlotId,
      status,
      bookedBy: insertBooking.bookedBy,
      notes: insertBooking.notes ?? null,
      recurringBookingId: insertBooking.recurringBookingId ?? null,
      attendanceStatus: null,
      attendanceNote: null,
      attendanceMarkedAt: null,
      consumedTrainerPaymentId: null,
      confirmedAt: status === "confirmed" ? new Date() : null,
      cancelledAt: null,
    }).returning();
    return rows[0];
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking> {
    const rows = await db.update(bookings).set(updates).where(eq(bookings.id, id)).returning();
    if (!rows[0]) throw new Error("Запись не найдена");
    return rows[0];
  }

  async confirmBooking(id: string): Promise<Booking> {
    return this.updateBooking(id, { status: "confirmed", confirmedAt: new Date() });
  }

  async cancelBooking(id: string): Promise<Booking> {
    const booking = await this.getRawBooking(id);
    if (!booking) throw new Error("Запись не найдена");

    if (booking.recurringBookingId) {
      const slot = await this.getTimeSlotById(booking.timeSlotId);
      if (slot) {
        const dateStr =
          typeof slot.date === "object" ? localDateStr(slot.date as Date) : String(slot.date);
        await this.addRecurringBookingException(booking.recurringBookingId, dateStr);
      }
    }

    if (booking.consumedTrainerPaymentId) {
      await this.refundTrainerSession(booking.consumedTrainerPaymentId);
    }
    return this.updateBooking(id, { status: "cancelled", cancelledAt: new Date(), consumedTrainerPaymentId: null });
  }

  async rescheduleBooking(bookingId: string, newTimeSlotId: string, byRole: "trainer" | "student"): Promise<Booking> {
    const booking = await this.getRawBooking(bookingId);
    if (!booking) throw new Error("Запись не найдена");
    if (booking.status === "cancelled") throw new Error("Нельзя перенести отменённую запись");

    const newSlot = await this.getTimeSlotById(newTimeSlotId);
    if (!newSlot) throw new Error("Слот не найден");
    if (newSlot.isBlocked) throw new Error("Выбранный слот заблокирован");

    const slotStartMs = new Date(`${newSlot.date}T${newSlot.time.slice(0, 5)}:00+03:00`).getTime();
    if (slotStartMs <= Date.now()) throw new Error("Нельзя перенести на прошедшее время");

    const occupiedRows = await db.select().from(bookings).where(
      and(ne(bookings.id, bookingId), eq(bookings.timeSlotId, newTimeSlotId), ne(bookings.status, "cancelled"))
    );
    if (occupiedRows.length >= newSlot.maxCapacity) throw new Error("В выбранном слоте нет свободных мест");

    const existingInNew = await db.select().from(bookings).where(
      and(ne(bookings.id, bookingId), eq(bookings.studentId, booking.studentId), eq(bookings.timeSlotId, newTimeSlotId), ne(bookings.status, "cancelled"))
    );
    if (existingInNew.length > 0) throw new Error("У ученика уже есть запись на этот час");

    const newStatus = byRole === "student" && booking.status === "confirmed" ? "pending" : booking.status;
    const newConfirmedAt = newStatus === "pending" ? null : booking.confirmedAt;

    if (booking.recurringBookingId) {
      const oldSlot = await this.getTimeSlotById(booking.timeSlotId);
      if (oldSlot) {
        const dateStr =
          typeof oldSlot.date === "object" ? localDateStr(oldSlot.date as Date) : String(oldSlot.date);
        await this.addRecurringBookingException(booking.recurringBookingId, dateStr);
      }
    }

    return this.updateBooking(bookingId, {
      timeSlotId: newTimeSlotId,
      status: newStatus as Booking["status"],
      confirmedAt: newConfirmedAt,
      recurringBookingId: booking.recurringBookingId ? null : booking.recurringBookingId,
    });
  }

  async markAttendance(bookingId: string, status: AttendanceStatus | null, note: string | null): Promise<Booking> {
    const booking = await this.getRawBooking(bookingId);
    if (!booking) throw new Error("Запись не найдена");

    const wasConsuming = booking.attendanceStatus === "attended" || booking.attendanceStatus === "late";
    const willConsume = status === "attended" || status === "late";
    let consumedId: string | null = booking.consumedTrainerPaymentId ?? null;

    if (wasConsuming && !willConsume && consumedId) {
      await this.refundTrainerSession(consumedId);
      consumedId = null;
    }

    if (willConsume && !consumedId) {
      const slot = await this.getTimeSlotById(booking.timeSlotId);
      if (slot) {
        const sub = await this.findActiveTrainerSubscriptionFor(booking.studentId, slot.date);
        if (sub) {
          consumedId = sub.id;
          await this.consumeTrainerSession(sub.id);
        }
      }
    }

    return this.updateBooking(bookingId, {
      attendanceStatus: status,
      attendanceNote: status ? (note ?? null) : null,
      attendanceMarkedAt: status ? new Date() : null,
      consumedTrainerPaymentId: consumedId,
    });
  }

  async getStudentAttendanceStats(studentId: string): Promise<AttendanceStats> {
    const stats: AttendanceStats = { total: 0, attended: 0, late: 0, excused: 0, noShow: 0, pending: 0 };
    const studentBookings = await db.select().from(bookings).where(eq(bookings.studentId, studentId));
    const nowMs = Date.now();
    for (const booking of studentBookings) {
      if (booking.attendanceStatus) {
        stats.total++;
        if (booking.attendanceStatus === "attended") stats.attended++;
        else if (booking.attendanceStatus === "late") stats.late++;
        else if (booking.attendanceStatus === "excused") stats.excused++;
        else if (booking.attendanceStatus === "no_show") stats.noShow++;
        continue;
      }
      if (booking.status === "confirmed") {
        const slot = await this.getTimeSlotById(booking.timeSlotId);
        if (!slot) continue;
        const slotMs = new Date(`${slot.date}T${slot.time.slice(0, 5)}:00+03:00`).getTime();
        if (!isNaN(slotMs) && slotMs + 60 * 60 * 1000 < nowMs) {
          stats.pending++;
          stats.total++;
        }
      }
    }
    return stats;
  }

  async setStudentSickLeave(studentId: string, sickUntil: string | null, sickNote: string | null, startDate?: string): Promise<{ user: User; cancelledCount: number }> {
    const user = await this.getUser(studentId);
    if (!user) throw new Error("Пользователь не найден");
    if (user.role !== "student") throw new Error("Только ученики могут уходить на больничный");

    const updatedUser = await this.updateUser(studentId, { sickUntil, sickNote: sickUntil ? (sickNote ?? null) : null });

    if (sickUntil) {
      const fromStr = startDate || localDateStr(new Date());
      const existing = await db.select().from(sickPeriods).where(
        and(eq(sickPeriods.studentId, studentId), eq(sickPeriods.startDate, fromStr))
      );
      if (existing.length > 0) {
        await db.update(sickPeriods).set({ endDate: sickUntil }).where(eq(sickPeriods.id, existing[0].id));
      } else {
        await db.insert(sickPeriods).values({ studentId, startDate: fromStr, endDate: sickUntil });
      }
    }

    let cancelledCount = 0;
    if (sickUntil) {
      const fromStr = startDate || localDateStr(new Date());
      const studentBookings = await db.select().from(bookings)
        .innerJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
        .where(and(eq(bookings.studentId, studentId), ne(bookings.status, "cancelled")));
      for (const row of studentBookings) {
        const slotDate = typeof row.time_slots.date === 'object' ? localDateStr(row.time_slots.date as any) : String(row.time_slots.date);
        if (slotDate < fromStr || slotDate > sickUntil) continue;
        if (row.bookings.consumedTrainerPaymentId) {
          await this.refundTrainerSession(row.bookings.consumedTrainerPaymentId);
        }
        await db.update(bookings).set({
          status: "cancelled",
          cancelledAt: new Date(),
          attendanceStatus: "excused",
          attendanceNote: sickNote ? `Болезнь: ${sickNote}` : "Болезнь",
          attendanceMarkedAt: new Date(),
          consumedTrainerPaymentId: null,
        }).where(eq(bookings.id, row.bookings.id));
        cancelledCount++;
      }
    }
    return { user: updatedUser, cancelledCount };
  }

  // ======================== NOTIFICATIONS ========================

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const rows = await db.select().from(notifications).where(eq(notifications.id, id));
    return rows[0];
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const rows = await db.insert(notifications).values({
      userId: insertNotification.userId,
      type: insertNotification.type,
      title: insertNotification.title,
      message: insertNotification.message,
      isRead: false,
      relatedBookingId: insertNotification.relatedBookingId ?? null,
      relatedUserId: (insertNotification as any).relatedUserId ?? null,
    }).returning();
    return rows[0];
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const rows = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    if (!rows[0]) throw new Error("Notification not found");
    return rows[0];
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    const result = await db.update(notifications).set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return (result as any).rowCount ?? 0;
  }

  async deleteReadNotifications(userId: string): Promise<number> {
    const result = await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, true)));
    return (result as any).rowCount ?? 0;
  }

  async markBookingNotificationsAsRead(bookingId: string): Promise<number> {
    const result = await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.relatedBookingId, bookingId), eq(notifications.isRead, false)));
    return (result as any).rowCount ?? 0;
  }

  // ======================== ANALYTICS ========================

  async getStudentsList(includeInactive = false): Promise<User[]> {
    const roleFilter = or(eq(users.role, "student"), and(eq(users.role, "parent"), eq(users.isAlsoStudent, true)));
    return includeInactive
      ? await db.select().from(users).where(roleFilter).orderBy(asc(users.createdAt))
      : await db.select().from(users).where(and(roleFilter, eq(users.isActive, true))).orderBy(asc(users.createdAt));
  }

  async setUserActiveStatus(id: string, isActive: boolean, resetCv = false): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("Пользователь не найден");
    if (user.role === "trainer") throw new Error("Нельзя изменить статус тренера");
    const today = localDateStr(new Date());
    return this.updateUser(id, { isActive, cvRestartDate: resetCv && isActive ? today : user.cvRestartDate });
  }

  async approveStudent(id: string): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("Пользователь не найден");
    return this.updateUser(id, { isPendingApproval: false });
  }

  async markWelcomeShown(userId: string): Promise<User> {
    return this.updateUser(userId, { welcomeShown: true });
  }

  async getTrainer(): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.role, "trainer")).limit(1);
    return rows[0];
  }

  async getScheduleForDate(date: string): Promise<DaySchedule> {
    const settings = await this.loadSettings();
    const existing = await db.select().from(timeSlots).where(eq(timeSlots.date, date)).limit(1);
    if (existing.length === 0) {
      await this.generateTimeSlotsForDate(date, settings);
    }
    await this.dedupeTimeSlotsForDate(date);
    const slotRows = await db.select().from(timeSlots).where(eq(timeSlots.date, date)).orderBy(asc(timeSlots.time));
    const enriched = await Promise.all(slotRows.map(s => this.enrichSlot(normalizeSlot(s))));
    return { date, timeSlots: enriched };
  }

  async getScheduleForWeek(startDate: string): Promise<DaySchedule[]> {
    const schedules: DaySchedule[] = [];
    const start = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      schedules.push(await this.getScheduleForDate(localDateStr(d)));
    }
    return schedules;
  }

  async getScheduleForMonth(year: number, month: number): Promise<DaySchedule[]> {
    const schedules: DaySchedule[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      schedules.push(await this.getScheduleForDate(localDateStr(d)));
    }
    return schedules;
  }

  // ======================== RECURRING BOOKINGS ========================

  async getRecurringBookingsByStudent(studentId: string): Promise<RecurringBooking[]> {
    return db.select().from(recurringBookings).where(eq(recurringBookings.studentId, studentId)).orderBy(asc(recurringBookings.createdAt));
  }

  async getRecurringBooking(id: string): Promise<RecurringBooking | undefined> {
    const rows = await db.select().from(recurringBookings).where(eq(recurringBookings.id, id));
    return rows[0];
  }

  async createRecurringBooking(rule: InsertRecurringBooking): Promise<RecurringBooking> {
    const rows = await db.insert(recurringBookings).values({
      studentId: rule.studentId,
      weekdays: rule.weekdays,
      hour: rule.hour,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
      createdBy: rule.createdBy,
    }).returning();
    return rows[0];
  }

  async deleteRecurringBooking(id: string): Promise<{ cancelledCount: number }> {
    const rule = await this.getRecurringBooking(id);
    if (!rule) throw new Error("Recurring booking not found");
    const today = localDateStr(new Date());

    const linked = await db
      .select({ booking: bookings, slot: timeSlots })
      .from(bookings)
      .leftJoin(timeSlots, eq(bookings.timeSlotId, timeSlots.id))
      .where(eq(bookings.recurringBookingId, id));

    let cancelled = 0;
    for (const { booking, slot } of linked) {
      const slotDate = slot
        ? typeof slot.date === "object"
          ? localDateStr(slot.date as Date)
          : String(slot.date)
        : "1970-01-01";
      if (booking.status !== "cancelled" && slotDate >= today) {
        await this.cancelBooking(booking.id);
        cancelled++;
      }
    }

    await db.update(bookings).set({ recurringBookingId: null }).where(eq(bookings.recurringBookingId, id));
    await db.execute(
      drizzleSql`UPDATE bookings SET recurring_booking_id = NULL WHERE recurring_booking_id = ${id}`,
    );
    await db.delete(recurringBookings).where(eq(recurringBookings.id, id));
    return { cancelledCount: cancelled };
  }

  async getRecurringBookingExceptions(recurringBookingId: string): Promise<string[]> {
    await this.ensureRecurringExceptionsSchema();
    const rows = await db
      .select({ date: recurringBookingExceptions.date })
      .from(recurringBookingExceptions)
      .where(eq(recurringBookingExceptions.recurringBookingId, recurringBookingId))
      .orderBy(asc(recurringBookingExceptions.date));
    return rows.map((r) => r.date);
  }

  async addRecurringBookingException(recurringBookingId: string, date: string): Promise<void> {
    await this.ensureRecurringExceptionsSchema();
    const existing = await db
      .select({ id: recurringBookingExceptions.id })
      .from(recurringBookingExceptions)
      .where(
        and(
          eq(recurringBookingExceptions.recurringBookingId, recurringBookingId),
          eq(recurringBookingExceptions.date, date),
        ),
      );
    if (existing.length > 0) return;
    await db.insert(recurringBookingExceptions).values({ recurringBookingId, date });
  }

  async removeRecurringBookingException(recurringBookingId: string, date: string): Promise<void> {
    await this.ensureRecurringExceptionsSchema();
    await db
      .delete(recurringBookingExceptions)
      .where(
        and(
          eq(recurringBookingExceptions.recurringBookingId, recurringBookingId),
          eq(recurringBookingExceptions.date, date),
        ),
      );
  }

  async materializeRecurringBookings(untilDate: string): Promise<{ created: number; skipped: number }> {
    await this.ensureRecurringExceptionsSchema();
    const settings = await this.loadSettings();
    const rules = await db.select().from(recurringBookings);
    let created = 0;
    let skipped = 0;
    const today = localDateStr(new Date());
    for (const rule of rules) {
      const start = rule.startDate > today ? rule.startDate : today;
      const end = rule.endDate && rule.endDate < untilDate ? rule.endDate : untilDate;
      if (start > end) continue;
      const dates = eachDateInRange(start, end);
      for (const d of dates) {
        const wd = isoWeekday(d);
        if (!rule.weekdays.includes(wd)) continue;
        const dateStr = localDateStr(d);
        const excepted = await db
          .select({ id: recurringBookingExceptions.id })
          .from(recurringBookingExceptions)
          .where(
            and(
              eq(recurringBookingExceptions.recurringBookingId, rule.id),
              eq(recurringBookingExceptions.date, dateStr),
            ),
          );
        if (excepted.length > 0) { skipped++; continue; }
        const slot = await this.ensureSlot(dateStr, rule.hour, settings);
        if (slot.isBlocked) { skipped++; continue; }
        // Already materialized for this rule on this slot (incl. cancelled)?
        const anyForRule = await db.select().from(bookings).where(
          and(eq(bookings.recurringBookingId, rule.id), eq(bookings.timeSlotId, slot.id)),
        );
        if (anyForRule.length > 0) continue;
        // Student already booked that day?
        const daySlots = await db.select().from(timeSlots).where(eq(timeSlots.date, dateStr));
        const daySlotIds = daySlots.map(s => s.id);
        if (daySlotIds.length > 0) {
          const studentBookedThatDay = await db.select().from(bookings).where(
            and(eq(bookings.studentId, rule.studentId), ne(bookings.status, "cancelled"), inArray(bookings.timeSlotId, daySlotIds))
          );
          if (studentBookedThatDay.length > 0) { skipped++; continue; }
        }
        // Slot full?
        const confirmed = await db.select().from(bookings).where(
          and(eq(bookings.timeSlotId, slot.id), eq(bookings.status, "confirmed"))
        );
        if (confirmed.length >= slot.maxCapacity) { skipped++; continue; }
        await db.insert(bookings).values({
          studentId: rule.studentId,
          timeSlotId: slot.id,
          status: "confirmed",
          bookedBy: rule.createdBy,
          notes: "Постоянная запись",
          recurringBookingId: rule.id,
          confirmedAt: new Date(),
        });
        created++;
      }
    }
    return { created, skipped };
  }

  // ======================== SLOT BLOCKING ========================

  async blockSlot(timeSlotId: string, blocked: boolean): Promise<{ slot: TimeSlot; cancelledBookings: Booking[] }> {
    const slot = await this.getTimeSlotById(timeSlotId);
    if (!slot) throw new Error("Временной слот не найден");
    const updated = await this.updateTimeSlot(timeSlotId, { isBlocked: blocked, blockReason: blocked ? "manual" : null });
    const cancelled: Booking[] = [];
    if (blocked) {
      const activeBookings = await db.select().from(bookings).where(
        and(eq(bookings.timeSlotId, timeSlotId), ne(bookings.status, "cancelled"))
      );
      for (const b of activeBookings) {
        const c = await this.updateBooking(b.id, { status: "cancelled", cancelledAt: new Date() });
        cancelled.push(c);
      }
    }
    return { slot: updated, cancelledBookings: cancelled };
  }

  private async cancelBookingsOnSlot(timeSlotId: string): Promise<Booking[]> {
    const activeBookings = await db.select().from(bookings).where(
      and(eq(bookings.timeSlotId, timeSlotId), ne(bookings.status, "cancelled"))
    );
    const cancelled: Booking[] = [];
    for (const b of activeBookings) {
      const c = await this.updateBooking(b.id, { status: "cancelled", cancelledAt: new Date() });
      cancelled.push(c);
    }
    return cancelled;
  }

  /** Remove slot outside working hours; cancels active bookings or deletes cancelled history first. */
  private async removeOutOfRangeSlot(slot: TimeSlot): Promise<Booking[]> {
    if (slot.blockReason === "manual") return [];

    const hasActive = await db.select().from(bookings).where(
      and(eq(bookings.timeSlotId, slot.id), ne(bookings.status, "cancelled"))
    );
    if (hasActive.length > 0) {
      if (slot.isBlocked) return [];
      const cancelled = await this.cancelBookingsOnSlot(slot.id);
      await db.update(timeSlots).set({ isBlocked: true, blockReason: "template" }).where(eq(timeSlots.id, slot.id));
      return cancelled;
    }

    const slotBookingRows = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.timeSlotId, slot.id));
    const slotBookingIds = slotBookingRows.map(r => r.id);
    if (slotBookingIds.length > 0) {
      await db.update(notifications).set({ relatedBookingId: null }).where(inArray(notifications.relatedBookingId, slotBookingIds));
      await db.delete(bookings).where(eq(bookings.timeSlotId, slot.id));
    }
    await db.delete(timeSlots).where(eq(timeSlots.id, slot.id));
    return [];
  }

  async blockDate(date: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }> {
    const settings = await this.loadSettings();
    for (let h = settings.dayStartHour; h < settings.dayEndHour; h++) {
      await this.ensureSlot(date, h, settings);
    }
    const daySlots = await db.select().from(timeSlots).where(eq(timeSlots.date, date));
    const allSlots: TimeSlot[] = [];
    const allCancelled: Booking[] = [];
    for (const s of daySlots) {
      const r = await this.blockSlot(s.id, blocked);
      allSlots.push(r.slot);
      allCancelled.push(...r.cancelledBookings);
    }
    return { slots: allSlots, cancelledBookings: allCancelled };
  }

  async blockDateRange(startDate: string, endDate: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }> {
    await this.ensureBlockedPeriodsSchema();
    const dates = eachDateInRange(startDate, endDate).map(localDateStr);
    const allSlots: TimeSlot[] = [];
    const allCancelled: Booking[] = [];
    for (const d of dates) {
      const r = await this.blockDate(d, blocked);
      allSlots.push(...r.slots);
      allCancelled.push(...r.cancelledBookings);
    }
    if (blocked) {
      await db.insert(blockedPeriods).values({ startDate, endDate });
    } else {
      await db.delete(blockedPeriods).where(
        and(eq(blockedPeriods.startDate, startDate), eq(blockedPeriods.endDate, endDate)),
      );
    }
    return { slots: allSlots, cancelledBookings: allCancelled };
  }

  async getBlockedPeriods(): Promise<BlockedPeriod[]> {
    await this.ensureBlockedPeriodsSchema();
    const today = localDateStr(new Date());
    const rows = await db
      .select()
      .from(blockedPeriods)
      .where(gte(blockedPeriods.endDate, today))
      .orderBy(asc(blockedPeriods.startDate), asc(blockedPeriods.createdAt));
    return rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      daysCount: eachDateInRange(r.startDate, r.endDate).length,
    }));
  }

  // ======================== TRAINER SETTINGS ========================

  async updateTrainerSettings(updates: TrainerSettingsUpdate): Promise<{ settings: TrainerSettings; cancelledCount: number }> {
    const current = await this.loadSettings();
    const next: TrainerSettings = {
      ...current,
      dayStartHour: updates.dayStartHour ?? current.dayStartHour,
      dayEndHour: updates.dayEndHour ?? current.dayEndHour,
      weeklyTemplate: updates.weeklyTemplate
        ? { ...current.weeklyTemplate, ...updates.weeklyTemplate }
        : current.weeklyTemplate,
      cancelDeadlineHours: updates.cancelDeadlineHours ?? current.cancelDeadlineHours,
      bookingDeadlineHours: updates.bookingDeadlineHours ?? current.bookingDeadlineHours,
      defaultCapacity: updates.defaultCapacity ?? current.defaultCapacity,
      reminderMinutes: updates.reminderMinutes !== undefined ? updates.reminderMinutes : current.reminderMinutes,
      welcomeMessage: updates.welcomeMessage !== undefined ? updates.welcomeMessage : current.welcomeMessage,
      updatedAt: new Date(),
    };
    if (next.dayEndHour <= next.dayStartHour) throw new Error("Окончание рабочего дня должно быть позже начала");

    await db.update(trainerSettings).set({
      dayStartHour: next.dayStartHour,
      dayEndHour: next.dayEndHour,
      weeklyTemplate: JSON.stringify(next.weeklyTemplate),
      cancelDeadlineHours: next.cancelDeadlineHours,
      bookingDeadlineHours: next.bookingDeadlineHours,
      defaultCapacity: next.defaultCapacity,
      reminderMinutes: next.reminderMinutes,
      welcomeMessage: next.welcomeMessage,
      updatedAt: next.updatedAt!,
    }).where(eq(trainerSettings.id, current.id));
    this.settingsCache = next;

    const today = localDateStr(new Date());
    const cancelled: Booking[] = [];
    const futureDates = await db.selectDistinct({ date: timeSlots.date }).from(timeSlots).where(gte(timeSlots.date, today));

    for (const { date } of futureDates) {
      const dateStr = typeof date === 'object' ? localDateStr(date as any) : String(date);
      const slotsForDay = await db.select().from(timeSlots).where(eq(timeSlots.date, dateStr));

      for (const s of slotsForDay) {
        const hour = parseInt(normalizeTime(s.time).slice(0, 2), 10);
        const inRange = hour >= next.dayStartHour && hour < next.dayEndHour;
        if (!inRange) {
          const c = await this.removeOutOfRangeSlot(s);
          cancelled.push(...c);
        }
      }

      for (let h = next.dayStartHour; h < next.dayEndHour; h++) {
        await this.ensureSlot(dateStr, h, next);
      }

      const isHolidayDay = (await db.select().from(holidays).where(eq(holidays.date, dateStr))).length > 0;
      const refreshed = await db.select().from(timeSlots).where(eq(timeSlots.date, dateStr));
      for (const s of refreshed) {
        if (s.blockReason === "manual" || s.blockReason === "holiday") continue;
        const hour = parseInt(normalizeTime(s.time).slice(0, 2), 10);
        const working = !isHolidayDay && isWorkingHour(next.weeklyTemplate, dateStr, hour);
        if (working) {
          if (s.isBlocked) await db.update(timeSlots).set({ isBlocked: false, blockReason: null }).where(eq(timeSlots.id, s.id));
        } else {
          if (!s.isBlocked) {
            const c = await this.cancelBookingsOnSlot(s.id);
            cancelled.push(...c);
          }
          await db.update(timeSlots).set({ isBlocked: true, blockReason: isHolidayDay ? "holiday" : "template" }).where(eq(timeSlots.id, s.id));
        }
      }

      const newCapacity = resolveCapacity(next.weeklyTemplate, next.defaultCapacity, dateStr);
      const finalSlots = await db.select().from(timeSlots).where(eq(timeSlots.date, dateStr));
      for (const s of finalSlots) {
        if (s.isManualCapacity) continue;
        const confirmedCount = (await db.select().from(bookings).where(
          and(eq(bookings.timeSlotId, s.id), eq(bookings.status, "confirmed"))
        )).length;
        const target = Math.max(newCapacity, confirmedCount);
        if (s.maxCapacity !== target) await db.update(timeSlots).set({ maxCapacity: target }).where(eq(timeSlots.id, s.id));
      }

      await this.dedupeTimeSlotsForDate(dateStr);
    }

    return { settings: next, cancelledCount: cancelled.length };
  }

  async updateSlotCapacity(slotId: string, capacity: number | null): Promise<TimeSlot> {
    const slot = await this.getTimeSlotById(slotId);
    if (!slot) throw new Error("Слот не найден");
    const settings = await this.loadSettings();
    const confirmedCount = (await db.select().from(bookings).where(
      and(eq(bookings.timeSlotId, slotId), eq(bookings.status, "confirmed"))
    )).length;
    let nextCapacity: number;
    let manual: boolean;
    if (capacity === null) {
      nextCapacity = resolveCapacity(settings.weeklyTemplate, settings.defaultCapacity, slot.date);
      manual = false;
    } else {
      nextCapacity = capacity;
      manual = true;
    }
    if (nextCapacity < confirmedCount) throw new Error(`Нельзя задать ${nextCapacity} мест: уже подтверждено записей — ${confirmedCount}`);
    return this.updateTimeSlot(slotId, { maxCapacity: nextCapacity, isManualCapacity: manual });
  }

  // ======================== HOLIDAYS ========================

  async getHolidays(): Promise<Holiday[]> {
    return db.select().from(holidays).orderBy(asc(holidays.date));
  }

  async addHoliday(date: string, name?: string | null, createdBy?: string | null): Promise<{ holiday: Holiday; cancelledCount: number }> {
    const existing = await db.select().from(holidays).where(eq(holidays.date, date));
    if (existing.length > 0) throw new Error("Этот день уже отмечен как праздничный");
    const rows = await db.insert(holidays).values({ date, name: name ?? null, createdBy: createdBy ?? null }).returning();
    const holiday = rows[0];
    const settings = await this.loadSettings();
    for (let h = settings.dayStartHour; h < settings.dayEndHour; h++) {
      await this.ensureSlot(date, h, settings);
    }
    const daySlots = await db.select().from(timeSlots).where(eq(timeSlots.date, date));
    let cancelledCount = 0;
    for (const s of daySlots) {
      if (s.blockReason === "manual") continue;
      if (!s.isBlocked) {
        const c = await this.cancelBookingsOnSlot(s.id);
        cancelledCount += c.length;
      }
      await db.update(timeSlots).set({ isBlocked: true, blockReason: "holiday" }).where(eq(timeSlots.id, s.id));
    }
    return { holiday, cancelledCount };
  }

  async removeHoliday(id: string): Promise<void> {
    const rows = await db.select().from(holidays).where(eq(holidays.id, id));
    if (!rows[0]) throw new Error("Праздник не найден");
    const h = rows[0];
    await db.delete(holidays).where(eq(holidays.id, id));
    const settings = await this.loadSettings();
    const daySlots = await db.select().from(timeSlots).where(eq(timeSlots.date, h.date));
    for (const s of daySlots) {
      if (s.blockReason !== "holiday") continue;
      const hour = parseInt(normalizeTime(s.time).slice(0, 2), 10);
      const working = isWorkingHour(settings.weeklyTemplate, h.date, hour);
      await db.update(timeSlots).set({ isBlocked: !working, blockReason: working ? null : "template" }).where(eq(timeSlots.id, s.id));
    }
  }

  // ======================== PAYMENTS — MEMBERSHIP ========================

  async getMembershipPayments(studentId: string): Promise<MembershipPayment[]> {
    const rows = await db.select().from(membershipPayments).where(eq(membershipPayments.studentId, studentId));
    return rows.sort((a, b) => {
      const ka = a.month || a.date || "";
      const kb = b.month || b.date || "";
      return kb.localeCompare(ka);
    });
  }

  async addMembershipPayment(studentId: string, input: MembershipPaymentInput, createdBy: string): Promise<MembershipPayment> {
    const user = await this.getUser(studentId);
    if (!user) throw new Error("Пользователь не найден");
    if (user.role !== "student" && !(user.role === "parent" && (user as any).isAlsoStudent)) {
      throw new Error("Абонементы доступны только ученикам");
    }

    let derivedMonth: string | null = null;
    if (input.type === "monthly_cv") {
      derivedMonth = input.paidDate.slice(0, 7);
      const nextAllowed = await this.getNextCvAllowedDate(studentId);
      if (nextAllowed) {
        const today = localDateStr(new Date());
        if (today < nextAllowed) throw new Error(`BEFORE_NEXT_ALLOWED_DATE:${nextAllowed}`);
      }
    } else {
      const dup = await db.select().from(membershipPayments).where(
        and(eq(membershipPayments.studentId, studentId), eq(membershipPayments.type, "one_time_bv"), eq(membershipPayments.date, input.date))
      );
      if (dup.length > 0) throw new Error("DUPLICATE_DATE");
    }

    const rows = await db.insert(membershipPayments).values({
      studentId,
      type: input.type,
      month: input.type === "monthly_cv" ? derivedMonth : null,
      paidDate: input.type === "monthly_cv" ? input.paidDate : null,
      date: input.type === "one_time_bv" ? input.date : null,
      note: input.note ?? null,
      createdBy,
    }).returning();
    return rows[0];
  }

  async deleteMembershipPayment(id: string): Promise<void> {
    await db.delete(membershipPayments).where(eq(membershipPayments.id, id));
  }

  async getNextCvAllowedDate(studentId: string): Promise<string | null> {
    const student = await this.getUser(studentId);
    const cvRestartDate = student?.cvRestartDate ?? null;
    let query = db.select().from(membershipPayments).where(
      and(eq(membershipPayments.studentId, studentId), eq(membershipPayments.type, "monthly_cv"))
    );
    const cvPayments = (await query).filter(p => p.paidDate && (!cvRestartDate || p.paidDate >= cvRestartDate))
      .sort((a, b) => (b.paidDate! > a.paidDate! ? 1 : -1));
    const last = cvPayments[0];
    if (!last?.paidDate) return null;

    const sickDays = await this.getSickDaysAfter(studentId, last.paidDate);
    return nextCvAllowedDateStr(last.paidDate, sickDays.size);
  }

  private async getSickDaysAfter(studentId: string, afterDate: string): Promise<Set<string>> {
    try {
      const periods = await db.select().from(sickPeriods).where(
        and(eq(sickPeriods.studentId, studentId), gte(sickPeriods.endDate, afterDate))
      );
      const sickDays = new Set<string>();
      const dayAfterPaid = addDaysToDateStr(afterDate, 1);
      for (const period of periods) {
        const startStr = period.startDate > dayAfterPaid ? period.startDate : dayAfterPaid;
        for (const day of eachDateStrInRange(startStr, period.endDate)) {
          sickDays.add(day);
        }
      }
      return sickDays;
    } catch (err) {
      console.error(`[storage] getSickDaysAfter(${studentId}):`, err);
      return new Set();
    }
  }

  // ======================== PAYMENTS — TRAINER ========================

  private async countUsedSessions(subscriptionId: string): Promise<number> {
    const rows = await db.select().from(bookings).where(eq(bookings.consumedTrainerPaymentId, subscriptionId));
    return rows.length;
  }

  private async findActiveTrainerSubscriptionFor(studentId: string, dateStr: string): Promise<TrainerPayment | null> {
    const candidates = await db.select().from(trainerPayments).where(
      and(eq(trainerPayments.studentId, studentId), eq(trainerPayments.status, "active"), lte(trainerPayments.startDate, dateStr))
    ).orderBy(asc(trainerPayments.startDate), asc(trainerPayments.createdAt));
    for (const p of candidates) {
      const used = await this.countUsedSessions(p.id);
      if (used < p.totalSessions) return p;
    }
    return null;
  }

  private async consumeTrainerSession(subscriptionId: string): Promise<void> {
    const rows = await db.select().from(trainerPayments).where(eq(trainerPayments.id, subscriptionId));
    const sub = rows[0];
    if (!sub) return;
    const used = await this.countUsedSessions(subscriptionId);
    if (used >= sub.totalSessions && sub.status === "active") {
      await db.update(trainerPayments).set({ status: "completed", completedAt: new Date() }).where(eq(trainerPayments.id, subscriptionId));
    }
  }

  private async refundTrainerSession(subscriptionId: string): Promise<void> {
    const rows = await db.select().from(trainerPayments).where(eq(trainerPayments.id, subscriptionId));
    const sub = rows[0];
    if (!sub) return;
    if (sub.status === "completed") {
      await db.update(trainerPayments).set({ status: "active", completedAt: null }).where(eq(trainerPayments.id, subscriptionId));
    }
  }

  private async withUsage(p: TrainerPayment): Promise<TrainerPaymentWithUsage> {
    return { ...p, usedSessions: await this.countUsedSessions(p.id) };
  }

  async getTrainerPayments(studentId: string): Promise<TrainerPaymentWithUsage[]> {
    const rows = await db.select().from(trainerPayments).where(eq(trainerPayments.studentId, studentId)).orderBy(desc(trainerPayments.startDate));
    return Promise.all(rows.map(p => this.withUsage(p)));
  }

  async addTrainerPayment(studentId: string, input: TrainerPaymentInput, createdBy: string): Promise<TrainerPaymentWithUsage> {
    const user = await this.getUser(studentId);
    if (!user) throw new Error("Пользователь не найден");
    if (user.role !== "student" && !(user.role === "parent" && (user as any).isAlsoStudent)) {
      throw new Error("Подписки доступны только ученикам");
    }
    const rows = await db.insert(trainerPayments).values({
      studentId,
      type: input.type,
      totalSessions: input.totalSessions,
      startDate: input.startDate,
      status: "active",
      note: input.note ?? null,
      createdBy,
    }).returning();
    return this.withUsage(rows[0]);
  }

  async cancelTrainerPayment(id: string): Promise<TrainerPaymentWithUsage> {
    const rows = await db.update(trainerPayments).set({ status: "cancelled", completedAt: new Date() }).where(eq(trainerPayments.id, id)).returning();
    if (!rows[0]) throw new Error("Subscription not found");
    return this.withUsage(rows[0]);
  }

  async deleteTrainerPayment(id: string): Promise<void> {
    await db.update(bookings).set({ consumedTrainerPaymentId: null }).where(eq(bookings.consumedTrainerPaymentId, id));
    await db.delete(trainerPayments).where(eq(trainerPayments.id, id));
  }

  async getStudentPaymentStatus(studentId: string, dateStr: string): Promise<StudentPaymentStatus> {
    const student = await this.getUser(studentId);
    const cvRestartDate = student?.cvRestartDate ?? null;

    const allCvPayments = await db.select().from(membershipPayments).where(
      and(eq(membershipPayments.studentId, studentId), eq(membershipPayments.type, "monthly_cv"))
    );
    const cvPayments = allCvPayments
      .filter(p => p.paidDate && (!cvRestartDate || p.paidDate >= cvRestartDate))
      .sort((a, b) => b.paidDate!.localeCompare(a.paidDate!));

    const cvCoveringEndDate = async (paidDateStr: string): Promise<string | null> => {
      const sickDays = await this.getSickDaysAfter(studentId, paidDateStr);
      return cvValidUntilForDate(paidDateStr, dateStr, sickDays.size);
    };

    let membershipKind: "monthly_cv" | "one_time_bv" | null = null;
    let cvPaidDate: string | null = null;
    let cvValidUntil: string | null = null;
    for (const p of cvPayments) {
      const validUntil = await cvCoveringEndDate(p.paidDate!);
      if (validUntil) {
        membershipKind = "monthly_cv";
        cvPaidDate = p.paidDate!;
        cvValidUntil = validUntil;
        break;
      }
    }

    if (membershipKind === null) {
      const bvPayment = await db.select().from(membershipPayments).where(
        and(eq(membershipPayments.studentId, studentId), eq(membershipPayments.type, "one_time_bv"), eq(membershipPayments.date, dateStr))
      );
      if (bvPayment.length > 0) {
        membershipKind = "one_time_bv";
        cvPaidDate = bvPayment[0].date;
        cvValidUntil = bvPayment[0].date;
      }
    }

    const exemptMembership = student?.exemptMembership === true;
    const exemptTrainerPayment = student?.exemptTrainerPayment === true;
    const sub = exemptTrainerPayment ? null : await this.findActiveTrainerSubscriptionFor(studentId, dateStr);
    return {
      hasMembership: exemptMembership ? true : membershipKind !== null,
      membershipKind,
      cvPaidDate,
      cvValidUntil,
      hasTrainerPayment: exemptTrainerPayment ? true : sub !== null,
      activeTrainerPayment: sub ? await this.withUsage(sub) : null,
    };
  }

  // ======================== BROADCAST LOGS (in-memory) ========================

  async createBroadcastLog(log: Omit<BroadcastLog, "id" | "sentAt">): Promise<BroadcastLog> {
    const entry: BroadcastLog = { id: randomUUID(), sentAt: new Date(), ...log };
    this.broadcastLogs.set(entry.id, entry);
    return entry;
  }

  async getBroadcastLogs(): Promise<BroadcastLog[]> {
    return Array.from(this.broadcastLogs.values()).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async deleteBroadcastLog(id: string): Promise<{ deletedNotifications: number }> {
    const log = this.broadcastLogs.get(id);
    if (!log) throw new Error("Рассылка не найдена");
    const recipientSet = new Set(log.recipientIds);
    const notifRows = await db.select().from(notifications).where(eq(notifications.type, "broadcast"));
    let deletedNotifications = 0;
    for (const n of notifRows) {
      if (!recipientSet.has(n.userId)) continue;
      const sentAt = log.sentAt.getTime();
      const createdAt = n.createdAt ? new Date(n.createdAt).getTime() : 0;
      if (Math.abs(createdAt - sentAt) < 60_000) {
        await db.delete(notifications).where(eq(notifications.id, n.id));
        deletedNotifications++;
      }
    }
    this.broadcastLogs.delete(id);
    return { deletedNotifications };
  }

  private pushSubscriptions: Map<string, PushSubscriptionData> = new Map();

  async savePushSubscription(sub: PushSubscriptionData): Promise<void> {
    this.pushSubscriptions.set(sub.endpoint, sub);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    this.pushSubscriptions.delete(endpoint);
  }

  async getPushSubscriptionsByUser(userId: string): Promise<PushSubscriptionData[]> {
    return Array.from(this.pushSubscriptions.values()).filter((s) => s.userId === userId);
  }

  async getAllPushSubscriptions(): Promise<PushSubscriptionData[]> {
    return Array.from(this.pushSubscriptions.values());
  }
}
