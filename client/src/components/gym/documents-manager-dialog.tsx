import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Document } from "@shared/schema";
import type { DocumentKind } from "@shared/consents-pricing";
import { Loader2, Plus, Trash2, FileText, Edit, Save, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentsManagerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    isActive: true,
    kind: "required" as DocumentKind,
    priceSurchargeRub: "",
  });
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    content: "",
    isActive: true,
    kind: "required" as DocumentKind,
    priceSurchargeRub: "",
  });
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/trainer/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/trainer/documents");
      return r.json();
    },
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setCreating(false);
      setNewForm({ title: "", content: "", isActive: true, kind: "required", priceSurchargeRub: "" });
    }
  }, [open]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: ReturnType<typeof toPayload>) => {
      const r = await apiRequest("POST", "/api/trainer/documents", data);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Документ создан" });
      setCreating(false);
      setNewForm({ title: "", content: "", isActive: true, kind: "required", priceSurchargeRub: "" });
    },
    onError: (e: any) => toast({ title: "Не удалось создать", description: e?.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const r = await apiRequest("PATCH", `/api/trainer/documents/${id}`, data);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Документ обновлён" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Не удалось обновить", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/trainer/documents/${id}`);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Документ удалён" });
      setDocToDelete(null);
    },
    onError: (e: any) => toast({ title: "Не удалось удалить", description: e?.message, variant: "destructive" }),
  });

  const toPayload = (form: typeof newForm) => ({
    title: form.title,
    content: form.content,
    isActive: form.isActive,
    kind: form.kind,
    priceSurchargeRub:
      form.kind === "pricing" ? Math.max(0, Number(form.priceSurchargeRub) || 0) : null,
  });

  const startEdit = (doc: Document) => {
    setEditingId(doc.id);
    setEditForm({
      title: doc.title,
      content: doc.content,
      isActive: doc.isActive,
      kind: (doc.kind === "pricing" ? "pricing" : "required") as DocumentKind,
      priceSurchargeRub: doc.priceSurchargeRub != null ? String(doc.priceSurchargeRub) : "",
    });
  };

  const KindFields = ({
    form,
    setForm,
  }: {
    form: typeof newForm;
    setForm: (v: typeof newForm) => void;
  }) => (
    <>
      <div>
        <Label>Тип документа</Label>
        <select
          className="w-full text-sm border rounded px-2 py-2 bg-white dark:bg-gray-900"
          value={form.kind}
          onChange={(e) =>
            setForm({ ...form, kind: e.target.value as DocumentKind })
          }
        >
          <option value="required">Обязательный (без галочки нельзя записаться)</option>
          <option value="pricing">Влияет на цену (фото/видео и т.п.)</option>
        </select>
      </div>
      {form.kind === "pricing" && (
        <div>
          <Label>Надбавка без согласия (₽)</Label>
          <Input
            type="number"
            min={0}
            value={form.priceSurchargeRub}
            onChange={(e) => setForm({ ...form, priceSurchargeRub: e.target.value })}
          />
        </div>
      )}
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Документы для согласия
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Эти документы ученики принимают при регистрации. Можно править тексты и добавлять свои.
            </p>

            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map(doc => (
                  <div key={doc.id} className="border rounded-lg p-3 bg-white dark:bg-gray-800">
                    {editingId === doc.id ? (
                      <div className="space-y-2">
                        <div>
                          <Label>Название</Label>
                          <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                        </div>
                        <div>
                          <Label>Текст</Label>
                          <Textarea
                            rows={8}
                            value={editForm.content}
                            onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                          />
                        </div>
                        <KindFields form={editForm} setForm={setEditForm} />
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={editForm.isActive}
                            onCheckedChange={(v) => setEditForm({ ...editForm, isActive: v })}
                          />
                          <span>Показывать новым ученикам</span>
                        </label>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4 mr-1" />
                            Отмена
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: doc.id, data: toPayload(editForm) })}
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            <Save className="h-4 w-4 mr-1" />
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{doc.title}</span>
                              {!doc.isActive && (
                                <Badge variant="secondary" className="text-xs">Скрыт</Badge>
                              )}
                              {doc.kind === "pricing" && (
                                <Badge variant="outline" className="text-xs">
                                  +{doc.priceSurchargeRub ?? 0} ₽
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap mt-1">
                              {doc.content}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => startEdit(doc)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDocToDelete(doc)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {creating ? (
                  <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 space-y-2">
                    <div>
                      <Label>Название</Label>
                      <Input
                        value={newForm.title}
                        onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                        placeholder="Например: Согласие на обработку персональных данных"
                      />
                    </div>
                    <div>
                      <Label>Текст документа</Label>
                      <Textarea
                        rows={8}
                        value={newForm.content}
                        onChange={(e) => setNewForm({ ...newForm, content: e.target.value })}
                        placeholder="Введите полный текст документа..."
                      />
                    </div>
                    <KindFields form={newForm} setForm={setNewForm} />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setCreating(false); setNewForm({ title: "", content: "", isActive: true, kind: "required", priceSurchargeRub: "" }); }}>
                        Отмена
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => createMutation.mutate(toPayload(newForm))}
                        disabled={createMutation.isPending || !newForm.title.trim() || !newForm.content.trim()}
                      >
                        {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Создать
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить документ
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              {docToDelete && (
                <>Документ <strong>«{docToDelete.title}»</strong> будет удалён. Ранее данные согласия учеников также будут удалены.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => docToDelete && deleteMutation.mutate(docToDelete.id)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
