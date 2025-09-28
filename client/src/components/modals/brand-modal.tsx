import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function BrandModal() {
  const { isBrandModalOpen, setBrandModalOpen, currentUser } = useWorkflowStore();
  const [primaryColor, setPrimaryColor] = useState("#1E40AF");
  const [accentColor, setAccentColor] = useState("#10B981");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const saveBrandSettings = useMutation({
    mutationFn: async (brandSettings: any) => {
      if (!currentUser?.id) throw new Error("No user ID");
      
      return apiRequest("PUT", `/api/users/${currentUser.id}/brand-settings`, {
        brandSettings
      });
    },
    onSuccess: () => {
      toast({
        title: "Brand settings saved",
        description: "Your brand customization has been applied successfully.",
      });
      setBrandModalOpen(false);
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

  const handleSave = () => {
    const brandSettings = {
      primaryColor,
      accentColor,
      logoUrl: logoFile ? URL.createObjectURL(logoFile) : null,
    };
    
    saveBrandSettings.mutate(brandSettings);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setLogoFile(file);
    }
  };

  return (
    <Dialog open={isBrandModalOpen} onOpenChange={setBrandModalOpen}>
      <DialogContent className="max-w-2xl" data-testid="brand-modal">
        <DialogHeader>
          <DialogTitle>Brand Customization</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Brand Colors */}
          <div>
            <h3 className="font-medium text-foreground mb-4">Brand Colors</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="primary-color" className="text-sm font-medium text-muted-foreground mb-2">
                  Primary Color
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="primary-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 rounded border border-border"
                    data-testid="primary-color-picker"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                    data-testid="primary-color-input"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="accent-color" className="text-sm font-medium text-muted-foreground mb-2">
                  Accent Color
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="accent-color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-12 h-10 rounded border border-border"
                    data-testid="accent-color-picker"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="flex-1"
                    data-testid="accent-color-input"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Logo Upload */}
          <div>
            <h3 className="font-medium text-foreground mb-4">Brand Logo</h3>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">Drop your logo here or click to upload</p>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="logo-upload"
                data-testid="logo-upload"
              />
              <Button variant="outline" asChild>
                <label htmlFor="logo-upload" className="cursor-pointer" data-testid="choose-file-button">
                  Choose File
                </label>
              </Button>
              {logoFile && (
                <p className="text-sm text-foreground mt-2">Selected: {logoFile.name}</p>
              )}
            </div>
          </div>
          
          {/* Theme Preview */}
          <div>
            <h3 className="font-medium text-foreground mb-4">Preview</h3>
            <div className="border border-border rounded-lg p-4 bg-background">
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  <i className="fas fa-project-diagram text-white text-sm"></i>
                </div>
                <span className="text-xl font-bold text-foreground">Your Brand</span>
              </div>
              <div className="space-y-2">
                <button 
                  className="w-full px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                  data-testid="preview-primary-button"
                >
                  Primary Button
                </button>
                <button 
                  className="w-full px-4 py-2 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: accentColor }}
                  data-testid="preview-accent-button"
                >
                  Accent Button
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-6 border-t border-border">
          <Button 
            variant="secondary" 
            onClick={() => setBrandModalOpen(false)}
            data-testid="cancel-brand-settings"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saveBrandSettings.isPending}
            data-testid="save-brand-settings"
          >
            {saveBrandSettings.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
