import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import type { User } from "@shared/schema";

type RecipientType = "all" | "date" | "specific";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BroadcastDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("all");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const { data: students = [] } = useQuery<User[]>({
    queryKey: ["/api/trainer/students"],
    enabled: open,
  });

  const activeStudents = students.filter((s) => s.isActive !== false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: title.trim() || "Сообщение от тренера",
        message: message.trim(),
        recipientType,
      };
      if (recipientType === "date") payload.date = selectedDate;
      if (recipientType === "specific") payload.studentIds = selectedStudentIds;
      const r = await apiRequest("POST", "/api/trainer/broadcast", payload);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: "Рассылка отправлена",
        description: `Получили уведомление: ${data.sent} ученик(ов)`,
      });
      handleClose();
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setTitle("");
    setMessage("");
    setRecipientType("all");
    setSelectedDate(today);
    setSelectedStudentIds([]);
    onOpenChange(false);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const canSend =
    message.trim().length > 0 &&
    (recipientType !== "specific" || selectedStudentIds.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Рассылка ученикам</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="broadcast-title">Заголовок (необязательно)</Label>
            <Input
              id="broadcast-title"
              placeholder="Сообщение от тренера"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="broadcast-message">
              Текст сообщения <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="broadcast-message"
              placeholder="Например: Завтра зал закрыт. Тренировки переносятся."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>Получатели</Label>
            <RadioGroup
              value={recipientType}
              onValueChange={(v) => setRecipientType(v as RecipientType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="r-all" />
                <Label htmlFor="r-all" className="cursor-pointer font-normal">
                  Все активные ученики ({activeStudents.length})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="date" id="r-date" />
                <Label htmlFor="r-date" className="cursor-pointer font-normal">
                  Записанные на конкретный день
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="specific" id="r-specific" />
                <Label htmlFor="r-specific" className="cursor-pointer font-normal">
                  Выбрать учеников вручную
                </Label>
              </div>
            </RadioGroup>
          </div>

          {recipientType === "date" && (
            <div className="space-y-1">
              <Label htmlFor="broadcast-date">Дата</Label>
              <Input
                id="broadcast-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Уведомление получат ученики с активными записями на эту дату.
              </p>
            </div>
          )}

          {recipientType === "specific" && (
            <div className="space-y-2">
              <Label>Выберите учеников ({selectedStudentIds.length} выбрано)</Label>
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto dark:border-gray-700">
                {activeStudents.length === 0 && (
                  <p className="text-sm text-gray-500 p-3">Нет активных учеников</p>
                )}
                {activeStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => toggleStudent(student.id)}
                  >
                    <Checkbox
                      checked={selectedStudentIds.includes(student.id)}
                      onCheckedChange={() => toggleStudent(student.id)}
                    />
                    <span className="text-sm">
                      {student.firstName} {student.lastName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={sendMutation.isPending}>
            Отмена
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
