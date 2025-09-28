import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/header";
import { useWorkflowStore } from "@/store/workflow-store";
import { Search, Settings, Link as LinkIcon, Unlink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Integrations() {
  const { currentUser } = useWorkflowStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch available apps
  const { data: availableApps = [] } = useQuery({
    queryKey: ["/api/available-apps"],
  });

  // Fetch user integrations
  const { data: userIntegrations = [] } = useQuery({
    queryKey: ["/api/integrations"],
    queryFn: async () => {
      const response = await fetch(`/api/integrations?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  // Connect integration mutation
  const connectIntegration = useMutation({
    mutationFn: async (appData: any) => {
      return apiRequest("POST", "/api/integrations", {
        userId: currentUser?.id,
        appName: appData.name,
        appType: appData.type,
        isConnected: true,
        credentials: {}
      });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Integration connected",
        description: `${variables.name} has been connected successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect integration",
        variant: "destructive",
      });
    },
  });

  // Disconnect integration mutation
  const disconnectIntegration = useMutation({
    mutationFn: async (integrationId: string) => {
      return apiRequest("PUT", `/api/integrations/${integrationId}`, {
        isConnected: false
      });
    },
    onSuccess: () => {
      toast({
        title: "Integration disconnected",
        description: "The integration has been disconnected successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnection failed",
        description: error.message || "Failed to disconnect integration",
        variant: "destructive",
      });
    },
  });

  const categories = [
    { id: "all", name: "All Apps" },
    { id: "email", name: "Email" },
    { id: "communication", name: "Communication" },
    { id: "productivity", name: "Productivity" },
    { id: "crm", name: "CRM" },
    { id: "social", name: "Social Media" },
    { id: "automation", name: "Automation" },
    { id: "development", name: "Development" },
  ];

  // Map user integrations to app IDs
  const connectedAppIds = new Set(userIntegrations.map((integration: any) => integration.appName.toLowerCase().replace(/\s+/g, '')));

  const filteredApps = (availableApps as any[]).filter((app: any) => {
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || app.type === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleConnect = (app: any) => {
    connectIntegration.mutate(app);
  };

  const handleDisconnect = (app: any) => {
    const integration = userIntegrations.find((int: any) => 
      int.appName.toLowerCase().replace(/\s+/g, '') === app.id
    );
    
    if (integration && confirm(`Are you sure you want to disconnect ${app.name}?`)) {
      disconnectIntegration.mutate(integration.id);
    }
  };

  const isAppConnected = (app: any) => {
    return connectedAppIds.has(app.id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Integrations" 
        subtitle="Connect your favorite apps and services"
      />
      
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-integrations"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                className="whitespace-nowrap"
                data-testid={`category-${category.id}`}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Connected Apps Summary */}
        <Card data-testid="connected-summary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Connected Apps</h3>
                <p className="text-sm text-muted-foreground">
                  You have {userIntegrations.filter((int: any) => int.isConnected).length} apps connected
                </p>
              </div>
              <Badge variant="default" className="text-lg px-3 py-1">
                {userIntegrations.filter((int: any) => int.isConnected).length}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Apps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredApps.map((app: any) => {
            const isConnected = isAppConnected(app);
            
            return (
              <Card 
                key={app.id} 
                className={`hover:shadow-md transition-all ${isConnected ? 'ring-2 ring-accent/20' : ''}`}
                data-testid={`app-card-${app.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center">
                    <div className={`w-16 h-16 bg-${app.color}/10 rounded-lg flex items-center justify-center mb-4`}>
                      <i className={`${app.icon} text-${app.color} text-2xl`}></i>
                    </div>
                    
                    <h3 className="font-semibold text-foreground mb-2">{app.name}</h3>
                    <Badge 
                      variant={isConnected ? "default" : "outline"} 
                      className="mb-4"
                    >
                      {isConnected ? "Connected" : "Available"}
                    </Badge>
                    
                    <div className="flex gap-2 w-full">
                      {isConnected ? (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            data-testid={`configure-${app.id}`}
                          >
                            <Settings className="w-4 h-4 mr-1" />
                            Settings
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleDisconnect(app)}
                            disabled={disconnectIntegration.isPending}
                            data-testid={`disconnect-${app.id}`}
                          >
                            <Unlink className="w-4 h-4 mr-1" />
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={() => handleConnect(app)}
                          disabled={connectIntegration.isPending}
                          data-testid={`connect-${app.id}`}
                        >
                          <LinkIcon className="w-4 h-4 mr-1" />
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
              <Search className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No apps found</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Try adjusting your search terms or category filter to find the apps you're looking for.
            </p>
            <Button variant="outline" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
              Clear Filters
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
