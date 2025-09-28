import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/header";
import { useWorkflowStore } from "@/store/workflow-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  Palette, 
  Eye, 
  Save, 
  RotateCcw, 
  Download,
  Moon,
  Sun
} from "lucide-react";

const brandSettingsSchema = z.object({
  primaryColor: z.string().min(1, "Primary color is required"),
  accentColor: z.string().min(1, "Accent color is required"),
  companyName: z.string().min(1, "Company name is required"),
  logoUrl: z.string().optional(),
  enableDarkMode: z.boolean().default(false),
  customFont: z.string().optional(),
});

type BrandSettingsForm = z.infer<typeof brandSettingsSchema>;

export default function BrandSettings() {
  const { currentUser } = useWorkflowStore();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<BrandSettingsForm>({
    resolver: zodResolver(brandSettingsSchema),
    defaultValues: {
      primaryColor: "#1E40AF",
      accentColor: "#10B981",
      companyName: currentUser?.company || "Your Company",
      logoUrl: "",
      enableDarkMode: false,
      customFont: "Inter",
    },
  });

  const { watch, setValue, reset } = form;
  const watchedValues = watch();

  // Load existing brand settings on component mount
  useEffect(() => {
    if (currentUser?.brandSettings) {
      const settings = currentUser.brandSettings;
      reset({
        primaryColor: settings.primaryColor || "#1E40AF",
        accentColor: settings.accentColor || "#10B981",
        companyName: currentUser.company || "Your Company",
        logoUrl: settings.logoUrl || "",
        enableDarkMode: false,
        customFont: "Inter",
      });
    }
  }, [currentUser, reset]);

  // Save brand settings mutation
  const saveBrandSettings = useMutation({
    mutationFn: async (data: BrandSettingsForm) => {
      if (!currentUser?.id) throw new Error("No user ID");
      
      const brandSettings = {
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
        logoUrl: logoFile ? URL.createObjectURL(logoFile) : data.logoUrl,
      };
      
      return apiRequest("PUT", `/api/users/${currentUser.id}/brand-settings`, {
        brandSettings
      });
    },
    onSuccess: () => {
      toast({
        title: "Brand settings saved",
        description: "Your brand customization has been applied successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving brand settings",
        description: error.message || "Failed to save brand settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BrandSettingsForm) => {
    saveBrandSettings.mutate(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setLogoFile(file);
      setValue("logoUrl", URL.createObjectURL(file));
    }
  };

  const handleResetToDefaults = () => {
    reset({
      primaryColor: "#1E40AF",
      accentColor: "#10B981",
      companyName: "Your Company",
      logoUrl: "",
      enableDarkMode: false,
      customFont: "Inter",
    });
    setLogoFile(null);
  };

  const handleExportTheme = () => {
    const themeData = {
      ...watchedValues,
      logoUrl: logoFile ? logoFile.name : watchedValues.logoUrl,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(themeData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brand-theme.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Brand Settings" 
        subtitle="Customize your brand identity and theme"
        actionLabel="Export Theme"
        onAction={handleExportTheme}
      />
      
      <main className="flex-1 overflow-auto p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
            {/* Color Customization */}
            <Card data-testid="color-settings">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Color Scheme
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="primaryColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={field.value}
                            onChange={field.onChange}
                            className="w-12 h-10 rounded border border-border cursor-pointer"
                            data-testid="primary-color-picker"
                          />
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="#1E40AF"
                              className="flex-1"
                              data-testid="primary-color-input"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="accentColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accent Color</FormLabel>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={field.value}
                            onChange={field.onChange}
                            className="w-12 h-10 rounded border border-border cursor-pointer"
                            data-testid="accent-color-picker"
                          />
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="#10B981"
                              className="flex-1"
                              data-testid="accent-color-input"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="enableDarkMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Dark Mode Support</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Enable dark mode variations for your brand colors
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="dark-mode-toggle"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo and Branding */}
            <Card data-testid="logo-settings">
              <CardHeader>
                <CardTitle>Logo & Company Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Your Company Name"
                          data-testid="company-name-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div>
                  <Label className="text-sm font-medium">Company Logo</Label>
                  <div className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center">
                    {watchedValues.logoUrl ? (
                      <div className="space-y-4">
                        <img 
                          src={watchedValues.logoUrl} 
                          alt="Company Logo" 
                          className="mx-auto max-h-24 w-auto"
                        />
                        <p className="text-sm text-muted-foreground">
                          {logoFile ? logoFile.name : "Current logo"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
                        <div>
                          <p className="text-muted-foreground mb-2">Drop your logo here or click to upload</p>
                          <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 2MB</p>
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="logo-upload"
                      data-testid="logo-upload"
                    />
                    <Button variant="outline" asChild className="mt-4">
                      <label htmlFor="logo-upload" className="cursor-pointer" data-testid="choose-file-button">
                        {watchedValues.logoUrl ? "Change Logo" : "Choose File"}
                      </label>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Typography */}
            <Card data-testid="typography-settings">
              <CardHeader>
                <CardTitle>Typography</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="customFont"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Font Family</FormLabel>
                      <FormControl>
                        <select 
                          {...field}
                          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                          data-testid="font-family-select"
                        >
                          <option value="Inter">Inter (Default)</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Open Sans">Open Sans</option>
                          <option value="Poppins">Poppins</option>
                          <option value="Montserrat">Montserrat</option>
                          <option value="Lato">Lato</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card data-testid="brand-preview">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-border rounded-lg p-6 bg-background space-y-6">
                  {/* Header Preview */}
                  <div className="flex items-center gap-3 pb-4 border-b border-border">
                    {watchedValues.logoUrl ? (
                      <img 
                        src={watchedValues.logoUrl} 
                        alt="Logo" 
                        className="w-8 h-8 object-contain"
                      />
                    ) : (
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: watchedValues.primaryColor }}
                      >
                        <span className="text-white font-bold text-sm">
                          {watchedValues.companyName?.charAt(0) || "C"}
                        </span>
                      </div>
                    )}
                    <span 
                      className="text-xl font-bold"
                      style={{ fontFamily: watchedValues.customFont }}
                    >
                      {watchedValues.companyName}
                    </span>
                  </div>
                  
                  {/* Button Previews */}
                  <div className="space-y-3">
                    <button 
                      className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
                      style={{ 
                        backgroundColor: watchedValues.primaryColor,
                        fontFamily: watchedValues.customFont 
                      }}
                      data-testid="preview-primary-button"
                    >
                      Primary Button
                    </button>
                    <button 
                      className="w-full px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
                      style={{ 
                        backgroundColor: watchedValues.accentColor,
                        fontFamily: watchedValues.customFont 
                      }}
                      data-testid="preview-accent-button"
                    >
                      Accent Button
                    </button>
                    <button 
                      className="w-full px-4 py-2 rounded-md text-sm font-medium border transition-colors"
                      style={{ 
                        borderColor: watchedValues.primaryColor,
                        color: watchedValues.primaryColor,
                        fontFamily: watchedValues.customFont 
                      }}
                      data-testid="preview-outline-button"
                    >
                      Outline Button
                    </button>
                  </div>
                  
                  {/* Card Preview */}
                  <div className="border border-border rounded-lg p-4">
                    <h4 
                      className="font-semibold mb-2"
                      style={{ 
                        color: watchedValues.primaryColor,
                        fontFamily: watchedValues.customFont 
                      }}
                    >
                      Sample Card Title
                    </h4>
                    <p className="text-muted-foreground text-sm mb-3">
                      This is how your content will look with the selected brand colors and typography.
                    </p>
                    <div 
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: `${watchedValues.accentColor}20`,
                        color: watchedValues.accentColor 
                      }}
                    >
                      Status Badge
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-6 border-t border-border">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleResetToDefaults}
                data-testid="reset-to-defaults"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
              
              <div className="flex gap-3">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewMode(!previewMode)}
                  data-testid="toggle-preview"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {previewMode ? "Exit Preview" : "Preview Changes"}
                </Button>
                <Button 
                  type="submit"
                  disabled={saveBrandSettings.isPending}
                  data-testid="save-brand-settings"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveBrandSettings.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
