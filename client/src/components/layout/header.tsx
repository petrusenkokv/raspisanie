import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  showImport?: boolean;
}

export default function Header({ 
  title, 
  subtitle, 
  actionLabel = "Create Workflow", 
  onAction, 
  showImport = false 
}: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="page-header">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          {showImport && (
            <Button variant="secondary" data-testid="import-button">
              <Download className="w-4 h-4 mr-2" />
              Import
            </Button>
          )}
          {onAction && (
            <Button onClick={onAction} data-testid="action-button">
              <Plus className="w-4 h-4 mr-2" />
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
