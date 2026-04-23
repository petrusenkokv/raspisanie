import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, Phone, UserPlus, LogIn } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [studentMode, setStudentMode] = useState<"login" | "register">("login");

  // Trainer state
  const [trainerPhone, setTrainerPhone] = useState("");
  const [trainerPassword, setTrainerPassword] = useState("");

  const resetStudentForm = () => {
    setStudentPhone("");
    setStudentPassword("");
    setStudentFirstName("");
    setStudentLastName("");
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
      toast({ variant: "destructive", title: "Заполните все поля" });
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register", {
        phone: studentPhone,
        firstName: studentFirstName,
        lastName: studentLastName,
        password: studentPassword,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                  <Label>Имя</Label>
                  <Input
                    placeholder="Имя"
                    value={studentFirstName}
                    onChange={(e) => setStudentFirstName(e.target.value)}
                    disabled={loading}
                    data-testid="input-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Фамилия</Label>
                  <Input
                    placeholder="Фамилия"
                    value={studentLastName}
                    onChange={(e) => setStudentLastName(e.target.value)}
                    disabled={loading}
                    data-testid="input-lastName"
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
  );
}
