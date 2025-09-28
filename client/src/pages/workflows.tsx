import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/header";
import WorkflowBuilder from "@/components/workflow/workflow-builder";
import { useWorkflowStore } from "@/store/workflow-store";
import { Play, Pause, Edit, Trash2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Workflow, type WorkflowNode, type WorkflowConnection } from "@shared/schema";

export default function Workflows() {
  const { currentUser } = useWorkflowStore();
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch workflows
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["/api/workflows"],
    queryFn: async () => {
      const response = await fetch(`/api/workflows?userId=${currentUser?.id}`);
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  // Create workflow mutation
  const createWorkflow = useMutation({
    mutationFn: async (workflowData: any) => {
      return apiRequest("POST", "/api/workflows", workflowData);
    },
    onSuccess: () => {
      toast({
        title: "Workflow created",
        description: "Your new workflow has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setIsBuilderOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating workflow",
        description: error.message || "Failed to create workflow",
        variant: "destructive",
      });
    },
  });

  // Update workflow mutation
  const updateWorkflow = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return apiRequest("PUT", `/api/workflows/${id}`, updates);
    },
    onSuccess: () => {
      toast({
        title: "Workflow saved",
        description: "Your workflow has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setIsBuilderOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error saving workflow",
        description: error.message || "Failed to save workflow",
        variant: "destructive",
      });
    },
  });

  // Delete workflow mutation
  const deleteWorkflow = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/workflows/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Workflow deleted",
        description: "The workflow has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting workflow",
        description: error.message || "Failed to delete workflow",
        variant: "destructive",
      });
    },
  });

  const handleCreateWorkflow = () => {
    if (!currentUser?.id) return;

    const newWorkflow = {
      userId: currentUser.id,
      name: "New Workflow",
      description: "A new automated workflow",
      status: "draft",
      nodes: [],
      connections: [],
    };

    createWorkflow.mutate(newWorkflow);
  };

  const handleSaveWorkflow = (nodes: WorkflowNode[], connections: WorkflowConnection[]) => {
    if (!selectedWorkflow) return;

    updateWorkflow.mutate({
      id: selectedWorkflow.id,
      updates: { nodes, connections, status: "active" }
    });
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setIsBuilderOpen(true);
  };

  const handleToggleStatus = (workflow: Workflow) => {
    const newStatus = workflow.status === "active" ? "paused" : "active";
    updateWorkflow.mutate({
      id: workflow.id,
      updates: { status: newStatus }
    });
  };

  const handleDeleteWorkflow = (id: string) => {
    if (confirm("Are you sure you want to delete this workflow?")) {
      deleteWorkflow.mutate(id);
    }
  };

  if (isBuilderOpen) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={selectedWorkflow ? `Edit: ${selectedWorkflow.name}` : "Create Workflow"}
          subtitle="Build your automation workflow"
          actionLabel="Back to Workflows"
          onAction={() => setIsBuilderOpen(false)}
        />
        <div className="flex-1 p-6">
          <WorkflowBuilder
            nodes={selectedWorkflow?.nodes || []}
            connections={selectedWorkflow?.connections || []}
            onSave={handleSaveWorkflow}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header 
        title="Workflows" 
        subtitle="Manage your automated workflows"
        actionLabel="Create Workflow"
        onAction={handleCreateWorkflow}
        showImport
      />
      
      <main className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : workflows.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow: Workflow) => (
              <Card key={workflow.id} className="hover:shadow-md transition-shadow" data-testid={`workflow-card-${workflow.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg mb-1">{workflow.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{workflow.description}</p>
                    </div>
                    <Badge 
                      variant={workflow.status === "active" ? "default" : workflow.status === "paused" ? "secondary" : "outline"}
                      data-testid={`workflow-status-${workflow.id}`}
                    >
                      {workflow.status}
                    </Badge>
                  </div>
                  
                  <div className="text-xs text-muted-foreground mb-4">
                    <p>Nodes: {workflow.nodes?.length || 0}</p>
                    <p>Last run: {workflow.lastRun ? new Date(workflow.lastRun as unknown as string).toLocaleDateString() : "Never"}</p>
                    <p>Created: {new Date(workflow.createdAt as unknown as string).toLocaleDateString()}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEditWorkflow(workflow)}
                      data-testid={`edit-workflow-${workflow.id}`}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleToggleStatus(workflow)}
                      data-testid={`toggle-workflow-${workflow.id}`}
                    >
                      {workflow.status === "active" ? (
                        <>
                          <Pause className="w-4 h-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                      data-testid={`delete-workflow-${workflow.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
              <Play className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No workflows yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Create your first automated workflow to start saving time on repetitive tasks.
            </p>
            <Button onClick={handleCreateWorkflow} data-testid="create-first-workflow">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Workflow
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
