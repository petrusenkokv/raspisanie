import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { studentRegistrationSchema, type StudentRegistration } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useGymStore } from "@/store/gym-store";
import { Loader2, Phone, UserPlus, LogIn } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [step, setStep] = useState<"phone" | "register" | "login">("phone");
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { setUser } = useGymStore();

  const form = useForm<StudentRegistration>({
    resolver: zodResolver(studentRegistrationSchema),
    defaultValues: {
      phone: "",
      firstName: "",
      lastName: ""
    }
  });

  const sendVerificationCode = async () => {
    if (!phone.trim()) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите номер телефона"
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/send-verification", { phone });
      const data = await response.json();

      if (data.success) {
        // For demo purposes, show the code
        toast({
          title: "Код отправлен",
          description: `Код подтверждения: ${data.code}`
        });
        setStep("register");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось отправить код"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkExistingUser = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", { phone });
      const data = await response.json();

      setUser(data.user);
      toast({
        title: "Добро пожаловать!",
        description: `Вы вошли как ${data.user.firstName}`
      });
      onOpenChange(false);
      resetForm();
    } catch (error) {
      // User doesn't exist, proceed to registration
      setStep("register");
    } finally {
      setIsLoading(false);
    }
  };

  const registerUser = async (data: StudentRegistration) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register", data);
      const result = await response.json();

      setUser(result.user);
      toast({
        title: "Регистрация успешна!",
        description: `Добро пожаловать, ${result.user.firstName}!`
      });
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка регистрации",
        description: error.message || "Не удалось зарегистрироваться"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const trainerLogin = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/trainer-login", { phone });
      const data = await response.json();

      setUser(data.user);
      toast({
        title: "Добро пожаловать, тренер!",
        description: `Вы вошли как ${data.user.firstName} ${data.user.lastName}`
      });
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка входа",
        description: "Неверные данные тренера"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep("phone");
    setPhone("");
    setVerificationCode("");
    form.reset();
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

          <TabsContent value="student" className="space-y-4">
            {step === "phone" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Номер телефона</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+7 (999) 123-45-67"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="input-phone"
                  />
                </div>
                <Button 
                  onClick={checkExistingUser}
                  disabled={isLoading}
                  className="w-full"
                  data-testid="button-check-phone"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Phone className="mr-2 h-4 w-4" />
                  Продолжить
                </Button>
              </div>
            )}

            {step === "register" && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(registerUser)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Номер телефона</FormLabel>
                        <FormControl>
                          <Input {...field} value={phone} readOnly />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Имя</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Введите ваше имя"
                            data-testid="input-firstName"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Фамилия</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Введите вашу фамилию"
                            data-testid="input-lastName"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep("phone")}
                      className="flex-1"
                      data-testid="button-back"
                    >
                      Назад
                    </Button>
                    <Button 
                      type="submit"
                      disabled={isLoading}
                      className="flex-1"
                      data-testid="button-register"
                    >
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Зарегистрироваться
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </TabsContent>

          <TabsContent value="trainer" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trainer-phone">Номер телефона тренера</Label>
                <Input
                  id="trainer-phone"
                  type="tel"
                  placeholder="+7 (999) 123-45-67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="input-trainer-phone"
                />
              </div>
              
              <Button 
                onClick={trainerLogin}
                disabled={isLoading}
                className="w-full"
                data-testid="button-trainer-login"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <LogIn className="mr-2 h-4 w-4" />
                Войти как тренер
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}