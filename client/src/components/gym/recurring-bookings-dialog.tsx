import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecurringBookingsPanel } from "@/components/gym/recurring-bookings-panel";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import type { StudentWithConsents, User } from "@shared/schema";
import { Calendar, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecurringBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecurringBookingsDialog({ open, onOpenChange }: RecurringBookingsDialogProps) {
  const { currentUser } = useGymStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const { data: students = [] } = useQuery<StudentWithConsents[]>({
    queryKey: ["/api/trainer/students"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/trainer/students");
      return res.json();
    },
    enabled: open,
    staleTime: 0,
  });

  const activeStudents = useMemo(() => {
    const list = students.filter((s) => s.isActive !== false);
    if (currentUser?.role === "trainer" && !list.some((s) => s.id === currentUser.id)) {
      list.unshift({
        id: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        phone: currentUser.phone,
        role: "trainer",
        isActive: true,
      } as User & StudentWithConsents);
    }
    return list;
  }, [students, currentUser]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeStudents;
    return activeStudents.filter((s) => {
      const name = `${s.firstName} ${s.lastName ?? ""} ${s.middleName ?? ""}`.toLowerCase();
      return name.includes(q) || (s.phone ?? "").includes(q);
    });
  }, [activeStudents, searchQuery]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId && activeStudents.length > 0) {
      setSelectedStudentId(activeStudents[0].id);
    }
  }, [open, activeStudents, selectedStudentId]);

  const selectedStudent = activeStudents.find((s) => s.id === selectedStudentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Повторяющиеся записи
          </DialogTitle>
          <DialogDescription>
            Регулярные тренировки по дням недели для выбранного ученика
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="recurring-student-search" className="text-sm">
              Ученик
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
              <Input
                id="recurring-student-search"
                placeholder="Поиск по имени или телефону"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-recurring-student-search"
              />
            </div>
          </div>

          <div
            className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y"
            role="listbox"
            aria-label="Список учеников"
          >
            {filteredStudents.length === 0 ? (
              <p className="text-sm text-gray-500 p-3 text-center">Ученики не найдены</p>
            ) : (
              filteredStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === selectedStudentId}
                  onClick={() => setSelectedStudentId(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800",
                    s.id === selectedStudentId &&
                      "bg-blue-50 dark:bg-blue-950/40 font-medium text-blue-800 dark:text-blue-200",
                  )}
                  data-testid={`button-recurring-student-${s.id}`}
                >
                  {s.firstName} {s.lastName ?? ""}
                </button>
              ))
            )}
          </div>

          {selectedStudent && selectedStudentId ? (
            <RecurringBookingsPanel studentId={selectedStudentId} />
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">Выберите ученика</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
