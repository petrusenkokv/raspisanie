import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar as CalIcon } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlockPeriodDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const blockMutation = useMutation({
    mutationFn: async (vars: { blocked: boolean }) => {
      const r = await apiRequest("POST", "/api/trainer/block-range", {
        startDate,
        endDate,
        blocked: vars.blocked,
      });
      return r.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: vars.blocked ? "Период закрыт" : "Период открыт",
        description: vars.blocked
          ? `Закрыто слотов: ${data.slotsCount}, отменено записей: ${data.cancelledCount}`
          : `Открыто слотов: ${data.slotsCount}`,
      });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalIcon className="h-5 w-5" />
            Закрыть/открыть период
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Используйте для отпуска или больничного. Все занятия в выбранные даты будут заблокированы для записи. Существующие записи учеников будут отменены.
          </p>
          <div>
            <Label>Дата начала</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Дата окончания</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="outline"
            onClick={() => blockMutation.mutate({ blocked: false })}
            disabled={blockMutation.isPending}
          >
            Открыть период
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => blockMutation.mutate({ blocked: true })}
            disabled={blockMutation.isPending}
          >
            {blockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Закрыть период
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
