export const BLOCK_NOTE_MAX_LENGTH = 120;

export const sanitizeBlockNote = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, BLOCK_NOTE_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

export const getBlockedSlotLabel = (
  blockReason: string | null | undefined,
  blockNote: string | null | undefined,
): string => {
  const note = blockNote?.trim();
  if (note) return note;
  if (blockReason === "holiday") return "Праздник";
  if (blockReason === "template") return "Не работает";
  if (blockReason === "manual") return "Заблокировано";
  return "Закрыто";
};
