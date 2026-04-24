import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, Phone, UserPlus, LogIn } from "lucide-react";
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
  const [studentMode, setStudentMode] = useState<"login" | "register">("login");

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
      setUser(data.user);
      toast({ title: "Добро пожаловать!", description: `Вы вошли как ${data.user.firstName}` });
      onOpenChange(false);
      resetStudentForm();
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
      toast({ title: "Регистрация успешна!", description: `Добро пожаловать, ${data.user.firstName}!` });
      onOpenChange(false);
      resetStudentForm();
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
            {studentMode === "login" ? (
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
