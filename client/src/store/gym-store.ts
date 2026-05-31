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

function loadUserFromStorage(): User | null {
  try {
    const raw = localStorage.getItem("gym_current_user");
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

const CALENDAR_VIEW_KEY = "gym_calendar_view";
const SELECTED_DATE_KEY = "gym_selected_date";

function loadCalendarViewFromStorage(): ViewType {
  try {
    const view = localStorage.getItem(CALENDAR_VIEW_KEY);
    if (view === "day" || view === "week" || view === "month") return view;
  } catch {}
  return "day";
}

function loadSelectedDateFromStorage(): Date {
  try {
    const raw = localStorage.getItem(SELECTED_DATE_KEY);
    const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!Number.isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        return date;
      }
    }
  } catch {}
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function saveCalendarViewToStorage(view: ViewType) {
  try {
    localStorage.setItem(CALENDAR_VIEW_KEY, view);
  } catch {}
}

function saveSelectedDateToStorage(date: Date) {
  try {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    localStorage.setItem(SELECTED_DATE_KEY, `${y}-${m}-${d}`);
  } catch {}
}

const _savedUser = loadUserFromStorage();
const _savedView = loadCalendarViewFromStorage();
const _savedSelectedDate = loadSelectedDateFromStorage();

/** Sync UI with server session cookie (source of truth for auth). */
export async function validateStoredUser(): Promise<void> {
  const { setUser, logout } = useGymStore.getState();
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    if (data?.user) setUser(data.user);
  } catch {
    /* offline — keep cached user */
  }
}

export async function logoutFromServer(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  useGymStore.getState().logout();
}

export const useGymStore = create<GymStore>((set, get) => ({
  // Initial state
  currentUser: _savedUser,
  isAuthenticated: !!_savedUser,
  currentView: _savedView,
  selectedDate: _savedSelectedDate,
  schedule: [],
  loading: false,
  userBookings: [],
  notifications: [],
  unreadCount: 0,
  students: [],
  
  // Actions
  setUser: (user) => {
    if (user) {
      try { localStorage.setItem("gym_current_user", JSON.stringify(user)); } catch {}
    } else {
      try { localStorage.removeItem("gym_current_user"); } catch {}
    }
    set({ currentUser: user, isAuthenticated: !!user });
  },
  
  setCurrentView: (view) => {
    saveCalendarViewToStorage(view);
    set({ currentView: view });
  },

  setSelectedDate: (date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    saveSelectedDateToStorage(normalized);
    set({ selectedDate: normalized });
  },
  
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
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // always go to Monday
    startOfWeek.setDate(date.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
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
  
  logout: () => {
    try { localStorage.removeItem("gym_current_user"); } catch {}
    set({ 
      currentUser: null, 
      isAuthenticated: false,
      userBookings: [],
      notifications: [],
      unreadCount: 0
    });
  }
}));