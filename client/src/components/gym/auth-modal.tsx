import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, UserPlus, LogIn, CheckCircle, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type Document } from "@shared/schema";
import { DocumentViewDialog } from "./document-view-dialog";
import {
  birthDateValidationError,
  calculateAgeYears,
  todayLocalStr,
} from "@shared/birth-date";
import { filterRequiredDocuments, isPricingDocument } from "@shared/consents-pricing";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "login" | "register";
}

export function AuthModal({ open, onOpenChange, initialMode = "login" }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { setUser, setCurrentView, setSelectedDate } = useGymStore();

  const resetCalendarToToday = () => {
    setCurrentView("day");
    setSelectedDate(new Date());
  };

  // Unified login state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Register state
  const [registerSelf, setRegisterSelf] = useState(true);
  const [registerChild, setRegisterChild] = useState(false);
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  const [parentMiddleName, setParentMiddleName] = useState("");
  const [selfBirthDate, setSelfBirthDate] = useState("");
  const [legalRepresentativeConfirmed, setLegalRepresentativeConfirmed] = useState(false);
  type ChildRow = { firstName: string; lastName: string; middleName: string; birthDate: string };
  const emptyChild = (): ChildRow => ({ firstName: "", lastName: "", middleName: "", birthDate: "" });
  const [childrenRows, setChildrenRows] = useState<ChildRow[]>([emptyChild()]);
  const [acceptedDocs, setAcceptedDocs] = useState<Record<string, boolean>>({});
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [mode, setMode] = useState<"login" | "register" | "consent" | "welcome" | "welcome_trainer_msg">("login");
  const [pendingLoginUser, setPendingLoginUser] = useState<any>(null);
  const [pendingConsentDocs, setPendingConsentDocs] = useState<Document[]>([]);
  const [loginConsentAccepted, setLoginConsentAccepted] = useState<Record<string, boolean>>({});
  const [pendingShowWelcome, setPendingShowWelcome] = useState(false);

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/documents");
      return r.json();
    },
    enabled: open && mode === "register",
  });

  const { data: trainerSettings } = useQuery<{ welcomeMessage: string | null }>({
    queryKey: ["/api/schedule/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/schedule/settings");
      return r.json();
    },
    enabled: open && (mode === "welcome" || mode === "welcome_trainer_msg" || pendingShowWelcome),
  });

  const selfAge = useMemo(() => calculateAgeYears(selfBirthDate), [selfBirthDate]);
  const maxBirthDate = todayLocalStr();
  const selfIsMinor = selfAge !== null && selfAge < 14;

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const resetForm = () => {
    setPhone("");
    setPassword("");
    setRegisterSelf(true);
    setRegisterChild(false);
    setParentFirstName("");
    setParentLastName("");
    setParentMiddleName("");
    setSelfBirthDate("");
    setLegalRepresentativeConfirmed(false);
    setChildrenRows([emptyChild()]);
    setAcceptedDocs({});
    setMode(initialMode);
    setPendingLoginUser(null);
    setPendingConsentDocs([]);
    setLoginConsentAccepted({});
    setPendingShowWelcome(false);
  };

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      toast({ variant: "destructive", title: "Введите телефон и пароль" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", { phone, password });
      const data = await response.json();
      if (data.pendingDocuments && data.pendingDocuments.length > 0) {
        setPendingLoginUser(data.user);
        setPendingConsentDocs(data.pendingDocuments);
        setLoginConsentAccepted({});
        setPendingShowWelcome(!!data.showWelcomeMessage);
        setMode("consent");
      } else if (data.showWelcomeMessage) {
        setPendingLoginUser(data.user);
        setMode("welcome_trainer_msg");
      } else {
        setUser(data.user);
        resetCalendarToToday();
        const greeting = data.user.role === "trainer"
          ? `Добро пожаловать, тренер!`
          : `Добро пожаловать, ${data.user.firstName}!`;
        toast({ title: greeting });
        onOpenChange(false);
        resetForm();
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Не удалось войти",
        description: error?.message || "Проверьте телефон и пароль",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignConsents = async () => {
    const missing = pendingConsentDocs.filter(d => !loginConsentAccepted[d.id]);
    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "Примите все документы",
        description: missing.map(d => d.title).join(", "),
      });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/sign-consents", {
        documentIds: pendingConsentDocs.map(d => d.id),
      });
      if (pendingShowWelcome) {
        setPendingShowWelcome(false);
        setMode("welcome_trainer_msg");
      } else {
        setUser(pendingLoginUser);
        resetCalendarToToday();
        toast({ title: "Добро пожаловать!", description: `Вы вошли как ${pendingLoginUser.firstName}` });
        onOpenChange(false);
        resetForm();
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error?.message || "Не удалось сохранить согласия",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerSelf && !registerChild) {
      toast({ variant: "destructive", title: "Выберите вариант регистрации" });
      return;
    }
    if (!phone.trim() || !password.trim()) {
      toast({ variant: "destructive", title: "Введите телефон и пароль" });
      return;
    }

    const missingRequired = filterRequiredDocuments(documents).filter((d) => !acceptedDocs[d.id]);
    if (missingRequired.length > 0) {
      toast({
        variant: "destructive",
        title: "Примите обязательные документы",
        description: missingRequired.map((d) => d.title).join(", "),
      });
      return;
    }

    const consentIds = Object.keys(acceptedDocs).filter((id) => acceptedDocs[id]);

    setLoading(true);
    try {
      if (registerSelf && !registerChild) {
        if (!parentFirstName.trim() || !parentLastName.trim()) {
          toast({ variant: "destructive", title: "Заполните имя и фамилию" });
          return;
        }
        const selfBirthErr = birthDateValidationError(selfBirthDate, "student-self");
        if (selfBirthErr) {
          toast({ variant: "destructive", title: selfBirthErr });
          return;
        }
        const response = await apiRequest("POST", "/api/auth/register", {
          phone,
          firstName: parentFirstName,
          lastName: parentLastName,
          middleName: parentMiddleName || null,
          birthDate: selfBirthDate,
          password,
          parentFullName: null,
          parentPhone: null,
          consentDocumentIds: consentIds,
        });
        const data = await parseJsonResponse<{ user: unknown }>(response);
        setUser(data.user as any);
        setMode("welcome");
        return;
      }

      if (registerChild) {
        if (!parentFirstName.trim() || !parentLastName.trim()) {
          toast({ variant: "destructive", title: "Заполните ФИО для входа в систему" });
          return;
        }
        const validChildren = childrenRows.filter((c) => c.firstName.trim() && c.lastName.trim());
        if (validChildren.length === 0) {
          toast({ variant: "destructive", title: "Добавьте хотя бы одного ребёнка" });
          return;
        }
        for (let i = 0; i < validChildren.length; i++) {
          const childBirthErr = birthDateValidationError(validChildren[i].birthDate, "child");
          if (childBirthErr) {
            toast({ variant: "destructive", title: `Ребёнок ${i + 1}: ${childBirthErr}` });
            return;
          }
        }
        if (registerSelf) {
          const adultBirthErr = birthDateValidationError(selfBirthDate, "adult");
          if (adultBirthErr) {
            toast({ variant: "destructive", title: adultBirthErr });
            return;
          }
        }
        if (!legalRepresentativeConfirmed) {
          toast({
            variant: "destructive",
            title: "Подтвердите, что Вы — законный представитель ребёнка",
          });
          return;
        }

        const response = await apiRequest("POST", "/api/auth/register-parent", {
          phone,
          firstName: parentFirstName,
          lastName: parentLastName,
          middleName: parentMiddleName || null,
          birthDate: registerSelf ? selfBirthDate : null,
          isAlsoStudent: registerSelf,
          legalRepresentativeConfirmed,
          password,
          consentDocumentIds: consentIds,
          children: validChildren.map((c) => ({
            firstName: c.firstName.trim(),
            lastName: c.lastName.trim(),
            middleName: c.middleName.trim() || null,
            birthDate: c.birthDate,
          })),
        });
        const data = await parseJsonResponse<{ user: any }>(response);
        setUser(data.user);
        if (registerSelf && data.user?.isPendingApproval) {
          setMode("welcome");
        } else {
          toast({
            title: "Регистрация завершена",
            description: "Дети добавлены. После одобрения тренером можно записывать на тренировки.",
          });
          onOpenChange(false);
          resetForm();
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка регистрации",
        description: error?.message || "Не удалось зарегистрироваться",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">
              {mode === "register" ? "Регистрация" : "Вход в систему"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {mode === "login" && "Введите номер телефона и пароль"}
              {mode === "register" && "Заполните данные для регистрации"}
              {mode === "consent" && "Примите необходимые документы для входа"}
              {mode === "welcome" && "Регистрация завершена"}
              {mode === "welcome_trainer_msg" && "Добро пожаловать!"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* ── WELCOME (after self-registration) ── */}
            {mode === "welcome" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center gap-2 py-2">
                  <div className="rounded-full bg-blue-100 dark:bg-blue-900/40 p-3">
                    <CheckCircle className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">Регистрация завершена!</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Ваша заявка отправлена тренеру. Как только он одобрит вашу регистрацию — вы сможете записываться на тренировки.
                  </p>
                </div>
                <Button className="w-full" onClick={() => { onOpenChange(false); resetForm(); }}>
                  Понятно, перейти к расписанию
                </Button>
              </div>
            )}

            {/* ── WELCOME TRAINER MESSAGE (first login after approval/trainer-registration) ── */}
            {mode === "welcome_trainer_msg" && (
              <div className="space-y-4">
                <div className="flex flex-col items-center text-center gap-2 py-2">
                  <div className="rounded-full bg-green-100 dark:bg-green-900/40 p-3">
                    <MessageSquare className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                    Добро пожаловать, {pendingLoginUser?.firstName}!
                  </h3>
                </div>
                {trainerSettings?.welcomeMessage ? (
                  <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide mb-2">Сообщение от тренера</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{trainerSettings.welcomeMessage}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                      Тренер одобрил вашу регистрацию. Теперь вы можете записываться на тренировки!
                    </p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (pendingLoginUser?.id) {
                      await apiRequest("POST", `/api/users/${pendingLoginUser.id}/mark-welcome-shown`).catch(() => {});
                    }
                    setUser(pendingLoginUser);
                    resetCalendarToToday();
                    onOpenChange(false);
                    resetForm();
                  }}
                >
                  Понятно, перейти к расписанию
                </Button>
              </div>
            )}

            {/* ── CONSENT ── */}
            {mode === "consent" && (
              <>
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Для входа необходимо ознакомиться и принять документы
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Без согласия доступ к расписанию будет ограничен.
                  </p>
                </div>
                <div className="border rounded-lg p-3 space-y-2">
                  {pendingConsentDocs.map(doc => (
                    <label key={doc.id} className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!loginConsentAccepted[doc.id]}
                        onCheckedChange={(v) => setLoginConsentAccepted(prev => ({ ...prev, [doc.id]: !!v }))}
                      />
                      <span className="flex-1">
                        Согласен(на) с{" "}
                        <button type="button" className="text-blue-600 underline" onClick={() => setViewingDoc(doc)}>
                          «{doc.title}»
                        </button>
                      </span>
                    </label>
                  ))}
                </div>
                <Button onClick={handleSignConsents} disabled={loading} className="w-full">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Принять и войти
                </Button>
              </>
            )}

            {/* ── LOGIN ── */}
            {mode === "login" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="login-phone">Номер телефона</Label>
                  <Input
                    id="login-phone"
                    type="tel"
                    placeholder="+79991234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                    autoFocus
                    data-testid="input-phone"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Пароль</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Введите пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    data-testid="input-password"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <Button onClick={handleLogin} disabled={loading} className="w-full" data-testid="button-login-student">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <LogIn className="mr-2 h-4 w-4" />
                  Войти
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-blue-600 hover:underline"
                  onClick={() => { setMode("register"); setPhone(""); setPassword(""); }}
                  data-testid="link-register"
                >
                  Нет аккаунта? Зарегистрироваться
                </button>
              </>
            )}

            {/* ── REGISTER ── */}
            {mode === "register" && (
              <>
                <div className="space-y-2 border rounded-lg p-3">
                  <p className="text-sm font-medium">Кого регистрируем?</p>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={registerSelf}
                      onCheckedChange={(v) => setRegisterSelf(!!v)}
                      disabled={loading || selfIsMinor}
                      data-testid="checkbox-register-self"
                    />
                    <span>Тренируюсь сам(а)</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={registerChild}
                      onCheckedChange={(v) => {
                        setRegisterChild(!!v);
                        if (v && childrenRows.length === 0) setChildrenRows([emptyChild()]);
                      }}
                      disabled={loading}
                      data-testid="checkbox-register-child"
                    />
                    <span>Записать ребёнка</span>
                  </label>
                  {selfIsMinor && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      До 14 лет — только через «Записать ребёнка».
                    </p>
                  )}
                </div>

                {(registerSelf || registerChild) && (
                  <div className="border rounded-lg p-3 space-y-3">
                    <p className="text-sm font-semibold">
                      {registerSelf ? "Ваши данные (вы ученик)" : "Данные для входа (взрослый)"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label>Фамилия</Label>
                        <Input value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} disabled={loading} data-testid="input-lastName" />
                      </div>
                      <div className="space-y-2">
                        <Label>Имя</Label>
                        <Input value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} disabled={loading} data-testid="input-firstName" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Отчество (если есть)</Label>
                      <Input value={parentMiddleName} onChange={(e) => setParentMiddleName(e.target.value)} disabled={loading} data-testid="input-middleName" />
                    </div>
                    {registerSelf && (
                      <div className="space-y-2">
                        <Label>Дата рождения</Label>
                        <Input
                          type="date"
                          max={maxBirthDate}
                          value={selfBirthDate}
                          onChange={(e) => setSelfBirthDate(e.target.value)}
                          disabled={loading}
                          data-testid="input-birthDate"
                        />
                      </div>
                    )}
                  </div>
                )}

                {registerChild && (
                  <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={legalRepresentativeConfirmed}
                        onCheckedChange={(v) => setLegalRepresentativeConfirmed(!!v)}
                        disabled={loading}
                        data-testid="checkbox-legal-representative-confirmed"
                      />
                      <span>
                        Я являюсь законным представителем ребёнка и подтверждаю достоверность данных.
                      </span>
                    </label>
                  </div>
                )}

                {registerChild && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Дети</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() => setChildrenRows((rows) => [...rows, emptyChild()])}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Ещё ребёнок
                      </Button>
                    </div>
                    {childrenRows.map((row, idx) => (
                      <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                        {childrenRows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8"
                            disabled={loading}
                            onClick={() => setChildrenRows((rows) => rows.filter((_, i) => i !== idx))}
                            aria-label="Удалить ребёнка"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                        <p className="text-xs font-medium text-muted-foreground pr-8">Ребёнок {idx + 1}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Фамилия</Label>
                            <Input
                              value={row.lastName}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChildrenRows((rows) => rows.map((r, i) => (i === idx ? { ...r, lastName: v } : r)));
                              }}
                              disabled={loading}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Имя</Label>
                            <Input
                              value={row.firstName}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChildrenRows((rows) => rows.map((r, i) => (i === idx ? { ...r, firstName: v } : r)));
                              }}
                              disabled={loading}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Отчество</Label>
                            <Input
                              value={row.middleName}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChildrenRows((rows) => rows.map((r, i) => (i === idx ? { ...r, middleName: v } : r)));
                              }}
                              disabled={loading}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Дата рождения</Label>
                            <Input
                              type="date"
                              max={maxBirthDate}
                              value={row.birthDate}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChildrenRows((rows) => rows.map((r, i) => (i === idx ? { ...r, birthDate: v } : r)));
                              }}
                              disabled={loading}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Номер телефона (для входа)</Label>
                  <Input type="tel" placeholder="+79991234567" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} data-testid="input-phone-register" />
                </div>
                <div className="space-y-2">
                  <Label>Пароль</Label>
                  <Input type="password" placeholder="Не короче 4 символов" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} data-testid="input-register-password" />
                </div>

                {documents.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">Согласия с документами</p>
                    {documents.map((doc) => (
                      <label key={doc.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={!!acceptedDocs[doc.id]}
                          onCheckedChange={(v) => setAcceptedDocs((prev) => ({ ...prev, [doc.id]: !!v }))}
                          data-testid={`checkbox-doc-${doc.id}`}
                        />
                        <span className="flex-1">
                          Согласен(на) с{" "}
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => setViewingDoc(doc)}
                          >
                            «{doc.title}»
                          </button>
                          {isPricingDocument(doc) && !acceptedDocs[doc.id] && (
                            <span className="block text-xs text-muted-foreground mt-0.5">
                              Необязательно. Без галочки цена выше на {doc.priceSurchargeRub ?? 0} ₽
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode("login")} disabled={loading} className="flex-1">
                    Назад
                  </Button>
                  <Button onClick={handleRegister} disabled={loading} className="flex-1" data-testid="button-register-submit">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <UserPlus className="mr-2 h-4 w-4" />
                    Зарегистрироваться
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DocumentViewDialog
        document={viewingDoc}
        open={!!viewingDoc}
        onOpenChange={(o) => { if (!o) setViewingDoc(null); }}
      />
    </>
  );
}
