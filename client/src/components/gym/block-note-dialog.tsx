import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { BLOCK_NOTE_MAX_LENGTH } from "@shared/block-display";

interface BlockNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: (blockNote: string | null) => void;
}

export const BlockNoteDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Закрыть",
  pending = false,
  onConfirm,
}: BlockNoteDialogProps) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const handleConfirm = () => {
    const trimmed = note.trim().slice(0, BLOCK_NOTE_MAX_LENGTH);
    onConfirm(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="block-note">Причина (необязательно)</Label>
          <Textarea
            id="block-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, BLOCK_NOTE_MAX_LENGTH))}
            placeholder="Например: соревнования по гиревому спорту"
            rows={3}
            maxLength={BLOCK_NOTE_MAX_LENGTH}
            data-testid="input-block-note"
          />
          <p className="text-xs text-gray-500">
            Увидят вы и ученики. До {BLOCK_NOTE_MAX_LENGTH} символов.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            data-testid="button-block-note-confirm"
          >
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
