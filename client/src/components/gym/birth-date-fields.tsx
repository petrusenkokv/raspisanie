import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_BIRTH_AGE_YEARS, parseBirthDateStr, todayLocalStr } from "@shared/birth-date";

const MONTHS_RU = [
  { value: "01", label: "январь" },
  { value: "02", label: "февраль" },
  { value: "03", label: "март" },
  { value: "04", label: "апрель" },
  { value: "05", label: "май" },
  { value: "06", label: "июнь" },
  { value: "07", label: "июль" },
  { value: "08", label: "август" },
  { value: "09", label: "сентябрь" },
  { value: "10", label: "октябрь" },
  { value: "11", label: "ноябрь" },
  { value: "12", label: "декабрь" },
] as const;

type BirthDateParts = { day: string; month: string; year: string };

const splitBirthDate = (value: string): BirthDateParts => {
  const parsed = parseBirthDateStr(value);
  if (!parsed) return { day: "", month: "", year: "" };
  return {
    day: String(parsed.getDate()),
    month: String(parsed.getMonth() + 1).padStart(2, "0"),
    year: String(parsed.getFullYear()),
  };
};

const daysInMonth = (month: string, year: string): number => {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y) return 31;
  return new Date(y, m, 0).getDate();
};

const joinBirthDate = (day: string, month: string, year: string): string => {
  if (!day || !month || !year) return "";
  const d = day.padStart(2, "0");
  const mo = month.padStart(2, "0");
  return `${year}-${mo}-${d}`;
};

const selectClassName = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-2 py-2 text-base",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
);

type BirthDateFieldsProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  testId?: string;
  maxDate?: string;
  className?: string;
};

export const BirthDateFields = ({
  value,
  onChange,
  disabled = false,
  label = "Дата рождения",
  id,
  testId,
  maxDate = todayLocalStr(),
  className,
}: BirthDateFieldsProps) => {
  const [parts, setParts] = useState<BirthDateParts>(() => splitBirthDate(value));

  useEffect(() => {
    setParts(splitBirthDate(value));
  }, [value]);

  const maxYear = Number(maxDate.slice(0, 4));
  const minYear = maxYear - MAX_BIRTH_AGE_YEARS;

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [maxYear, minYear]);

  const maxDays = daysInMonth(parts.month, parts.year);
  const days = useMemo(() => Array.from({ length: maxDays }, (_, i) => i + 1), [maxDays]);

  const handlePartChange = (patch: Partial<BirthDateParts>) => {
    let next = { ...parts, ...patch };
    if (next.day && next.month && next.year) {
      const maxD = daysInMonth(next.month, next.year);
      if (Number(next.day) > maxD) next = { ...next, day: String(maxD) };
    }
    setParts(next);

    if (!next.day && !next.month && !next.year) {
      onChange("");
      return;
    }

    const joined = joinBirthDate(next.day, next.month, next.year);
    if (!joined) return;

    if (joined > maxDate) {
      const capped = splitBirthDate(maxDate);
      setParts(capped);
      onChange(maxDate);
      return;
    }
    onChange(joined);
  };

  const fieldId = id ?? testId;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={fieldId ? `${fieldId}-day` : undefined}>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={fieldId ? `${fieldId}-day` : undefined} className="text-xs text-muted-foreground">
            День
          </Label>
          <select
            id={fieldId ? `${fieldId}-day` : undefined}
            className={selectClassName}
            value={parts.day}
            disabled={disabled}
            onChange={(e) => handlePartChange({ day: e.target.value })}
            aria-label="День рождения"
            data-testid={testId ? `${testId}-day` : undefined}
          >
            <option value="">—</option>
            {days.map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={fieldId ? `${fieldId}-month` : undefined} className="text-xs text-muted-foreground">
            Месяц
          </Label>
          <select
            id={fieldId ? `${fieldId}-month` : undefined}
            className={selectClassName}
            value={parts.month}
            disabled={disabled}
            onChange={(e) => handlePartChange({ month: e.target.value })}
            aria-label="Месяц рождения"
            data-testid={testId ? `${testId}-month` : undefined}
          >
            <option value="">—</option>
            {MONTHS_RU.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={fieldId ? `${fieldId}-year` : undefined} className="text-xs text-muted-foreground">
            Год
          </Label>
          <select
            id={fieldId ? `${fieldId}-year` : undefined}
            className={selectClassName}
            value={parts.year}
            disabled={disabled}
            onChange={(e) => handlePartChange({ year: e.target.value })}
            aria-label="Год рождения"
            data-testid={testId ? `${testId}-year` : undefined}
          >
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Выберите день, месяц и год из списков</p>
    </div>
  );
};
