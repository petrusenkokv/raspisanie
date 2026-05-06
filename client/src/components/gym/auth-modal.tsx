import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, Phone, UserPlus, LogIn, CheckCircle, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type Document } from "@shared/schema";
import { DocumentViewDialog } from "./document-view-dialog";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "login" | "register";
}

function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export function AuthModal({ open, onOpenChange, initialMode = "login" }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { setUser } = useGymStore();

  // Unified login state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Register state
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentMiddleName, setStudentMiddleName] = useState("");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [parentFullName, setParentFullName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [acceptedDocs, setAcceptedDocs] = useState<Record<string, boolean>>({});
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [mode, setMode] = useState<"login" | "register" | "consent" | "welcome" | "welcome_trainer_msg">("login");
  const [pendingLoginUser, setPendingLoginUser] = useState<any>(null);
  const [pendingConsentDocs, setPendingConsentDocs] = useState<Document[]>([]);
  const [loginConsentAccepted, setLoginConsentAccepted] = useState<Record<string, boolean>>({});

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
    enabled: open && (mode === "welcome" || mode === "welcome_trainer_msg"),
  });

  const age = useMemo(() => calculateAge(studentBirthDate), [studentBirthDate]);
  const requiresParent = age !== null && age < 14;

  useEffect(() => {
    if (!requiresParent) setParentConfirmed(false);
  }, [requiresParent]);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  const resetForm = () => {
    setPhone("");
    setPassword("");
    setStudentFirstName("");
    setStudentLastName("");
    setStudentMiddleName("");
    setStudentBirthDate("");
    setParentFullName("");
    setParentPhone("");
    setParentConfirmed(false);
    setAcceptedDocs({});
    setMode(initialMode);
    setPendingLoginUser(null);
    setPendingConsentDocs([]);
    setLoginConsentAccepted({});
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
        setMode("consent");
      } else if (data.showWelcomeMessage) {
        setUser(data.user);
        setPendingLoginUser(data.user);
        setMode("welcome_trainer_msg");
      } else {
        setUser(data.user);
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
        userId: pendingLoginUser.id,
        documentIds: pendingConsentDocs.map(d => d.id),
      });
      setUser(pendingLoginUser);
      toast({ title: "Добро пожаловать!", description: `Вы вошли как ${pendingLoginUser.firstName}` });
      onOpenChange(false);
      resetForm();
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
    if (!phone.trim() || !studentFirstName.trim() || !studentLastName.trim() || !password.trim()) {
      toast({ variant: "destructive", title: "Заполните обязательные поля" });
      return;
    }
    if (!studentBirthDate) {
      toast({ variant: "destructive", title: "Укажите дату рождения" });
      return;
    }
    if (requiresParent) {
      if (!parentFullName.trim() || !parentPhone.trim()) {
        toast({ variant: "destructive", title: "Заполните данные законного представителя" });
        return;
      }
      if (!parentConfirmed) {
        toast({ variant: "destructive", title: "Подтвердите, что Вы — законный представитель" });
        return;
      }
    }
    const missingDocs = documents.filter(d => !acceptedDocs[d.id]);
    if (missingDocs.length > 0) {
      toast({
        variant: "destructive",
        title: "Примите все документы",
        description: missingDocs.map(d => d.title).join(", "),
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register", {
        phone,
        firstName: studentFirstName,
        lastName: studentLastName,
        middleName: studentMiddleName || null,
        birthDate: studentBirthDate,
        password,
        parentFullName: requiresParent ? parentFullName : null,
        parentPhone: requiresParent ? parentPhone : null,
        consentDocumentIds: Object.keys(acceptedDocs).filter(id => acceptedDocs[id]),
      });
      const data = await response.json();
      setUser(data.user);
      setMode("welcome");
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Фамилия</Label>
                    <Input value={studentLastName} onChange={(e) => setStudentLastName(e.target.value)} disabled={loading} data-testid="input-lastName" />
                  </div>
                  <div className="space-y-2">
                    <Label>Имя</Label>
                    <Input value={studentFirstName} onChange={(e) => setStudentFirstName(e.target.value)} disabled={loading} data-testid="input-firstName" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Отчество (если есть)</Label>
                  <Input value={studentMiddleName} onChange={(e) => setStudentMiddleName(e.target.value)} disabled={loading} data-testid="input-middleName" />
                </div>
                <div className="space-y-2">
                  <Label>Дата рождения</Label>
                  <Input type="date" value={studentBirthDate} onChange={(e) => setStudentBirthDate(e.target.value)} disabled={loading} data-testid="input-birthDate" />
                </div>
                <div className="space-y-2">
                  <Label>Номер телефона</Label>
                  <Input type="tel" placeholder="+79991234567" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} data-testid="input-phone-register" />
                </div>
                <div className="space-y-2">
                  <Label>Пароль</Label>
                  <Input type="password" placeholder="Не короче 4 символов" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} data-testid="input-register-password" />
                </div>

                {requiresParent && (
                  <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                    <p className="text-sm font-medium">
                      Ученику меньше 14 лет — заполните данные законного представителя
                    </p>
                    <div className="space-y-2">
                      <Label>ФИО законного представителя</Label>
                      <Input value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} disabled={loading} data-testid="input-parent-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Телефон законного представителя</Label>
                      <Input type="tel" placeholder="+79991234567" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} disabled={loading} data-testid="input-parent-phone" />
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox checked={parentConfirmed} onCheckedChange={(v) => setParentConfirmed(!!v)} data-testid="checkbox-parent-confirmed" />
                      <span>Я являюсь законным представителем ребёнка и подтверждаю достоверность данных.</span>
                    </label>
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">Согласия с документами</p>
                    {documents.map(doc => (
                      <label key={doc.id} className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={!!acceptedDocs[doc.id]}
                          onCheckedChange={(v) => setAcceptedDocs(prev => ({ ...prev, [doc.id]: !!v }))}
                          data-testid={`checkbox-doc-${doc.id}`}
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
