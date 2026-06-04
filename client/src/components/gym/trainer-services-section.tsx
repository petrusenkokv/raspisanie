import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrainerService } from "@shared/schema";
import { Loader2, Plus, Trash2, Save, X } from "lucide-react";

type Props = {
  enabled?: boolean;
};

export function TrainerServicesSection({ enabled = true }: Props) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("500");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const { data: services = [], isLoading } = useQuery<TrainerService[]>({
    queryKey: ["/api/trainer/services"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/trainer/services");
      return r.json();
    },
    enabled,
    staleTime: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setCreating(false);
      setEditingId(null);
    }
  }, [enabled]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const priceRub = Number(newPrice);
      const r = await apiRequest("POST", "/api/trainer/services", {
        name: newName.trim(),
        priceRub: Number.isFinite(priceRub) ? priceRub : 0,
        isActive: true,
        isDefault: services.length === 0,
      });
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Услуга добавлена" });
      setCreating(false);
      setNewName("");
      setNewPrice("500");
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, priceRub }: { id: string; name: string; priceRub: number }) => {
      const r = await apiRequest("PATCH", `/api/trainer/services/${id}`, { name, priceRub });
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Сохранено" });
      setEditingId(null);
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/services/${id}`);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Услуга удалена" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const startEdit = (s: TrainerService) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPrice(String(s.priceRub));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ученик выбирает услугу в профиле. Цена за тренировку считается от выбранной услуги и согласий (надбавка за фото/видео).
      </p>
      {services.map((s) => (
        <div key={s.id} className="border rounded-lg p-3">
          {editingId === s.id ? (
            <div className="space-y-2">
              <div>
                <Label>Название</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Цена (₽)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4 mr-1" />
                  Отмена
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({
                      id: s.id,
                      name: editName.trim(),
                      priceRub: Number(editPrice) || 0,
                    })
                  }
                  disabled={updateMutation.isPending || !editName.trim()}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Сохранить
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {s.name}
                  {s.isDefault && (
                    <span className="text-xs text-blue-600 ml-2">по умолчанию</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{s.priceRub} ₽ / тренировка</p>
                {!s.isActive && (
                  <p className="text-xs text-amber-600">Скрыта для учеников</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => startEdit(s)}>
                  Изменить
                </Button>
                {!s.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600"
                    onClick={() => {
                      if (confirm(`Удалить услугу «${s.name}»?`)) {
                        deleteMutation.mutate(s.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {creating ? (
        <div className="border rounded-lg p-3 space-y-2 bg-blue-50/50 dark:bg-blue-950/20">
          <div>
            <Label>Название</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: Персональная"
            />
          </div>
          <div>
            <Label>Цена (₽)</Label>
            <Input
              type="number"
              min={0}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim()}
            >
              Создать
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить услугу
        </Button>
      )}
    </div>
  );
}
