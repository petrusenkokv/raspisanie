/**
 * Индивидуальная тренировка не делит слот ни с кем.
 *
 * Слот считается «индивидуальным», если в нём есть активная запись ученика с
 * wantsIndividualTraining. Такую тренировку нельзя ни добавлять в занятый слот,
 * ни подсаживать к ней другого ученика — в том числе молча, при материализации
 * постоянных записей.
 */

export type SlotParticipant = {
  studentId: string;
  /** Ключ дубля-аккаунта (studentIdentityKey): один человек может быть в двух учётках. */
  identity: string;
  individual: boolean;
  name: string;
};

export type IndividualConflictReason =
  /** Кандидат — индивидуал, а в слоте уже кто-то есть. */
  | "candidate_individual_slot_busy"
  /** В слоте уже идёт индивидуальная тренировка, к ней подсаживают другого. */
  | "existing_individual_occupied";

export type IndividualConflict = {
  reason: IndividualConflictReason;
  /** Ученик из уже существующей записи слота, из-за которого слот нельзя занимать. */
  blockingName: string;
  blockingStudentId: string;
};

/**
 * Можно ли добавить кандидата в слот с указанными участниками.
 * Тот же человек в другой учётке (совпавший identity) конфликт не создаёт.
 */
export function findIndividualSlotConflict(
  candidate: { studentId: string; identity: string; individual: boolean },
  occupants: SlotParticipant[],
): IndividualConflict | null {
  const others = occupants.filter(
    (o) => o.studentId !== candidate.studentId && o.identity !== candidate.identity,
  );
  if (others.length === 0) return null;

  if (candidate.individual) {
    return {
      reason: "candidate_individual_slot_busy",
      blockingName: others[0].name,
      blockingStudentId: others[0].studentId,
    };
  }

  const individual = others.find((o) => o.individual);
  if (individual) {
    return {
      reason: "existing_individual_occupied",
      blockingName: individual.name,
      blockingStudentId: individual.studentId,
    };
  }

  return null;
}

/** "Кучаев Сергей" — короткое имя для сообщений тренеру. */
export function slotParticipantName(user: {
  firstName: string;
  lastName?: string | null;
}): string {
  const last = (user.lastName ?? "").trim();
  const first = (user.firstName ?? "").trim();
  return [last, first].filter(Boolean).join(" ") || "Ученик";
}

/** "29.09.2026 в 18:00" — метка слота для текстов конфликта. */
export function formatSlotLabel(date: string, time: string): string {
  const [y, m, d] = String(date ?? "").split("-");
  const day = d && m && y ? `${d}.${m}.${y}` : String(date ?? "");
  return `${day} в ${String(time ?? "").slice(0, 5)}`;
}

/** Текст ошибки без имён — безопасен для показа ученику/родителю. */
export function individualConflictStudentMessage(
  conflict: IndividualConflict,
): string {
  return conflict.reason === "candidate_individual_slot_busy"
    ? "Индивидуальная тренировка доступна только в свободное время."
    : "На это время уже записана индивидуальная тренировка.";
}

/** Сообщение тренеру — ему виден конкретный ученик. */
export function individualConflictTrainerMessage(
  conflict: IndividualConflict,
  label: string,
): string {
  return conflict.reason === "candidate_individual_slot_busy"
    ? `Индивидуальную тренировку нельзя поставить в занятое время (${label}: ${conflict.blockingName}).`
    : `На ${label} идёт индивидуальная тренировка (${conflict.blockingName}) — другого ученика в это время записать нельзя.`;
}

/**
 * Ошибка наложения индивидуальной тренировки. Держит структурированный
 * конфликт, чтобы роут сформулировал текст по роли (тренеру — с именем ученика).
 */
export class IndividualSlotConflictError extends Error {
  readonly code = "INDIVIDUAL_SLOT_CONFLICT";

  constructor(
    readonly conflict: IndividualConflict,
    readonly label: string,
    /** true — запись делает тренер, ему можно показать имя другого ученика. */
    readonly forTrainer: boolean = false,
  ) {
    super(
      forTrainer
        ? individualConflictTrainerMessage(conflict, label)
        : individualConflictStudentMessage(conflict),
    );
    this.name = "IndividualSlotConflictError";
  }
}

/**
 * Проверка «это конфликт индивидуальной тренировки» без instanceof:
 * сервер может быть собран отдельным бандлом, и класс там другой.
 */
export function asIndividualSlotConflict(error: unknown): IndividualConflict | null {
  const e = error as Partial<IndividualSlotConflictError> | null;
  return e && e.code === "INDIVIDUAL_SLOT_CONFLICT" && e.conflict
    ? e.conflict
    : null;
}

/** Постоянная запись, пропущенная при материализации из-за чужой индивидуальной. */
export type RecurringIndividualConflictNotice = {
  recurringBookingId: string;
  studentId: string;
  studentName: string;
  date: string;
  hour: number;
  blockingName: string;
};

/** Заголовок уведомления тренеру о пропущенной постоянной записи. */
export const RECURRING_INDIVIDUAL_CONFLICT_TITLE = "Наложение записей";

/** "29.09.2026 в 18:00" — метка пропущенной постоянной записи. */
export function recurringConflictLabel(notice: RecurringIndividualConflictNotice): string {
  const [y, m, d] = notice.date.split("-");
  return `${d}.${m}.${y} в ${String(notice.hour).padStart(2, "0")}:00`;
}

/** Текст уведомления о пропущенной из-за индивидуальной тренировки постоянной записи. */
export function recurringSkippedByIndividualMessage(
  notice: RecurringIndividualConflictNotice,
): string {
  return `Постоянная запись ${notice.studentName} на ${recurringConflictLabel(notice)} пропущена: слот занимает индивидуальная тренировка (${notice.blockingName}). Перенесите одну из записей.`;
}
