import type { TimeSlotWithBookings } from "@shared/schema";
import { type MonthDayFillLevel } from "@/lib/slot-availability-ui";
import { CalendarCellHint } from "./calendar-cell-hint";

type MonthDayCellHintProps = {
  openSlots: TimeSlotWithBookings[];
  fillLevel: MonthDayFillLevel | "guest-empty" | "guest-full";
  familyStudentIds: string[];
};

export function MonthDayCellHint({ fillLevel }: MonthDayCellHintProps) {
  return <CalendarCellHint fillLevel={fillLevel} layout="month" />;
}
