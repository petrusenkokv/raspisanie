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

  // Student registration state
  const [studentPhone, setStudentPhone] = useState("");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentStep, setStudentStep] = useState("phone");

  // Trainer login state
  const [trainerPhone, setTrainerPhone] = useState("");

  const resetStudentForm = () => {
    setStudentPhone("");
    setStudentFirstName("");
    setStudentLastName("");
    setStudentStep("phone");
  };

  const resetTrainerForm = () => {
    setTrainerPhone("");
  };

  const handleCheckPhone = async () => {
    if (!studentPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите номер телефона"
      });
      return;
    }

    setLoading(true);
    try {
      // Try to login existing user
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { phone: studentPhone }
      });

      setUser(response.user);
      toast({
        title: "Добро пожаловать!",
        description: `Вы вошли как ${response.user.firstName}`
      });
      onOpenChange(false);
      resetStudentForm();
    } catch (error) {
      // User doesn't exist, go to registration
      setStudentStep("register");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!studentPhone.trim() || !studentFirstName.trim() || !studentLastName.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Заполните все поля"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          phone: studentPhone,
          firstName: studentFirstName,
          lastName: studentLastName
        }
      });

      setUser(response.user);
      toast({
        title: "Регистрация успешна!",
        description: `Добро пожаловать, ${response.user.firstName}!`
      });
      onOpenChange(false);
      resetStudentForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка регистрации",
        description: error.message || "Не удалось зарегистрироваться"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTrainerLogin = async () => {
    if (!trainerPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите номер телефона"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest("/api/auth/trainer-login", {
        method: "POST",
        body: { phone: trainerPhone }
      });

      setUser(response.user);
      toast({
        title: "Добро пожаловать, тренер!",
        description: `Вы вошли как ${response.user.firstName} ${response.user.lastName}`
      });
      onOpenChange(false);
      resetTrainerForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка входа",
        description: "Неверный номер телефона"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            Вход в систему
          </DialogTitle>
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
            {studentStep === "phone" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="student-phone">Номер телефона</Label>
                  <Input
                    id="student-phone"
                    type="tel"
                    placeholder="9991234567"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    disabled={loading}
                    autoFocus
                    data-testid="input-phone"
                  />
                </div>
                <Button 
                  onClick={handleCheckPhone}
                  disabled={loading}
                  className="w-full"
                  data-testid="button-check-phone"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Phone className="mr-2 h-4 w-4" />
                  Продолжить
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Номер телефона</Label>
                  <Input
                    value={studentPhone}
                    disabled
                    className="opacity-70"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="student-firstname">Имя</Label>
                  <Input
                    id="student-firstname"
                    placeholder="Введите ваше имя"
                    value={studentFirstName}
                    onChange={(e) => setStudentFirstName(e.target.value)}
                    disabled={loading}
                    data-testid="input-firstName"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="student-lastname">Фамилия</Label>
                  <Input
                    id="student-lastname"
                    placeholder="Введите вашу фамилию"
                    value={studentLastName}
                    onChange={(e) => setStudentLastName(e.target.value)}
                    disabled={loading}
                    data-testid="input-lastName"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStudentStep("phone")}
                    disabled={loading}
                    className="flex-1"
                    data-testid="button-back"
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
                placeholder="79991234567"
                value={trainerPhone}
                onChange={(e) => setTrainerPhone(e.target.value)}
                disabled={loading}
                autoFocus
                data-testid="input-trainer-phone"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Номер тренера: 79991234567
              </p>
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