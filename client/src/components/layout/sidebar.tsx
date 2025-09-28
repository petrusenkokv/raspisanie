import { Link, useLocation } from "wouter";
import { ChartGantt, BarChart3, Settings, Layers3, Puzzle, Home } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Workflows", href: "/workflows", icon: ChartGantt },
  { name: "Templates", href: "/templates", icon: Layers3 },
  { name: "Integrations", href: "/integrations", icon: Puzzle },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Brand Settings", href: "/brand-settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { currentUser, setBrandModalOpen } = useWorkflowStore();

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col" data-testid="sidebar">
      {/* Logo and Brand */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <ChartGantt className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-sidebar-foreground">FlowCraft</span>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
            <span className="text-accent-foreground font-medium text-sm">
              {currentUser?.initials}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {currentUser?.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {currentUser?.company}
            </p>
          </div>
          <button 
            className="text-muted-foreground hover:text-sidebar-foreground"
            onClick={() => setBrandModalOpen(true)}
            data-testid="user-settings-button"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
