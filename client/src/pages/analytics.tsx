import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/header";
import { useWorkflowStore } from "@/store/workflow-store";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  Zap, 
  Users, 
  Calendar,
  BarChart3,
  Download
} from "lucide-react";

export default function Analytics() {
  const { currentUser } = useWorkflowStore();

  // Fetch analytics data
  const { data: stats } = useQuery({
    queryKey: ["/api/analytics/stats"],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/stats?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  // Fetch workflows for performance analysis
  const { data: workflows = [] } = useQuery({
    queryKey: ["/api/workflows"],
    queryFn: async () => {
      const response = await fetch(`/api/workflows?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  // Fetch integrations for app usage
  const { data: integrations = [] } = useQuery({
    queryKey: ["/api/integrations"],
    queryFn: async () => {
      const response = await fetch(`/api/integrations?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const handleExportData = () => {
    // In a real app, this would export analytics data
    console.log("Exporting analytics data...");
  };

  // Calculate performance metrics
  const activeWorkflows = workflows.filter((w: any) => w.status === "active").length;
  const totalWorkflows = workflows.length;
  const connectedApps = integrations.filter((i: any) => i.isConnected).length;
  
  // Mock time series data for charts (in a real app, this would come from the API)
  const weeklyExecutions = [
    { day: "Mon", executions: 45 },
    { day: "Tue", executions: 52 },
    { day: "Wed", executions: 48 },
    { day: "Thu", executions: 61 },
    { day: "Fri", executions: 55 },
    { day: "Sat", executions: 38 },
    { day: "Sun", executions: 42 },
  ];

  const topWorkflows = workflows
    .filter((w: any) => w.status === "active")
    .slice(0, 5)
    .map((w: any, index: number) => ({
      ...w,
      executions: Math.floor(Math.random() * 100) + 20, // Mock execution count
      successRate: Math.floor(Math.random() * 20) + 80, // Mock success rate
    }));

  const appUsageStats = integrations
    .filter((i: any) => i.isConnected)
    .slice(0, 6)
    .map((i: any, index: number) => ({
      ...i,
      usage: Math.floor(Math.random() * 50) + 10, // Mock usage count
      trend: Math.random() > 0.5 ? "up" : "down",
      change: Math.floor(Math.random() * 30) + 5,
    }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Analytics" 
        subtitle="Monitor your workflow performance and insights"
        actionLabel="Export Data"
        onAction={handleExportData}
      />
      
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card data-testid="total-executions-metric">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Executions</p>
                  <p className="text-2xl font-bold text-foreground">{stats?.tasksExecuted || 0}</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <TrendingUp className="w-4 h-4 text-accent mr-1" />
                <span className="text-accent font-medium">+15%</span>
                <span className="text-muted-foreground ml-2">from last week</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="success-rate-metric">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-foreground">94.2%</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <TrendingUp className="w-4 h-4 text-accent mr-1" />
                <span className="text-accent font-medium">+2.1%</span>
                <span className="text-muted-foreground ml-2">from last week</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="avg-execution-time-metric">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Execution Time</p>
                  <p className="text-2xl font-bold text-foreground">2.4s</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <TrendingDown className="w-4 h-4 text-accent mr-1" />
                <span className="text-accent font-medium">-0.3s</span>
                <span className="text-muted-foreground ml-2">faster than last week</span>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="active-workflows-metric">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Workflows</p>
                  <p className="text-2xl font-bold text-foreground">{activeWorkflows}</p>
                </div>
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm">
                <span className="text-muted-foreground">of {totalWorkflows} total workflows</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Execution Trends and Top Workflows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Execution Trends */}
          <Card data-testid="execution-trends-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Weekly Execution Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {weeklyExecutions.map((day, index) => (
                  <div key={day.day} className="flex items-center gap-4">
                    <div className="w-12 text-sm font-medium text-muted-foreground">
                      {day.day}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary rounded-full h-2 transition-all duration-300"
                            style={{ width: `${(day.executions / 70) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-foreground w-8">
                          {day.executions}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Performing Workflows */}
          <Card data-testid="top-workflows">
            <CardHeader>
              <CardTitle>Top Performing Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topWorkflows.length > 0 ? (
                  topWorkflows.map((workflow: any, index: number) => (
                    <div 
                      key={workflow.id} 
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                      data-testid={`top-workflow-${workflow.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">#{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{workflow.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {workflow.executions} executions
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="default" className="text-xs">
                          {workflow.successRate}% success
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No active workflows to analyze</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* App Usage Statistics */}
        <Card data-testid="app-usage-stats">
          <CardHeader>
            <CardTitle>App Usage Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {appUsageStats.length > 0 ? (
                appUsageStats.map((app: any) => (
                  <div 
                    key={app.id} 
                    className="flex items-center justify-between p-4 rounded-lg border border-border"
                    data-testid={`app-usage-${app.appName.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                        <i className="fas fa-puzzle-piece text-muted-foreground"></i>
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">{app.appName}</p>
                        <p className="text-xs text-muted-foreground">{app.usage} uses</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        {app.trend === "up" ? (
                          <TrendingUp className="w-3 h-3 text-accent" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-destructive" />
                        )}
                        <span className={`text-xs font-medium ${
                          app.trend === "up" ? "text-accent" : "text-destructive"
                        }`}>
                          {app.change}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8">
                  <p className="text-muted-foreground">No connected apps to analyze</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance Insights */}
        <Card data-testid="performance-insights">
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Recommendations</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
                    <div className="w-2 h-2 bg-accent rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Optimize high-frequency workflows</p>
                      <p className="text-xs text-muted-foreground">
                        Consider caching or batching for workflows running more than 50 times per day
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Connect more integrations</p>
                      <p className="text-xs text-muted-foreground">
                        Users with 8+ connected apps save 40% more time on average
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Schedule maintenance</p>
                      <p className="text-xs text-muted-foreground">
                        Review and update your workflows monthly for optimal performance
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Time Savings</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">This week</span>
                    <span className="text-sm font-medium text-foreground">12.3 hours</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">This month</span>
                    <span className="text-sm font-medium text-foreground">{stats?.timeSaved || 0} hours</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">All time</span>
                    <span className="text-sm font-medium text-foreground">156.7 hours</span>
                  </div>
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Projected monthly savings</span>
                      <span className="text-lg font-bold text-accent">68.2 hours</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
