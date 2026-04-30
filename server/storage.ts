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
  type AttendanceStatus,
  type MembershipPayment,
  type MembershipPaymentInput,
  type TrainerPayment,
  type TrainerPaymentInput,
  type TrainerPaymentWithUsage,
  type StudentPaymentStatus,
} from "@shared/schema";
import { randomUUID } from "crypto";

export type AttendanceStats = {
  total: number;
  attended: number;
  late: number;
  excused: number;
  noShow: number;
  pending: number; // confirmed past bookings without attendance set
};

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
  updateSlotCapacity(slotId: string, capacity: number | null): Promise<TimeSlot>;
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
  markAttendance(bookingId: string, status: AttendanceStatus | null, note: string | null): Promise<Booking>;
  getStudentAttendanceStats(studentId: string): Promise<AttendanceStats>;
  setStudentSickLeave(studentId: string, sickUntil: string | null, sickNote: string | null, startDate?: string): Promise<{ user: User; cancelledCount: number }>;
  
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

  // Payments — membership (ЧВ/БВ)
  getMembershipPayments(studentId: string): Promise<MembershipPayment[]>;
  addMembershipPayment(studentId: string, input: MembershipPaymentInput, createdBy: string): Promise<MembershipPayment>;
  deleteMembershipPayment(id: string): Promise<void>;
  getNextCvAllowedDate(studentId: string): Promise<string | null>;

  // Payments — trainer subscription
  getTrainerPayments(studentId: string): Promise<TrainerPaymentWithUsage[]>;
  addTrainerPayment(studentId: string, input: TrainerPaymentInput, createdBy: string): Promise<TrainerPaymentWithUsage>;
  cancelTrainerPayment(id: string): Promise<TrainerPaymentWithUsage>;
  deleteTrainerPayment(id: string): Promise<void>;

  // Payment status for a student on a particular date
  getStudentPaymentStatus(studentId: string, dateStr: string): Promise<StudentPaymentStatus>;

  // Student active status
  setUserActiveStatus(id: string, isActive: boolean, resetCv?: boolean): Promise<User>;

  // Analytics
  getStudentsList(includeInactive?: boolean): Promise<User[]>;
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
  if (hour < entry.startHour || hour >= entry.endHour) return false;
  if (entry.breakStartHour != null && entry.breakEndHour != null) {
    if (hour >= entry.breakStartHour && hour < entry.breakEndHour) return false;
  }
  return true;
}

// Returns the resolved capacity for a date based on weekly template + global default.
function resolveCapacity(template: WeeklyTemplate, defaultCapacity: number, date: string): number {
  const wd = isoWeekday(new Date(date + "T00:00:00"));
  const entry = template[String(wd) as "1"];
  if (entry && entry.capacity != null) return entry.capacity;
  return defaultCapacity;
}

