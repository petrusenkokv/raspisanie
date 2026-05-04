import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, Phone, UserPlus, LogIn, CheckCircle, Clock, CalendarCheck, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type Document } from "@shared/schema";
import { DocumentViewDialog } from "./document-view-dialog";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { setUser } = useGymStore();

  // Student state
  const [studentPhone, setStudentPhone] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentMiddleName, setStudentMiddleName] = useState("");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [parentFullName, setParentFullName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [acceptedDocs, setAcceptedDocs] = useState<Record<string, boolean>>({});
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [studentMode, setStudentMode] = useState<"login" | "register" | "consent" | "welcome">("login");
  const [pendingLoginUser, setPendingLoginUser] = useState<any>(null);
  const [pendingConsentDocs, setPendingConsentDocs] = useState<Document[]>([]);
  const [loginConsentAccepted, setLoginConsentAccepted] = useState<Record<string, boolean>>({});

  // Trainer state
  const [trainerPhone, setTrainerPhone] = useState("");
  const [trainerPassword, setTrainerPassword] = useState("");

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/documents");
      return r.json();
    },
    enabled: open && studentMode === "register",
  });

  const { data: trainerSettings } = useQuery<{ welcomeMessage: string | null }>({
    queryKey: ["/api/schedule/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/schedule/settings");
      return r.json();
    },
    enabled: open && studentMode === "welcome",
  });

  const age = useMemo(() => calculateAge(studentBirthDate), [studentBirthDate]);
  const requiresParent = age !== null && age < 14;

  useEffect(() => {
    if (!requiresParent) setParentConfirmed(false);
  }, [requiresParent]);

  const resetStudentForm = () => {
    setStudentPhone("");
    setStudentPassword("");
    setStudentFirstName("");
    setStudentLastName("");
    setStudentMiddleName("");
    setStudentBirthDate("");
    setParentFullName("");
    setParentPhone("");
    setParentConfirmed(false);
    setAcceptedDocs({});
    setStudentMode("login");
    setPendingLoginUser(null);
    setPendingConsentDocs([]);
    setLoginConsentAccepted({});
  };

  const resetTrainerForm = () => {
    setTrainerPhone("");
    setTrainerPassword("");
  };

  const handleStudentLogin = async () => {
    if (!studentPhone.trim() || !studentPassword.trim()) {
      toast({ variant: "destructive", title: "Введите телефон и пароль" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        phone: studentPhone,
        password: studentPassword,
      });
      const data = await response.json();
      if (data.pendingDocuments && data.pendingDocuments.length > 0) {
        setPendingLoginUser(data.user);
        setPendingConsentDocs(data.pendingDocuments);
        setLoginConsentAccepted({});
        setStudentMode("consent");
      } else {
        setUser(data.user);
        toast({ title: "Добро пожаловать!", description: `Вы вошли как ${data.user.firstName}` });
        onOpenChange(false);
        resetStudentForm();
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
      resetStudentForm();
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
    if (!studentPhone.trim() || !studentFirstName.trim() || !studentLastName.trim() || !studentPassword.trim()) {
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
        phone: studentPhone,
        firstName: studentFirstName,
        lastName: studentLastName,
        middleName: studentMiddleName || null,
        birthDate: studentBirthDate,
        password: studentPassword,
        parentFullName: requiresParent ? parentFullName : null,
        parentPhone: requiresParent ? parentPhone : null,
        consentDocumentIds: Object.keys(acceptedDocs).filter(id => acceptedDocs[id]),
      });
      const data = await response.json();
      setUser(data.user);
      setStudentMode("welcome");
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

  const handleTrainerLogin = async () => {
    if (!trainerPhone.trim() || !trainerPassword.trim()) {
      toast({ variant: "destructive", title: "Введите телефон и пароль" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/trainer-login", {
        phone: trainerPhone,
        password: trainerPassword,
      });
      const data = await response.json();
      setUser(data.user);
      toast({ title: "Добро пожаловать, тренер!", description: `${data.user.firstName} ${data.user.lastName}` });
      onOpenChange(false);
      resetTrainerForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка входа",
        description: error?.message || "Неверный телефон или пароль",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Вход в систему</DialogTitle>
          <DialogDescription>Войдите как ученик или тренер, чтобы продолжить.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="student" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="student" data-testid="tab-student">
              <UserPlus className="h-4 w-4 mr-2" />
              Ученик
            </TabsTrigger>
            <TabsTrigger value="trainer" data-testid="tab-trainer">
              <LogIn className="h-4 w-4 mr-2" />
              Тренер
            </TabsTrigger>
          </TabsList>

          {/* Student Tab */}
          <TabsContent value="student" className="space-y-4 mt-4">
            {studentMode === "welcome" ? (
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

                {trainerSettings?.welcomeMessage ? (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide mb-2">Сообщение от тренера</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{trainerSettings.welcomeMessage}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-3">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">Как это работает</p>
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-700 dark:text-gray-300">Ожидайте одобрения тренера. Вы получите уведомление в приложении.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CalendarCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-700 dark:text-gray-300">После одобрения нажмите на любой свободный слот в расписании, чтобы записаться.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <XCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-gray-700 dark:text-gray-300">Отменить запись можно самостоятельно в разделе «Мои записи» до установленного тренером времени.</p>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => { onOpenChange(false); resetStudentForm(); }}
                >
                  Понятно, перейти к расписанию
                </Button>
              </div>
            ) : studentMode === "consent" ? (
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
                        <button
                          type="button"
                          className="text-blue-600 underline"
                          onClick={() => setViewingDoc(doc)}
                        >
                          «{doc.title}»
                        </button>
                      </span>
                    </label>
                  ))}
                </div>
                <Button
                  onClick={handleSignConsents}
                  disabled={loading}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Принять и войти
                </Button>
              </>
            ) : studentMode === "login" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="student-phone">Номер телефона</Label>
                  <Input
                    id="student-phone"
                    type="tel"
                    placeholder="+79991234567"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    disabled={loading}
                    autoFocus
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-password">Пароль</Label>
                  <Input
                    id="student-password"
                    type="password"
                    placeholder="Введите пароль"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    disabled={loading}
                    data-testid="input-password"
                  />
                </div>
                <Button
                  onClick={handleStudentLogin}
                  disabled={loading}
                  className="w-full"
                  data-testid="button-login-student"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Phone className="mr-2 h-4 w-4" />
                  Войти
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-blue-600 hover:underline"
                  onClick={() => setStudentMode("register")}
                  data-testid="link-register"
                >
                  Нет аккаунта? Зарегистрироваться
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Фамилия</Label>
                    <Input
                      value={studentLastName}
                      onChange={(e) => setStudentLastName(e.target.value)}
                      disabled={loading}
                      data-testid="input-lastName"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Имя</Label>
                    <Input
                      value={studentFirstName}
                      onChange={(e) => setStudentFirstName(e.target.value)}
                      disabled={loading}
                      data-testid="input-firstName"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Отчество (если есть)</Label>
                  <Input
                    value={studentMiddleName}
                    onChange={(e) => setStudentMiddleName(e.target.value)}
                    disabled={loading}
                    data-testid="input-middleName"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата рождения</Label>
                  <Input
                    type="date"
                    value={studentBirthDate}
                    onChange={(e) => setStudentBirthDate(e.target.value)}
                    disabled={loading}
                    data-testid="input-birthDate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Номер телефона</Label>
                  <Input
                    type="tel"
                    placeholder="+79991234567"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Пароль</Label>
                  <Input
                    type="password"
                    placeholder="Не короче 4 символов"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    disabled={loading}
                    data-testid="input-register-password"
                  />
                </div>

                {requiresParent && (
                  <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                    <p className="text-sm font-medium">
                      Ученику меньше 14 лет — заполните данные законного представителя
                    </p>
                    <div className="space-y-2">
                      <Label>ФИО законного представителя</Label>
                      <Input
                        value={parentFullName}
                        onChange={(e) => setParentFullName(e.target.value)}
                        disabled={loading}
                        data-testid="input-parent-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Телефон законного представителя</Label>
                      <Input
                        type="tel"
                        placeholder="+79991234567"
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        disabled={loading}
                        data-testid="input-parent-phone"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={parentConfirmed}
                        onCheckedChange={(v) => setParentConfirmed(!!v)}
                        data-testid="checkbox-parent-confirmed"
                      />
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
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => setViewingDoc(doc)}
                          >
                            «{doc.title}»
                          </button>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStudentMode("login")}
                    disabled={loading}
                    className="flex-1"
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={handleRegister}
                    disabled={loading}
                    className="flex-1"
                    data-testid="button-register"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Зарегистрироваться
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Trainer Tab */}
          <TabsContent value="trainer" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="trainer-phone">Номер телефона тренера</Label>
              <Input
                id="trainer-phone"
                type="tel"
                placeholder="+79991234567"
                value={trainerPhone}
                onChange={(e) => setTrainerPhone(e.target.value)}
                disabled={loading}
                autoFocus
                data-testid="input-trainer-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trainer-password">Пароль</Label>
              <Input
                id="trainer-password"
                type="password"
                placeholder="Введите пароль"
                value={trainerPassword}
                onChange={(e) => setTrainerPassword(e.target.value)}
                disabled={loading}
                data-testid="input-trainer-password"
              />
            </div>
            <Button
              onClick={handleTrainerLogin}
              disabled={loading}
              className="w-full"
              data-testid="button-trainer-login"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <LogIn className="mr-2 h-4 w-4" />
              Войти как тренер
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <DocumentViewDialog
      document={viewingDoc}
      open={!!viewingDoc}
      onOpenChange={(o) => !o && setViewingDoc(null)}
    />
    </>
  );
}
