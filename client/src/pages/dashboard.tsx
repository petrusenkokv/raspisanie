import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/header";
import WorkflowBuilder from "@/components/workflow/workflow-builder";
import AppIntegration from "@/components/workflow/app-integration";
import { useWorkflowStore } from "@/store/workflow-store";
import { Play, Clock, Link, TrendingUp, Ellipsis, Eye, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { currentUser, setStats, setTemplates, stats } = useWorkflowStore();

  // Fetch analytics stats
  const { data: analyticsData } = useQuery({
    queryKey: ["/api/analytics/stats"],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/stats?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ["/api/templates"],
  });

  // Fetch workflows for recent activity
  const { data: workflowsData } = useQuery({
    queryKey: ["/api/workflows"],
    queryFn: async () => {
      const response = await fetch(`/api/workflows?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  useEffect(() => {
    if (analyticsData) {
      setStats(analyticsData);
    }
  }, [analyticsData, setStats]);

  useEffect(() => {
    if (templatesData) {
      setTemplates(templatesData as any);
    }
  }, [templatesData, setTemplates]);

  const recentWorkflows = (workflowsData as any[])?.slice(0, 3) || [];
  const popularTemplates = (templatesData as any[])?.slice(0, 3) || [];

  const connectedApps = [
    { id: "gmail", name: "Gmail", icon: "fas fa-envelope", color: "red-500", connected: true },
    { id: "slack", name: "Slack", icon: "fab fa-slack", color: "purple-600", connected: true },
    { id: "trello", name: "Trello", icon: "fas fa-tasks", color: "orange-500", connected: true },
    { id: "sheets", name: "Google Sheets", icon: "fab fa-google", color: "green-500", connected: true },
    { id: "hubspot", name: "HubSpot", icon: "fas fa-users", color: "orange-600", connected: true },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Dashboard" 
        subtitle="Manage your automated workflows"
        showImport
      />
      
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card data-testid="active-workflows-stat">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Workflows</p>
                  <p className="text-2xl font-bold text-foreground">{stats.activeWorkflows}</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Play className="w-6 h-6 text-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-accent font-medium">+12%</span>
                <span className="text-muted-foreground ml-2">from last month</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="tasks-executed-stat">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tasks Executed</p>
                  <p className="text-2xl font-bold text-foreground">{stats.tasksExecuted.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-accent font-medium">+8%</span>
                <span className="text-muted-foreground ml-2">from last week</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="connected-apps-stat">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Connected Apps</p>
                  <p className="text-2xl font-bold text-foreground">{stats.connectedApps}</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Link className="w-6 h-6 text-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-muted-foreground">2 new this week</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="time-saved-stat">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Saved</p>
                  <p className="text-2xl font-bold text-foreground">{stats.timeSaved.toFixed(1)}h</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-muted-foreground">This month</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Workflows and Template Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Workflows */}
          <Card data-testid="recent-workflows">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Recent Workflows</h3>
                <Button variant="link" className="p-0 h-auto text-primary">View All</Button>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="space-y-4">
                {recentWorkflows.length > 0 ? (
                  recentWorkflows.map((workflow: any) => (
                    <div
                      key={workflow.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                      data-testid={`workflow-${workflow.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                          <Play className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{workflow.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Last run: {workflow.lastRun ? new Date(workflow.lastRun).toLocaleDateString() : "Never"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={workflow.status === "active" ? "default" : "secondary"}>
                          {workflow.status}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Ellipsis className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No workflows yet</p>
                    <Button className="mt-2" size="sm">Create Your First Workflow</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Popular Templates */}
          <Card data-testid="popular-templates">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Popular Templates</h3>
                <Button variant="link" className="p-0 h-auto text-primary">Browse All</Button>
              </div>
            </div>
            <CardContent className="p-6">
              <div className="space-y-4">
                {popularTemplates.map((template: any) => (
                  <div
                    key={template.id}
                    className="p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                    data-testid={`template-${template.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">{template.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <AppIntegration
                            app={{
                              id: template.nodes[0]?.appType || "app",
                              name: template.nodes[0]?.appName || "App",
                              icon: "fas fa-cog",
                              color: "blue-500"
                            }}
                          />
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <AppIntegration
                            app={{
                              id: template.nodes[1]?.appType || "app",
                              name: template.nodes[1]?.appName || "App", 
                              icon: "fas fa-cog",
                              color: "green-500"
                            }}
                          />
                        </div>
                      </div>
                      <Button size="sm" variant="outline" data-testid={`use-template-${template.id}`}>
                        Use
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workflow Builder Preview */}
        <WorkflowBuilder isPreview />

        {/* Connected Apps */}
        <Card data-testid="connected-apps">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Connected Apps</h3>
              <Button variant="outline" data-testid="add-integration">
                <Link className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {connectedApps.map((app) => (
                <div
                  key={app.id}
                  className="flex flex-col items-center p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                  data-testid={`connected-app-${app.id}`}
                >
                  <div className={`w-12 h-12 bg-${app.color}/10 rounded-lg flex items-center justify-center mb-3`}>
                    <i className={`${app.icon} text-${app.color} text-xl`}></i>
                  </div>
                  <span className="text-sm font-medium text-foreground">{app.name}</span>
                  <Badge variant="default" className="text-xs mt-1">Connected</Badge>
                </div>
              ))}
              <div className="flex flex-col items-center p-4 rounded-lg border border-border hover:bg-secondary/50 transition-colors cursor-pointer">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
                  <Link className="w-6 h-6 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">Add More</span>
                <span className="text-xs text-muted-foreground mt-1">Available</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
