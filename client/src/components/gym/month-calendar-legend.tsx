import { CircleSlash, UserCheck, Users } from "lucide-react";

const LEGEND_ITEMS = [
  {
    label: "Свободно",
    icon: UserCheck,
    iconClass: "text-green-600 dark:text-green-400",
    bgClass: "bg-green-50 ring-1 ring-green-200 dark:bg-green-900/30 dark:ring-green-800",
  },
  {
    label: "Мало мест",
    icon: Users,
    iconClass: "text-amber-700 dark:text-amber-400",
    bgClass: "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:ring-amber-700",
  },
  {
    label: "Ваша запись",
    icon: UserCheck,
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:ring-blue-700",
  },
  {
    label: "Занято",
    icon: CircleSlash,
    iconClass: "text-red-500 dark:text-red-400",
    bgClass: "bg-red-50 ring-1 ring-red-200 dark:bg-red-900/25 dark:ring-red-800",
  },
] as const;

export function MonthCalendarLegend() {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2 py-3 border-t border-gray-100 dark:border-gray-800"
      aria-label="Расшифровка значков календаря"
    >
      {LEGEND_ITEMS.map(({ label, icon: Icon, iconClass, bgClass }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full shrink-0 ${bgClass}`}
            aria-hidden
          >
            <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
          </span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
