import { create } from "zustand";
import { 
  type User, 
  type TimeSlotWithBookings, 
  type BookingWithDetails, 
  type DaySchedule,
  type Notification
} from "@shared/schema";

export type ViewType = "day" | "week" | "month";

interface GymStore {
  // Auth state
  currentUser: User | null;
  isAuthenticated: boolean;
  
  // Calendar state
  currentView: ViewType;
  selectedDate: Date;
  schedule: DaySchedule[];
  loading: boolean;
  
  // Bookings state
  userBookings: BookingWithDetails[];
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  
  // Students list (for trainer)
  students: User[];
  
  // Actions
  setUser: (user: User | null) => void;
  setCurrentView: (view: ViewType) => void;
  setSelectedDate: (date: Date) => void;
  setSchedule: (schedule: DaySchedule[]) => void;
  setLoading: (loading: boolean) => void;
  setUserBookings: (bookings: BookingWithDetails[]) => void;
  setNotifications: (notifications: Notification[]) => void;
  setStudents: (students: User[]) => void;
  
  // Helper functions
  getWeekDates: (date: Date) => Date[];
  getMonthDates: (date: Date) => Date[];
  isTrainer: () => boolean;
  logout: () => void;
}

export const useGymStore = create<GymStore>((set, get) => ({
  // Initial state
  currentUser: null,
  isAuthenticated: false,
  currentView: "day",
  selectedDate: new Date(),
  schedule: [],
  loading: false,
  userBookings: [],
  notifications: [],
  unreadCount: 0,
  students: [],
  
  // Actions
  setUser: (user) => set({ 
    currentUser: user, 
    isAuthenticated: !!user 
  }),
  
  setCurrentView: (view) => set({ currentView: view }),
  
  setSelectedDate: (date) => set({ selectedDate: date }),
  
  setSchedule: (schedule) => set({ schedule }),
  
  setLoading: (loading) => set({ loading }),
  
  setUserBookings: (bookings) => set({ userBookings: bookings }),
  
  setNotifications: (notifications) => {
    const unreadCount = notifications.filter(n => !n.isRead).length;
    set({ notifications, unreadCount });
  },
  
  setStudents: (students) => set({ students }),
  
  // Helper functions
  getWeekDates: (date) => {
    const week = [];
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay() + 1); // Monday
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      week.push(day);
    }
    
    return week;
  },
  
  getMonthDates: (date) => {
    const month = [];
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      month.push(new Date(year, monthIndex, day));
    }
    
    return month;
  },
  
  isTrainer: () => {
    const user = get().currentUser;
    return user?.role === "trainer";
  },
  
  logout: () => set({ 
    currentUser: null, 
    isAuthenticated: false,
    userBookings: [],
    notifications: [],
    unreadCount: 0
  })
}));