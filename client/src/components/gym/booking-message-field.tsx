import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BOOKING_MESSAGE_MAX_LENGTH } from "@shared/booking-message";

interface BookingMessageFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export function BookingMessageField({
  id,
  value,
  onChange,
  label = "Комментарий (необязательно)",
  placeholder = "Заболел, не приду",
}: BookingMessageFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, BOOKING_MESSAGE_MAX_LENGTH))}
        placeholder={placeholder}
        rows={2}
        maxLength={BOOKING_MESSAGE_MAX_LENGTH}
        className="resize-none text-sm"
      />
      <p className="text-xs text-muted-foreground text-right">
        {value.length}/{BOOKING_MESSAGE_MAX_LENGTH}
      </p>
    </div>
  );
}
