import { cn } from "@/lib/utils";

interface AppIntegrationProps {
  app: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
  draggable?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function AppIntegration({ 
  app, 
  draggable = false, 
  className,
  onClick 
}: AppIntegrationProps) {
  const handleDragStart = (e: React.DragEvent) => {
    if (draggable) {
      e.dataTransfer.setData("application/json", JSON.stringify(app));
    }
  };

  return (
    <div
      className={cn(
        "app-integration-badge",
        draggable && "cursor-move",
        onClick && "cursor-pointer hover:bg-secondary/80",
        className
      )}
      draggable={draggable}
      onDragStart={handleDragStart}
      onClick={onClick}
      data-testid={`app-${app.id}`}
    >
      <i className={`${app.icon} text-${app.color}`} />
      {app.name}
    </div>
  );
}
