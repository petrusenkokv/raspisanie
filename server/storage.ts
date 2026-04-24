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
  type StudentWithConsents
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
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking>;
  confirmBooking(id: string): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking>;
  
  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;
  
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

  // Analytics
  getStudentsList(): Promise<User[]>;
  getScheduleForDate(date: string): Promise<DaySchedule>;
  getScheduleForWeek(startDate: string): Promise<DaySchedule[]>;
  getScheduleForMonth(year: number, month: number): Promise<DaySchedule[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private timeSlots: Map<string, TimeSlot> = new Map();
  private bookings: Map<string, Booking> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private documents: Map<string, Document> = new Map();
  private consents: Map<string, UserConsent> = new Map();

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
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // 8:00 - 19:00
    
    hours.forEach(hour => {
      const timeSlotId = randomUUID();
      const timeSlot: TimeSlot = {
        id: timeSlotId,
        date: date,
        time: `${hour.toString().padStart(2, '0')}:00`,
        maxCapacity: 2,
        isBlocked: false,
        createdAt: new Date()
      };
      this.timeSlots.set(timeSlotId, timeSlot);
    });
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
    const booking: Booking = {
      ...insertBooking,
      id,
      status: insertBooking.status || "pending",
      notes: insertBooking.notes || null,
      createdAt: new Date(),
      confirmedAt: null,
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

  async getStudentsList(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.role === "student");
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
      const dateStr = date.toISOString().split('T')[0];
      
      const schedule = await this.getScheduleForDate(dateStr);
      schedules.push(schedule);
    }
    
    return schedules;
  }
}

export const storage = new MemStorage();