interface SickPeriod {
  id: string;
  studentId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
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
  private membershipPayments: Map<string, MembershipPayment> = new Map();
  private trainerPayments: Map<string, TrainerPayment> = new Map();
  private sickPeriods: Map<string, SickPeriod> = new Map();
  private settings: TrainerSettings = {
    id: randomUUID(),
    dayStartHour: 8,
    dayEndHour: 20,
    weeklyTemplate: defaultWeeklyTemplate(8, 20),
    cancelDeadlineHours: 3,
    bookingDeadlineHours: 1,
    defaultCapacity: 2,
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
      sickUntil: null,
      sickNote: null,
      isActive: true,
      cvRestartDate: null,
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
    const capacity = resolveCapacity(this.settings.weeklyTemplate, this.settings.defaultCapacity, date);
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
        maxCapacity: capacity,
        isManualCapacity: false,
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
      sickUntil: insertUser.sickUntil ?? null,
      sickNote: insertUser.sickNote ?? null,
      isActive: true,
      cvRestartDate: null,
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
        availableSpots: Math.max(0, slot.maxCapacity - confirmedBookings.length)
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
        availableSpots: Math.max(0, slot.maxCapacity - confirmedBookings.length)
      };
    }));
  }

  async createTimeSlot(insertTimeSlot: InsertTimeSlot): Promise<TimeSlot> {
    const id = randomUUID();
    const timeSlot: TimeSlot = {
      ...insertTimeSlot,
      id,
      maxCapacity: insertTimeSlot.maxCapacity || resolveCapacity(this.settings.weeklyTemplate, this.settings.defaultCapacity, insertTimeSlot.date),
      isManualCapacity: insertTimeSlot.isManualCapacity ?? false,
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
      attendanceStatus: null,
      attendanceNote: null,
      attendanceMarkedAt: null,
      consumedTrainerPaymentId: null,
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

    // If this booking had consumed a trainer session, refund it
    let consumedId = booking.consumedTrainerPaymentId ?? null;
    if (consumedId) {
      this.refundTrainerSession(consumedId);
      consumedId = null;
    }

    const cancelledBooking = {
      ...booking,
      status: "cancelled" as const,
      cancelledAt: new Date(),
      consumedTrainerPaymentId: consumedId,
    };
    this.bookings.set(id, cancelledBooking);
    return cancelledBooking;
  }

  async markAttendance(
    bookingId: string,
    status: AttendanceStatus | null,
    note: string | null,
  ): Promise<Booking> {
    const booking = this.bookings.get(bookingId);
    if (!booking) throw new Error("Booking not found");

    const wasConsuming = booking.attendanceStatus === "attended" || booking.attendanceStatus === "late";
    const willConsume = status === "attended" || status === "late";

    let consumedId: string | null = booking.consumedTrainerPaymentId ?? null;

    // Refund previously consumed session if attendance no longer counts
    if (wasConsuming && !willConsume && consumedId) {
      this.refundTrainerSession(consumedId);
      consumedId = null;
    }

    // Consume a session if newly counting attendance and not yet linked to a subscription
    if (willConsume && !consumedId) {
      const slot = this.timeSlots.get(booking.timeSlotId);
      if (slot) {
        const sub = this.findActiveTrainerSubscriptionFor(booking.studentId, slot.date);
        if (sub) {
          consumedId = sub.id;
          this.consumeTrainerSession(sub.id);
        }
      }
    }

    const updated: Booking = {
      ...booking,
      attendanceStatus: status,
      attendanceNote: status ? (note ?? null) : null,
      attendanceMarkedAt: status ? new Date() : null,
      consumedTrainerPaymentId: consumedId,
    };
    this.bookings.set(bookingId, updated);
    return updated;
  }

  // ----- Trainer subscription helpers -----
  private countUsedSessions(subscriptionId: string): number {
    let used = 0;
    for (const b of Array.from(this.bookings.values())) {
      if (b.consumedTrainerPaymentId === subscriptionId) used++;
    }
    return used;
  }

  private findActiveTrainerSubscriptionFor(studentId: string, dateStr: string): TrainerPayment | null {
    // Pick the oldest active subscription with remaining capacity, started on/before date
    const candidates = Array.from(this.trainerPayments.values())
      .filter(p => p.studentId === studentId && p.status === "active" && p.startDate <= dateStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    for (const p of candidates) {
      if (this.countUsedSessions(p.id) < p.totalSessions) return p;
    }
    return null;
  }

  private consumeTrainerSession(subscriptionId: string) {
    const sub = this.trainerPayments.get(subscriptionId);
    if (!sub) return;
    const used = this.countUsedSessions(subscriptionId);
    if (used >= sub.totalSessions && sub.status === "active") {
      this.trainerPayments.set(subscriptionId, {
        ...sub,
        status: "completed",
        completedAt: new Date(),
      });
    }
  }

  private refundTrainerSession(subscriptionId: string) {
    const sub = this.trainerPayments.get(subscriptionId);
    if (!sub) return;
    // After refund the subscription should be active again if it was completed
    if (sub.status === "completed") {
      this.trainerPayments.set(subscriptionId, {
        ...sub,
        status: "active",
        completedAt: null,
      });
    }
  }

  async getStudentAttendanceStats(studentId: string): Promise<AttendanceStats> {
    const stats: AttendanceStats = {
      total: 0,
      attended: 0,
      late: 0,
      excused: 0,
      noShow: 0,
      pending: 0,
    };
    const nowMs = Date.now();
    for (const booking of Array.from(this.bookings.values())) {
      if (booking.studentId !== studentId) continue;
      // Count any booking that has an attendance status, even if cancelled (excused via sick-leave)
      if (booking.attendanceStatus) {
        stats.total++;
        switch (booking.attendanceStatus) {
          case "attended": stats.attended++; break;
          case "late": stats.late++; break;
          case "excused": stats.excused++; break;
          case "no_show": stats.noShow++; break;
        }
        continue;
      }
      // Pending: confirmed booking that already happened
      if (booking.status === "confirmed") {
        const slot = this.timeSlots.get(booking.timeSlotId);
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

  async setStudentSickLeave(
    studentId: string,
    sickUntil: string | null,
    sickNote: string | null,
    startDate?: string,
  ): Promise<{ user: User; cancelledCount: number }> {
    const user = this.users.get(studentId);
    if (!user) throw new Error("User not found");
    if (user.role !== "student") throw new Error("Only students can be set on sick leave");

    const updatedUser: User = {
      ...user,
      sickUntil,
      sickNote: sickUntil ? (sickNote ?? null) : null,
    };
    this.users.set(studentId, updatedUser);

    // Track sick period history for ЧВ date calculation
    if (sickUntil) {
      const fromStr = startDate || localDateStr(new Date());
      // Update existing open period with same startDate, or create new one
      const existing = Array.from(this.sickPeriods.values()).find(
        p => p.studentId === studentId && p.startDate === fromStr,
      );
      if (existing) {
        this.sickPeriods.set(existing.id, { ...existing, endDate: sickUntil });
      } else {
        const spId = randomUUID();
        this.sickPeriods.set(spId, { id: spId, studentId, startDate: fromStr, endDate: sickUntil });
      }
    }

    let cancelledCount = 0;
    if (sickUntil) {
      const fromStr = startDate || localDateStr(new Date());
      for (const [bid, booking] of Array.from(this.bookings.entries())) {
        if (booking.studentId !== studentId) continue;
        if (booking.status === "cancelled") continue;
        const slot = this.timeSlots.get(booking.timeSlotId);
        if (!slot) continue;
        if (slot.date < fromStr || slot.date > sickUntil) continue;
        // Refund any consumed trainer session: excused doesn't count
        let consumedId = booking.consumedTrainerPaymentId ?? null;
        if (consumedId) {
          this.refundTrainerSession(consumedId);
          consumedId = null;
        }
        const cancelled: Booking = {
          ...booking,
          status: "cancelled",
          cancelledAt: new Date(),
          attendanceStatus: "excused",
          attendanceNote: sickNote ? `Болезнь: ${sickNote}` : "Болезнь",
          attendanceMarkedAt: new Date(),
          consumedTrainerPaymentId: consumedId,
        };
        this.bookings.set(bid, cancelled);
        cancelledCount++;
      }
    }
    return { user: updatedUser, cancelledCount };
  }

  // ====== Payments: membership (ЧВ/БВ) ======
  async getMembershipPayments(studentId: string): Promise<MembershipPayment[]> {
    return Array.from(this.membershipPayments.values())
      .filter(p => p.studentId === studentId)
      .sort((a, b) => {
        const ka = a.month || a.date || "";
        const kb = b.month || b.date || "";
        return kb.localeCompare(ka);
      });
  }

  async addMembershipPayment(
    studentId: string,
    input: MembershipPaymentInput,
    createdBy: string,
  ): Promise<MembershipPayment> {
    const user = this.users.get(studentId);
    if (!user) throw new Error("User not found");
    if (user.role !== "student") throw new Error("Only students have memberships");

    let derivedMonth: string | null = null;
    if (input.type === "monthly_cv") {
      derivedMonth = input.paidDate.slice(0, 7);
      // Check if today is before the next allowed date
      const nextAllowed = await this.getNextCvAllowedDate(studentId);
      if (nextAllowed) {
        const today = localDateStr(new Date());
        if (today < nextAllowed) {
          throw new Error(`BEFORE_NEXT_ALLOWED_DATE:${nextAllowed}`);
        }
      }
    } else {
      const dup = Array.from(this.membershipPayments.values()).find(
        p => p.studentId === studentId && p.type === "one_time_bv" && p.date === input.date,
      );
      if (dup) throw new Error("DUPLICATE_DATE");
    }

    const id = randomUUID();
    const payment: MembershipPayment = {
      id,
      studentId,
      type: input.type,
      month: input.type === "monthly_cv" ? derivedMonth : null,
      paidDate: input.type === "monthly_cv" ? input.paidDate : null,
      date: input.type === "one_time_bv" ? input.date : null,
      note: input.note ?? null,
      createdBy,
      createdAt: new Date(),
    };
    this.membershipPayments.set(id, payment);
    return payment;
  }

  async deleteMembershipPayment(id: string): Promise<void> {
    if (!this.membershipPayments.has(id)) throw new Error("Payment not found");
    this.membershipPayments.delete(id);
  }

  async getNextCvAllowedDate(studentId: string): Promise<string | null> {
    const student = this.users.get(studentId);
    const cvRestartDate = student?.cvRestartDate ?? null;

    // Find the most recent monthly_cv payment (ignoring those before cvRestartDate if set)
    const cvPayments = Array.from(this.membershipPayments.values())
      .filter(p =>
        p.studentId === studentId &&
        p.type === "monthly_cv" &&
        p.paidDate &&
        (!cvRestartDate || p.paidDate >= cvRestartDate),
      )
      .sort((a, b) => (b.paidDate! > a.paidDate! ? 1 : -1));

    const last = cvPayments[0];
    if (!last?.paidDate) return null;

    // Base: same day next month
    const paid = new Date(last.paidDate + "T00:00:00");
    const base = new Date(paid);
    base.setMonth(base.getMonth() + 1);

    // Collect all unique sick days strictly after paidDate
    const sickDays = new Set<string>();
    const studentPeriods = Array.from(this.sickPeriods.values())
      .filter(p => p.studentId === studentId && p.endDate > last.paidDate!);

    for (const period of studentPeriods) {
      const start = new Date(Math.max(
        new Date(period.startDate + "T00:00:00").getTime(),
        new Date(last.paidDate! + "T00:00:00").getTime() + 86400000, // strictly after paidDate
      ));
      const end = new Date(period.endDate + "T00:00:00");
      const cur = new Date(start);
      while (cur <= end) {
        sickDays.add(localDateStr(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Shift base date by number of unique sick days
    base.setDate(base.getDate() + sickDays.size);
    return localDateStr(base);
  }

  // ====== Payments: trainer subscription ======
  private withUsage(p: TrainerPayment): TrainerPaymentWithUsage {
    return { ...p, usedSessions: this.countUsedSessions(p.id) };
  }

  async getTrainerPayments(studentId: string): Promise<TrainerPaymentWithUsage[]> {
    return Array.from(this.trainerPayments.values())
      .filter(p => p.studentId === studentId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(p => this.withUsage(p));
  }

  async addTrainerPayment(
    studentId: string,
    input: TrainerPaymentInput,
    createdBy: string,
  ): Promise<TrainerPaymentWithUsage> {
    const user = this.users.get(studentId);
    if (!user) throw new Error("User not found");
    if (user.role !== "student") throw new Error("Only students have subscriptions");

    const id = randomUUID();
    const payment: TrainerPayment = {
      id,
      studentId,
      type: input.type,
      totalSessions: input.totalSessions,
      startDate: input.startDate,
      status: "active",
      note: input.note ?? null,
      createdBy,
      createdAt: new Date(),
      completedAt: null,
    };
    this.trainerPayments.set(id, payment);
    return this.withUsage(payment);
  }

  async cancelTrainerPayment(id: string): Promise<TrainerPaymentWithUsage> {
    const sub = this.trainerPayments.get(id);
    if (!sub) throw new Error("Subscription not found");
    const updated: TrainerPayment = {
      ...sub,
      status: "cancelled",
      completedAt: new Date(),
    };
    this.trainerPayments.set(id, updated);
    return this.withUsage(updated);
  }

  async deleteTrainerPayment(id: string): Promise<void> {
    const sub = this.trainerPayments.get(id);
    if (!sub) throw new Error("Subscription not found");
    // Clear consumption links from bookings
    for (const [bid, b] of Array.from(this.bookings.entries())) {
      if (b.consumedTrainerPaymentId === id) {
        this.bookings.set(bid, { ...b, consumedTrainerPaymentId: null });
      }
    }
    this.trainerPayments.delete(id);
  }

  async getStudentPaymentStatus(studentId: string, dateStr: string): Promise<StudentPaymentStatus> {
    const student = this.users.get(studentId);
    const cvRestartDate = student?.cvRestartDate ?? null;

    // ЧВ оплачивается на месяц от даты оплаты (paidDate + 1 месяц + дни больничных
    // строго после paidDate). Та же семантика, что и в getNextCvAllowedDate.
    const cvPayments = Array.from(this.membershipPayments.values()).filter(
      (p) =>
        p.studentId === studentId &&
        p.type === "monthly_cv" &&
        !!p.paidDate &&
        (!cvRestartDate || p.paidDate! >= cvRestartDate),
    );

    // Возвращает дату окончания действия ЧВ (включительно) для платежа,
    // если он покрывает dateStr. Иначе — null.
    const cvCoveringEndDate = (paidDateStr: string): string | null => {
      if (dateStr < paidDateStr) return null;
      const paid = new Date(paidDateStr + "T00:00:00");
      const end = new Date(paid);
      end.setMonth(end.getMonth() + 1);

      // Больничные дни строго после paidDate сдвигают окончание периода.
      const sickDays = new Set<string>();
      const periods = Array.from(this.sickPeriods.values()).filter(
        (sp) => sp.studentId === studentId && sp.endDate > paidDateStr,
      );
      for (const period of periods) {
        const start = new Date(
          Math.max(
            new Date(period.startDate + "T00:00:00").getTime(),
            new Date(paidDateStr + "T00:00:00").getTime() + 86400000,
          ),
        );
        const stop = new Date(period.endDate + "T00:00:00");
        const cur = new Date(start);
        while (cur <= stop) {
          sickDays.add(localDateStr(cur));
          cur.setDate(cur.getDate() + 1);
        }
      }
      end.setDate(end.getDate() + sickDays.size);
      // Период действия: [paidDate, end) — следующая оплата нужна с end.
      if (dateStr >= localDateStr(end)) return null;
      // Последний день действия (включительно) — день перед end.
      const lastDay = new Date(end);
      lastDay.setDate(lastDay.getDate() - 1);
      return localDateStr(lastDay);
    };

    let membershipKind: "monthly_cv" | "one_time_bv" | null = null;
    let cvPaidDate: string | null = null;
    let cvValidUntil: string | null = null;
    for (const p of cvPayments) {
      const validUntil = cvCoveringEndDate(p.paidDate!);
      if (validUntil) {
        membershipKind = "monthly_cv";
        cvPaidDate = p.paidDate!;
        cvValidUntil = validUntil;
        break;
      }
    }

    if (membershipKind === null) {
      // Разовая оплата БВ — действует только в свою дату.
      for (const p of Array.from(this.membershipPayments.values())) {
        if (p.studentId !== studentId) continue;
        if (p.type === "one_time_bv" && p.date === dateStr) {
          membershipKind = "one_time_bv";
          cvPaidDate = p.date;
          cvValidUntil = p.date;
          break;
        }
      }
    }

    const sub = this.findActiveTrainerSubscriptionFor(studentId, dateStr);
    return {
      hasMembership: membershipKind !== null,
      membershipKind,
      cvPaidDate,
      cvValidUntil,
      hasTrainerPayment: sub !== null,
      activeTrainerPayment: sub ? this.withUsage(sub) : null,
    };
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

  async getStudentsList(includeInactive = false): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      user => user.role === "student" && (includeInactive || user.isActive !== false),
    );
  }

  async setUserActiveStatus(id: string, isActive: boolean, resetCv = false): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    if (user.role === "trainer") throw new Error("Нельзя изменить статус тренера");
    const today = localDateStr(new Date());
    const updated: User = {
      ...user,
      isActive,
      cvRestartDate: resetCv && isActive ? today : user.cvRestartDate,
    };
    this.users.set(id, updated);
    return updated;
  }

  async getTrainer(): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.role === "trainer");
  }

  async getScheduleForDate(date: string): Promise<DaySchedule> {
    const hasAny = Array.from(this.timeSlots.values()).some(s => s.date === date);
    if (!hasAny) {
      this.generateTimeSlotsForDate(date);
    }
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
        maxCapacity: resolveCapacity(this.settings.weeklyTemplate, this.settings.defaultCapacity, date),
        isManualCapacity: false,
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
          attendanceStatus: null,
          attendanceNote: null,
          attendanceMarkedAt: null,
          consumedTrainerPaymentId: null,
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
      defaultCapacity:
        updates.defaultCapacity ?? this.settings.defaultCapacity,
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

      // 4) Re-apply capacity for slots that aren't manually overridden.
      //    Don't reduce below the number of confirmed bookings — keep the higher value.
      const newCapacity = resolveCapacity(next.weeklyTemplate, next.defaultCapacity, date);
      const finalSlots = Array.from(this.timeSlots.values()).filter(s => s.date === date);
      for (const s of finalSlots) {
        if (s.isManualCapacity) continue;
        const confirmed = Array.from(this.bookings.values()).filter(
          b => b.timeSlotId === s.id && b.status === "confirmed",
        ).length;
        const target = Math.max(newCapacity, confirmed);
        if (s.maxCapacity !== target) {
          this.timeSlots.set(s.id, { ...s, maxCapacity: target });
        }
      }
    }

    return { settings: await this.getTrainerSettings(), cancelledCount: cancelled.length };
  }

  // Per-slot capacity override.
  // capacity = null  => clear override and resolve from template/default.
  // capacity = number => set explicit value, mark slot as manually overridden.
  async updateSlotCapacity(slotId: string, capacity: number | null): Promise<TimeSlot> {
    const slot = this.timeSlots.get(slotId);
    if (!slot) throw new Error("Слот не найден");

    const confirmed = Array.from(this.bookings.values()).filter(
      b => b.timeSlotId === slotId && b.status === "confirmed",
    ).length;

    let nextCapacity: number;
    let manual: boolean;
    if (capacity === null) {
      nextCapacity = resolveCapacity(this.settings.weeklyTemplate, this.settings.defaultCapacity, slot.date);
      manual = false;
    } else {
      nextCapacity = capacity;
      manual = true;
    }

    if (nextCapacity < confirmed) {
      throw new Error(`Нельзя задать ${nextCapacity} мест: уже подтверждено записей — ${confirmed}`);
    }

    const updated: TimeSlot = { ...slot, maxCapacity: nextCapacity, isManualCapacity: manual };
    this.timeSlots.set(slotId, updated);
    return updated;
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