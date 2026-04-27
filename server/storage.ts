import { 
  type User, 
  type InsertUser, 
  type TimeSlot,
  type InsertTimeSlot,
  type Booking, 
  type InsertBooking,
  type Notification,
  type InsertNotification,
  type TimeSlotWithBookings,
  type BookingWithDetails,
  type DaySchedule,
  type Document,
  type InsertDocument,
  type UserConsent,
  type StudentWithConsents,
  type RecurringBooking,
  type InsertRecurringBooking,
  type Holiday,
  type TrainerSettings,
  type TrainerSettingsUpdate,
  type WeeklyTemplate,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  verifyUser(id: string): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  // Time Slots
  getTimeSlotById(id: string): Promise<TimeSlot | undefined>;
  getTimeSlotsByDate(date: string): Promise<TimeSlotWithBookings[]>;
  getTimeSlotsByDateRange(startDate: string, endDate: string): Promise<TimeSlotWithBookings[]>;
  createTimeSlot(timeSlot: InsertTimeSlot): Promise<TimeSlot>;
  updateTimeSlot(id: string, updates: Partial<TimeSlot>): Promise<TimeSlot>;
  generateTimeSlots(date: string): Promise<TimeSlot[]>;
  
  // Bookings
  getBooking(id: string): Promise<BookingWithDetails | undefined>;
  getBookingsByStudent(studentId: string): Promise<BookingWithDetails[]>;
  getBookingsByTimeSlot(timeSlotId: string): Promise<BookingWithDetails[]>;
  listActiveBookings(): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking>;
  confirmBooking(id: string): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking>;
  
  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<number>;
  
  // Documents (consent forms managed by trainer)
  getDocuments(activeOnly?: boolean): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;

  // User consents
  getConsentsByUser(userId: string): Promise<(UserConsent & { document: Document })[]>;
  recordConsent(userId: string, documentId: string): Promise<UserConsent>;
  getStudentWithConsents(id: string): Promise<StudentWithConsents | undefined>;

  // Recurring bookings
  getRecurringBookingsByStudent(studentId: string): Promise<RecurringBooking[]>;
  getRecurringBooking(id: string): Promise<RecurringBooking | undefined>;
  createRecurringBooking(rule: InsertRecurringBooking): Promise<RecurringBooking>;
  deleteRecurringBooking(id: string): Promise<{ cancelledCount: number }>;
  materializeRecurringBookings(untilDate: string): Promise<{ created: number; skipped: number }>;

  // Slot blocking
  blockSlot(timeSlotId: string, blocked: boolean): Promise<{ slot: TimeSlot; cancelledBookings: Booking[] }>;
  blockDate(date: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }>;
  blockDateRange(startDate: string, endDate: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }>;

  // Trainer schedule settings
  getTrainerSettings(): Promise<TrainerSettings>;
  updateTrainerSettings(updates: TrainerSettingsUpdate): Promise<{ settings: TrainerSettings; cancelledCount: number }>;

  // Holidays
  getHolidays(): Promise<Holiday[]>;
  addHoliday(date: string, name?: string | null, createdBy?: string | null): Promise<{ holiday: Holiday; cancelledCount: number }>;
  removeHoliday(id: string): Promise<void>;

  // Analytics
  getStudentsList(): Promise<User[]>;
  getTrainer(): Promise<User | undefined>;
  getScheduleForDate(date: string): Promise<DaySchedule>;
  getScheduleForWeek(startDate: string): Promise<DaySchedule[]>;
  getScheduleForMonth(year: number, month: number): Promise<DaySchedule[]>;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoWeekday(date: Date): number {
  // Mon=1 .. Sun=7
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

// Returns true if a slot at this date+hour should be open (working) per the template.
function isWorkingHour(template: WeeklyTemplate, date: string, hour: number): boolean {
  const wd = isoWeekday(new Date(date + "T00:00:00"));
  const entry = template[String(wd) as "1"];
  if (!entry || !entry.enabled) return false;
  return hour >= entry.startHour && hour < entry.endHour;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private timeSlots: Map<string, TimeSlot> = new Map();
  private bookings: Map<string, Booking> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private documents: Map<string, Document> = new Map();
  private consents: Map<string, UserConsent> = new Map();
  private recurringBookings: Map<string, RecurringBooking> = new Map();
  private holidays: Map<string, Holiday> = new Map();
  private settings: TrainerSettings = {
    id: randomUUID(),
    dayStartHour: 8,
    dayEndHour: 20,
    weeklyTemplate: defaultWeeklyTemplate(8, 20),
    cancelDeadlineHours: 3,
    bookingDeadlineHours: 1,
    updatedAt: new Date(),
  };

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Create trainer user
    const trainerId = randomUUID();
    const trainer: User = {
      id: trainerId,
      phone: "79991234567",
      firstName: "Константин",
      lastName: "Владимирович",
      middleName: null,
      birthDate: null,
      trainerNotes: null,
      parentFullName: null,
      parentPhone: null,
      role: "trainer",
      isVerified: true,
      verificationCode: null,
      password: "12345",
      mustChangePassword: false,
      lastLogin: null,
      createdAt: new Date()
    };
    this.users.set(trainerId, trainer);

    // Seed default consent documents
    const seedDocs: { title: string; content: string }[] = [
      {
        title: "Правила техники безопасности в тренажёрном зале",
        content: "1. Перед тренировкой обязательно проведите разминку.\n2. Используйте оборудование строго по назначению.\n3. Не допускайте перегрузок, при недомогании немедленно прекратите занятие и сообщите тренеру.\n4. Соблюдайте чистоту, после упражнений возвращайте инвентарь на место.\n5. Запрещено заниматься в состоянии алкогольного или наркотического опьянения.\n\nЯ ознакомлен(а) с правилами техники безопасности и обязуюсь их соблюдать."
      },
      {
        title: "Разрешение на фото- и видеосъёмку",
        content: "Я даю согласие тренеру и администрации зала на проведение фото- и видеосъёмки во время тренировок, а также на использование полученных материалов в информационных, рекламных и образовательных целях (соцсети, сайт, отчётность).\n\nСогласие может быть отозвано в любой момент по письменному заявлению."
      }
    ];
    for (const d of seedDocs) {
      const id = randomUUID();
      this.documents.set(id, {
        id,
        title: d.title,
        content: d.content,
        isActive: true,
        createdAt: new Date()
      });
    }

    // Generate time slots for the next 30 days
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      this.generateTimeSlotsForDate(date.toISOString().split('T')[0]);
    }
  }

  private generateTimeSlotsForDate(date: string) {
    const startH = this.settings.dayStartHour;
    const endH = this.settings.dayEndHour;
    const isHoliday = Array.from(this.holidays.values()).some(h => h.date === date);
    for (let hour = startH; hour < endH; hour++) {
      const timeSlotId = randomUUID();
      const working = isWorkingHour(this.settings.weeklyTemplate, date, hour);
      let blockReason: string | null = null;
      if (isHoliday) blockReason = "holiday";
      else if (!working) blockReason = "template";
      const timeSlot: TimeSlot = {
        id: timeSlotId,
        date,
        time: `${hour.toString().padStart(2, "0")}:00`,
        maxCapacity: 2,
        isBlocked: blockReason !== null,
        blockReason,
        createdAt: new Date(),
      };
      this.timeSlots.set(timeSlotId, timeSlot);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.phone === phone);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      phone: insertUser.phone,
      firstName: insertUser.firstName,
      lastName: insertUser.lastName ?? null,
      middleName: insertUser.middleName ?? null,
      birthDate: insertUser.birthDate ?? null,
      trainerNotes: insertUser.trainerNotes ?? null,
      parentFullName: insertUser.parentFullName ?? null,
      parentPhone: insertUser.parentPhone ?? null,
      role: insertUser.role || "student",
      isVerified: insertUser.isVerified ?? false,
      verificationCode: null,
      password: insertUser.password ?? "",
      mustChangePassword: insertUser.mustChangePassword ?? false,
      lastLogin: null,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async verifyUser(id: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    
    const verifiedUser = { ...user, isVerified: true, verificationCode: null };
    this.users.set(id, verifiedUser);
    return verifiedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    if (user.role === "trainer") throw new Error("Cannot delete trainer");

    // Remove all bookings made by this student
    for (const [bookingId, booking] of Array.from(this.bookings.entries())) {
      if (booking.studentId === id) {
        this.bookings.delete(bookingId);
      }
    }
    // Remove all notifications for this user
    for (const [notifId, notif] of Array.from(this.notifications.entries())) {
      if (notif.userId === id) {
        this.notifications.delete(notifId);
      }
    }
    // Remove all consents recorded by this user
    for (const [consentId, consent] of Array.from(this.consents.entries())) {
      if (consent.userId === id) {
        this.consents.delete(consentId);
      }
    }
    // Remove recurring rules for this user
    for (const [rid, rule] of Array.from(this.recurringBookings.entries())) {
      if (rule.studentId === id) {
        this.recurringBookings.delete(rid);
      }
    }
    this.users.delete(id);
  }

  // ----- Documents -----
  async getDocuments(activeOnly = false): Promise<Document[]> {
    const all = Array.from(this.documents.values());
    const filtered = activeOnly ? all.filter(d => d.isActive) : all;
    return filtered.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const id = randomUUID();
    const document: Document = {
      id,
      title: doc.title,
      content: doc.content,
      isActive: doc.isActive ?? true,
      createdAt: new Date()
    };
    this.documents.set(id, document);
    return document;
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
    const doc = this.documents.get(id);
    if (!doc) throw new Error("Document not found");
    const updated = { ...doc, ...updates };
    this.documents.set(id, updated);
    return updated;
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.documents.has(id)) throw new Error("Document not found");
    // Remove related consents
    for (const [cid, c] of Array.from(this.consents.entries())) {
      if (c.documentId === id) this.consents.delete(cid);
    }
    this.documents.delete(id);
  }

  // ----- Consents -----
  async getConsentsByUser(userId: string): Promise<(UserConsent & { document: Document })[]> {
    const list = Array.from(this.consents.values()).filter(c => c.userId === userId);
    return list
      .map(c => {
        const doc = this.documents.get(c.documentId);
        if (!doc) return null;
        return { ...c, document: doc };
      })
      .filter(Boolean) as (UserConsent & { document: Document })[];
  }

  async recordConsent(userId: string, documentId: string): Promise<UserConsent> {
    const id = randomUUID();
    const consent: UserConsent = {
      id,
      userId,
      documentId,
      acceptedAt: new Date()
    };
    this.consents.set(id, consent);
    return consent;
  }

  async getStudentWithConsents(id: string): Promise<StudentWithConsents | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const consents = await this.getConsentsByUser(id);
    return { ...user, consents };
  }

  async getTimeSlotById(id: string): Promise<TimeSlot | undefined> {
    return this.timeSlots.get(id);
  }

  async getTimeSlotsByDate(date: string): Promise<TimeSlotWithBookings[]> {
    const slots = Array.from(this.timeSlots.values()).filter(slot => slot.date === date);
    
    return Promise.all(slots.map(async slot => {
      const bookings = await this.getBookingsByTimeSlot(slot.id);
      const activeBookings = bookings.filter(b => b.status !== "cancelled");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      
      return {
        ...slot,
        bookings: activeBookings,
        availableSpots: slot.maxCapacity - confirmedBookings.length
      };
    }));
  }

  async getTimeSlotsByDateRange(startDate: string, endDate: string): Promise<TimeSlotWithBookings[]> {
    const slots = Array.from(this.timeSlots.values()).filter(slot => 
      slot.date >= startDate && slot.date <= endDate
    );
    
    return Promise.all(slots.map(async slot => {
      const bookings = await this.getBookingsByTimeSlot(slot.id);
      const activeBookings = bookings.filter(b => b.status !== "cancelled");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      
      return {
        ...slot,
        bookings: activeBookings,
        availableSpots: slot.maxCapacity - confirmedBookings.length
      };
    }));
  }

  async createTimeSlot(insertTimeSlot: InsertTimeSlot): Promise<TimeSlot> {
    const id = randomUUID();
    const timeSlot: TimeSlot = {
      ...insertTimeSlot,
      id,
      maxCapacity: insertTimeSlot.maxCapacity || 2,
      isBlocked: insertTimeSlot.isBlocked || false,
      blockReason: insertTimeSlot.blockReason ?? null,
      createdAt: new Date()
    };
    this.timeSlots.set(id, timeSlot);
    return timeSlot;
  }

  async updateTimeSlot(id: string, updates: Partial<TimeSlot>): Promise<TimeSlot> {
    const timeSlot = this.timeSlots.get(id);
    if (!timeSlot) throw new Error("Time slot not found");
    
    const updatedTimeSlot = { ...timeSlot, ...updates };
    this.timeSlots.set(id, updatedTimeSlot);
    return updatedTimeSlot;
  }

  async generateTimeSlots(date: string): Promise<TimeSlot[]> {
    this.generateTimeSlotsForDate(date);
    return Array.from(this.timeSlots.values()).filter(slot => slot.date === date);
  }

  async getBooking(id: string): Promise<BookingWithDetails | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;

    const student = await this.getUser(booking.studentId);
    const timeSlot = this.timeSlots.get(booking.timeSlotId);
    
    if (!student || !timeSlot) return undefined;

    return {
      ...booking,
      student: {
        firstName: student.firstName,
        lastName: student.lastName || "",
        phone: student.phone
      },
      timeSlot
    };
  }

  async getBookingsByStudent(studentId: string): Promise<BookingWithDetails[]> {
    const bookings = Array.from(this.bookings.values()).filter(b => b.studentId === studentId);
    
    const bookingsWithDetails = await Promise.all(
      bookings.map(async booking => {
        const student = await this.getUser(booking.studentId);
        const timeSlot = this.timeSlots.get(booking.timeSlotId);
        
        if (!student || !timeSlot) return null;

        return {
          ...booking,
          student: {
            firstName: student.firstName,
            lastName: student.lastName || "",
            phone: student.phone
          },
          timeSlot
        };
      })
    );

    return bookingsWithDetails.filter(Boolean) as BookingWithDetails[];
  }

  async listActiveBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(b => b.status !== "cancelled");
  }

  async getBookingsByTimeSlot(timeSlotId: string): Promise<BookingWithDetails[]> {
    const bookings = Array.from(this.bookings.values()).filter(b => b.timeSlotId === timeSlotId);
    
    const bookingsWithDetails = await Promise.all(
      bookings.map(async booking => {
        const student = await this.getUser(booking.studentId);
        const timeSlot = this.timeSlots.get(booking.timeSlotId);
        
        if (!student || !timeSlot) return null;

        return {
          ...booking,
          student: {
            firstName: student.firstName,
            lastName: student.lastName || "",
            phone: student.phone
          },
          timeSlot
        };
      })
    );

    return bookingsWithDetails.filter(Boolean) as BookingWithDetails[];
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const status = insertBooking.status || "pending";
    const booking: Booking = {
      ...insertBooking,
      id,
      status,
      notes: insertBooking.notes || null,
      recurringBookingId: insertBooking.recurringBookingId || null,
      createdAt: new Date(),
      confirmedAt: status === "confirmed" ? new Date() : null,
      cancelledAt: null
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking> {
    const booking = this.bookings.get(id);
    if (!booking) throw new Error("Booking not found");
    
    const updatedBooking = { ...booking, ...updates };
    this.bookings.set(id, updatedBooking);
    return updatedBooking;
  }

  async confirmBooking(id: string): Promise<Booking> {
    const booking = this.bookings.get(id);
    if (!booking) throw new Error("Booking not found");
    
    const confirmedBooking = { 
      ...booking, 
      status: "confirmed" as const, 
      confirmedAt: new Date() 
    };
    this.bookings.set(id, confirmedBooking);
    return confirmedBooking;
  }

  async cancelBooking(id: string): Promise<Booking> {
    const booking = this.bookings.get(id);
    if (!booking) throw new Error("Booking not found");
    
    const cancelledBooking = { 
      ...booking, 
      status: "cancelled" as const, 
      cancelledAt: new Date() 
    };
    this.bookings.set(id, cancelledBooking);
    return cancelledBooking;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(n => n.userId === userId);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      ...insertNotification,
      id,
      isRead: false,
      relatedBookingId: insertNotification.relatedBookingId || null,
      createdAt: new Date()
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const notification = this.notifications.get(id);
    if (!notification) throw new Error("Notification not found");
    
    const readNotification = { ...notification, isRead: true };
    this.notifications.set(id, readNotification);
    return readNotification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    let count = 0;
    for (const [id, notif] of Array.from(this.notifications.entries())) {
      if (notif.userId === userId && !notif.isRead) {
        this.notifications.set(id, { ...notif, isRead: true });
        count++;
      }
    }
    return count;
  }

  async getStudentsList(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.role === "student");
  }

  async getTrainer(): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.role === "trainer");
  }

  async getScheduleForDate(date: string): Promise<DaySchedule> {
    const timeSlots = await this.getTimeSlotsByDate(date);
    return {
      date,
      timeSlots: timeSlots.sort((a, b) => a.time.localeCompare(b.time))
    };
  }

  async getScheduleForWeek(startDate: string): Promise<DaySchedule[]> {
    const schedules: DaySchedule[] = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const schedule = await this.getScheduleForDate(dateStr);
      schedules.push(schedule);
    }
    
    return schedules;
  }

  async getScheduleForMonth(year: number, month: number): Promise<DaySchedule[]> {
    const schedules: DaySchedule[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = localDateStr(date);
      
      const schedule = await this.getScheduleForDate(dateStr);
      schedules.push(schedule);
    }
    
    return schedules;
  }

  // ----- Recurring bookings -----
  private findSlot(date: string, hour: number): TimeSlot | undefined {
    const time = `${String(hour).padStart(2, "0")}:00`;
    return Array.from(this.timeSlots.values()).find(s => s.date === date && (s.time === time || s.time === time + ":00"));
  }

  private ensureSlot(date: string, hour: number): TimeSlot {
    let slot = this.findSlot(date, hour);
    if (!slot) {
      const id = randomUUID();
      const isHoliday = Array.from(this.holidays.values()).some(h => h.date === date);
      const working = isWorkingHour(this.settings.weeklyTemplate, date, hour);
      let blockReason: string | null = null;
      if (isHoliday) blockReason = "holiday";
      else if (!working) blockReason = "template";
      slot = {
        id,
        date,
        time: `${String(hour).padStart(2, "0")}:00`,
        maxCapacity: 2,
        isBlocked: blockReason !== null,
        blockReason,
        createdAt: new Date(),
      };
      this.timeSlots.set(id, slot);
    }
    return slot;
  }

  async getRecurringBookingsByStudent(studentId: string): Promise<RecurringBooking[]> {
    return Array.from(this.recurringBookings.values())
      .filter(r => r.studentId === studentId)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  }

  async getRecurringBooking(id: string): Promise<RecurringBooking | undefined> {
    return this.recurringBookings.get(id);
  }

  async createRecurringBooking(rule: InsertRecurringBooking): Promise<RecurringBooking> {
    const id = randomUUID();
    const r: RecurringBooking = {
      id,
      studentId: rule.studentId,
      weekdays: rule.weekdays,
      hour: rule.hour,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
      createdBy: rule.createdBy,
      createdAt: new Date(),
    };
    this.recurringBookings.set(id, r);
    return r;
  }

  async deleteRecurringBooking(id: string): Promise<{ cancelledCount: number }> {
    const rule = this.recurringBookings.get(id);
    if (!rule) throw new Error("Recurring booking not found");
    const today = localDateStr(new Date());
    let cancelled = 0;
    for (const [bid, booking] of Array.from(this.bookings.entries())) {
      if (booking.recurringBookingId === id && booking.status !== "cancelled") {
        const slot = this.timeSlots.get(booking.timeSlotId);
        if (slot && slot.date >= today) {
          this.bookings.set(bid, { ...booking, status: "cancelled", cancelledAt: new Date() });
          cancelled++;
        }
      }
    }
    this.recurringBookings.delete(id);
    return { cancelledCount: cancelled };
  }

  async materializeRecurringBookings(untilDate: string): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    const today = localDateStr(new Date());
    const rules = Array.from(this.recurringBookings.values());
    for (const rule of rules) {
      const start = rule.startDate > today ? rule.startDate : today;
      const end = rule.endDate && rule.endDate < untilDate ? rule.endDate : untilDate;
      if (start > end) continue;
      const dates = eachDateInRange(start, end);
      for (const d of dates) {
        const wd = isoWeekday(d);
        if (!rule.weekdays.includes(wd)) continue;
        const dateStr = localDateStr(d);
        const slot = this.ensureSlot(dateStr, rule.hour);
        if (slot.isBlocked) { skipped++; continue; }
        // Already has a booking for this rule on this slot?
        const existingForRule = Array.from(this.bookings.values()).find(b =>
          b.recurringBookingId === rule.id && b.timeSlotId === slot.id && b.status !== "cancelled"
        );
        if (existingForRule) continue;
        // Student already has a booking that day?
        const studentSlotIdsThatDay = new Set(
          Array.from(this.timeSlots.values()).filter(s => s.date === dateStr).map(s => s.id)
        );
        const studentBookedThatDay = Array.from(this.bookings.values()).find(b =>
          b.studentId === rule.studentId && b.status !== "cancelled" && studentSlotIdsThatDay.has(b.timeSlotId)
        );
        if (studentBookedThatDay) { skipped++; continue; }
        // Slot full?
        const confirmed = Array.from(this.bookings.values()).filter(b =>
          b.timeSlotId === slot.id && b.status === "confirmed"
        );
        if (confirmed.length >= slot.maxCapacity) { skipped++; continue; }
        // Create confirmed booking
        const bid = randomUUID();
        this.bookings.set(bid, {
          id: bid,
          studentId: rule.studentId,
          timeSlotId: slot.id,
          status: "confirmed",
          bookedBy: rule.createdBy,
          notes: "Постоянная запись",
          recurringBookingId: rule.id,
          createdAt: new Date(),
          confirmedAt: new Date(),
          cancelledAt: null,
        });
        created++;
      }
    }
    return { created, skipped };
  }

  // ----- Slot blocking -----
  async blockSlot(timeSlotId: string, blocked: boolean): Promise<{ slot: TimeSlot; cancelledBookings: Booking[] }> {
    const slot = this.timeSlots.get(timeSlotId);
    if (!slot) throw new Error("Time slot not found");
    const updated: TimeSlot = {
      ...slot,
      isBlocked: blocked,
      blockReason: blocked ? "manual" : null,
    };
    this.timeSlots.set(timeSlotId, updated);
    const cancelled: Booking[] = [];
    if (blocked) {
      for (const [bid, b] of Array.from(this.bookings.entries())) {
        if (b.timeSlotId === timeSlotId && b.status !== "cancelled") {
          const c = { ...b, status: "cancelled" as const, cancelledAt: new Date() };
          this.bookings.set(bid, c);
          cancelled.push(c);
        }
      }
    }
    return { slot: updated, cancelledBookings: cancelled };
  }

  // Cancel any non-cancelled bookings on the given slot, returning the cancelled list.
  private cancelBookingsOnSlot(timeSlotId: string): Booking[] {
    const cancelled: Booking[] = [];
    for (const [bid, b] of Array.from(this.bookings.entries())) {
      if (b.timeSlotId === timeSlotId && b.status !== "cancelled") {
        const c = { ...b, status: "cancelled" as const, cancelledAt: new Date() };
        this.bookings.set(bid, c);
        cancelled.push(c);
      }
    }
    return cancelled;
  }

  async blockDate(date: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }> {
    // Make sure all hours within current settings exist for this date
    for (let h = this.settings.dayStartHour; h < this.settings.dayEndHour; h++) {
      this.ensureSlot(date, h);
    }

    const slots = Array.from(this.timeSlots.values()).filter(s => s.date === date);
    const updatedSlots: TimeSlot[] = [];
    const cancelled: Booking[] = [];
    for (const s of slots) {
      const r = await this.blockSlot(s.id, blocked);
      updatedSlots.push(r.slot);
      cancelled.push(...r.cancelledBookings);
    }
    return { slots: updatedSlots, cancelledBookings: cancelled };
  }

  async blockDateRange(startDate: string, endDate: string, blocked: boolean): Promise<{ slots: TimeSlot[]; cancelledBookings: Booking[] }> {
    const dates = eachDateInRange(startDate, endDate).map(localDateStr);
    const allSlots: TimeSlot[] = [];
    const allCancelled: Booking[] = [];
    for (const d of dates) {
      const r = await this.blockDate(d, blocked);
      allSlots.push(...r.slots);
      allCancelled.push(...r.cancelledBookings);
    }
    return { slots: allSlots, cancelledBookings: allCancelled };
  }

  // ----- Trainer schedule settings -----
  async getTrainerSettings(): Promise<TrainerSettings> {
    return { ...this.settings, weeklyTemplate: { ...this.settings.weeklyTemplate } };
  }

  async updateTrainerSettings(updates: TrainerSettingsUpdate): Promise<{ settings: TrainerSettings; cancelledCount: number }> {
    const next: TrainerSettings = {
      ...this.settings,
      dayStartHour: updates.dayStartHour ?? this.settings.dayStartHour,
      dayEndHour: updates.dayEndHour ?? this.settings.dayEndHour,
      weeklyTemplate: updates.weeklyTemplate
        ? { ...this.settings.weeklyTemplate, ...updates.weeklyTemplate }
        : this.settings.weeklyTemplate,
      cancelDeadlineHours:
        updates.cancelDeadlineHours ?? this.settings.cancelDeadlineHours,
      bookingDeadlineHours:
        updates.bookingDeadlineHours ?? this.settings.bookingDeadlineHours,
      updatedAt: new Date(),
    };
    if (next.dayEndHour <= next.dayStartHour) {
      throw new Error("Окончание рабочего дня должно быть позже начала");
    }
    this.settings = next;

    // Re-apply template to all today/future slots, only for slots blocked by 'template' or 'null'.
    // Manual blocks and holiday blocks are preserved.
    const today = localDateStr(new Date());
    const cancelled: Booking[] = [];

    // Identify all dates currently in the system (today or later)
    const futureDates = new Set<string>();
    for (const s of Array.from(this.timeSlots.values())) {
      if (s.date >= today) futureDates.add(s.date);
    }

    for (const date of Array.from(futureDates)) {
      // 1) Drop existing slots that are now outside the [dayStartHour, dayEndHour) window
      //    AND have no active bookings AND are not manually blocked.
      const slotsForDay = Array.from(this.timeSlots.values()).filter(s => s.date === date);
      for (const s of slotsForDay) {
        const hour = parseInt(s.time.slice(0, 2), 10);
        const inRange = hour >= next.dayStartHour && hour < next.dayEndHour;
        if (!inRange) {
          const hasActive = Array.from(this.bookings.values()).some(b =>
            b.timeSlotId === s.id && b.status !== "cancelled"
          );
          if (!hasActive && s.blockReason !== "manual") {
            this.timeSlots.delete(s.id);
          } else {
            // Out of range but has active bookings or manually blocked — leave it,
            // but ensure it's blocked so no new bookings sneak in.
            if (!s.isBlocked) {
              const c = this.cancelBookingsOnSlot(s.id);
              cancelled.push(...c);
              this.timeSlots.set(s.id, { ...s, isBlocked: true, blockReason: "template" });
            }
          }
        }
      }

      // 2) Ensure all hours in the new range exist
      for (let h = next.dayStartHour; h < next.dayEndHour; h++) {
        this.ensureSlot(date, h);
      }

      // 3) Re-apply template-derived blocks
      const isHolidayDay = Array.from(this.holidays.values()).some(h => h.date === date);
      const refreshed = Array.from(this.timeSlots.values()).filter(s => s.date === date);
      for (const s of refreshed) {
        if (s.blockReason === "manual" || s.blockReason === "holiday") continue;
        const hour = parseInt(s.time.slice(0, 2), 10);
        const working = !isHolidayDay && isWorkingHour(next.weeklyTemplate, date, hour);
        if (working) {
          if (s.isBlocked) {
            this.timeSlots.set(s.id, { ...s, isBlocked: false, blockReason: null });
          }
        } else {
          if (!s.isBlocked) {
            const c = this.cancelBookingsOnSlot(s.id);
            cancelled.push(...c);
          }
          this.timeSlots.set(s.id, { ...s, isBlocked: true, blockReason: isHolidayDay ? "holiday" : "template" });
        }
      }
    }

    return { settings: await this.getTrainerSettings(), cancelledCount: cancelled.length };
  }

  // ----- Holidays -----
  async getHolidays(): Promise<Holiday[]> {
    return Array.from(this.holidays.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async addHoliday(date: string, name?: string | null, createdBy?: string | null): Promise<{ holiday: Holiday; cancelledCount: number }> {
    // Reject duplicates
    const existing = Array.from(this.holidays.values()).find(h => h.date === date);
    if (existing) throw new Error("Этот день уже отмечен как праздничный");

    const id = randomUUID();
    const holiday: Holiday = {
      id,
      date,
      name: name ?? null,
      createdBy: createdBy ?? null,
      createdAt: new Date(),
    };
    this.holidays.set(id, holiday);

    // Block all slots that day with reason 'holiday'
    for (let h = this.settings.dayStartHour; h < this.settings.dayEndHour; h++) {
      this.ensureSlot(date, h);
    }
    const cancelled: Booking[] = [];
    const slots = Array.from(this.timeSlots.values()).filter(s => s.date === date);
    for (const s of slots) {
      if (s.blockReason === "manual") continue; // preserve manual
      if (!s.isBlocked) {
        cancelled.push(...this.cancelBookingsOnSlot(s.id));
      }
      this.timeSlots.set(s.id, { ...s, isBlocked: true, blockReason: "holiday" });
    }
    return { holiday, cancelledCount: cancelled.length };
  }

  async removeHoliday(id: string): Promise<void> {
    const h = this.holidays.get(id);
    if (!h) throw new Error("Праздник не найден");
    this.holidays.delete(id);
    // Re-evaluate slots that day: unblock those that are working per template
    const slots = Array.from(this.timeSlots.values()).filter(s => s.date === h.date);
    for (const s of slots) {
      if (s.blockReason !== "holiday") continue;
      const hour = parseInt(s.time.slice(0, 2), 10);
      const working = isWorkingHour(this.settings.weeklyTemplate, h.date, hour);
      if (working) {
        this.timeSlots.set(s.id, { ...s, isBlocked: false, blockReason: null });
      } else {
        this.timeSlots.set(s.id, { ...s, isBlocked: true, blockReason: "template" });
      }
    }
  }
}

export const storage = new MemStorage();