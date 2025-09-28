import { cn } from "@/lib/utils";
import { Play, Cog, NotebookPen } from "lucide-react";
import { type WorkflowNode } from "@shared/schema";
import AppIntegration from "./app-integration";

interface WorkflowNodeProps {
  node: WorkflowNode;
  isRunning?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function WorkflowNode({ 
  node, 
  isRunning = false, 
  className,
  style 
}: WorkflowNodeProps) {
  const getNodeIcon = () => {
    switch (node.type) {
      case "trigger":
        return <Play className="w-4 h-4 text-accent" />;
      case "action":
        return node.action === "parse_content" 
          ? <Cog className="w-4 h-4 text-primary" />
          : <NotebookPen className="w-4 h-4 text-accent" />;
      default:
        return <Cog className="w-4 h-4" />;
    }
  };

  const getNodeColor = () => {
    switch (node.type) {
      case "trigger":
        return "bg-accent/10";
      case "action":
        return node.action === "parse_content" ? "bg-primary/10" : "bg-accent/10";
      default:
        return "bg-muted";
    }
  };

  const getAppIcon = () => {
    switch (node.appType) {
      case "email":
        return "fas fa-envelope";
      case "ai":
        return "fas fa-brain";
      case "communication":
        return "fab fa-slack";
      default:
        return "fas fa-cog";
    }
  };

  const getAppColor = () => {
    switch (node.appType) {
      case "email":
        return "blue-500";
      case "ai":
        return "purple-500";
      case "communication":
        return "purple-600";
      default:
        return "gray-500";
    }
  };

  return (
    <div
      className={cn(
        "workflow-node",
        isRunning && "animate-pulse border-accent",
        className
      )}
      style={style}
      data-testid={`workflow-node-${node.id}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", getNodeColor())}>
          {getNodeIcon()}
        </div>
        <div>
          <p className="font-medium text-foreground text-sm capitalize">{node.type}</p>
          <p className="text-xs text-muted-foreground">
            {node.action.replace(/_/g, " ")}
          </p>
        </div>
      </div>
      <AppIntegration
        app={{
          id: node.appType,
          name: node.appName,
          icon: getAppIcon(),
          color: getAppColor()
        }}
        className="w-full"
      />
    </div>
  );
}
