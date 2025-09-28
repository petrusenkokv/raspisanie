import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/header";
import AppIntegration from "@/components/workflow/app-integration";
import { Search, ArrowRight, Eye, Star } from "lucide-react";
import { type Template } from "@shared/schema";

export default function Templates() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/templates"],
  });

  const categories = [
    { id: "all", name: "All Templates" },
    { id: "Lead Management", name: "Lead Management" },
    { id: "Social Media", name: "Social Media" },
    { id: "Team Communication", name: "Team Communication" },
    { id: "Data Management", name: "Data Management" },
    { id: "E-commerce", name: "E-commerce" },
  ];

  const filteredTemplates = (templates as Template[]).filter((template: Template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getAppIcon = (appName: string) => {
    const iconMap: Record<string, string> = {
      "Google Forms": "fas fa-wpforms",
      "HubSpot": "fas fa-users",
      "Scheduler": "fas fa-calendar",
      "Twitter": "fab fa-twitter",
      "Webhook": "fas fa-bell",
      "Slack": "fab fa-slack",
    };
    return iconMap[appName] || "fas fa-cog";
  };

  const getAppColor = (appName: string) => {
    const colorMap: Record<string, string> = {
      "Google Forms": "red-500",
      "HubSpot": "orange-600",
      "Scheduler": "purple-500",
      "Twitter": "blue-400",
      "Webhook": "yellow-500",
      "Slack": "purple-600",
    };
    return colorMap[appName] || "gray-500";
  };

  const handleUseTemplate = (template: Template) => {
    // In a real app, this would create a new workflow from the template
    console.log("Using template:", template.name);
  };

  const handlePreviewTemplate = (template: Template) => {
    // In a real app, this would show a detailed preview modal
    console.log("Previewing template:", template.name);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Templates" 
        subtitle="Pre-built workflows to get you started quickly"
      />
      
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-templates"
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

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-full mb-4"></div>
                  <div className="h-8 bg-muted rounded mb-4"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template: Template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow" data-testid={`template-card-${template.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3 fill-current text-yellow-500" />
                      {template.usageCount}
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-foreground text-lg mb-2">{template.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{template.description}</p>
                  
                  {/* App Integration Flow */}
                  <div className="flex items-center gap-2 mb-4 overflow-x-auto">
                    {template.nodes?.slice(0, 3).map((node, index) => (
                      <div key={node.id} className="flex items-center gap-2">
                        <AppIntegration
                          app={{
                            id: node.appType,
                            name: node.appName,
                            icon: getAppIcon(node.appName),
                            color: getAppColor(node.appName)
                          }}
                          className="text-xs px-2 py-1"
                        />
                        {index < Math.min(template.nodes.length - 1, 2) && (
                          <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    ))}
                    {template.nodes.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{template.nodes.length - 3} more</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handlePreviewTemplate(template)}
                      className="flex-1"
                      data-testid={`preview-template-${template.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleUseTemplate(template)}
                      className="flex-1"
                      data-testid={`use-template-${template.id}`}
                    >
                      Use Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
              <Search className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No templates found</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Try adjusting your search terms or category filter to find what you're looking for.
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
