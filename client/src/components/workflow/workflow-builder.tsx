import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Play, Pause, Save } from "lucide-react";
import WorkflowNode from "./workflow-node";
import AppIntegration from "./app-integration";
import { type WorkflowNode as WorkflowNodeType, type WorkflowConnection } from "@shared/schema";

interface WorkflowBuilderProps {
  nodes?: WorkflowNodeType[];
  connections?: WorkflowConnection[];
  onSave?: (nodes: WorkflowNodeType[], connections: WorkflowConnection[]) => void;
  isPreview?: boolean;
}

export default function WorkflowBuilder({
  nodes = [],
  connections = [],
  onSave,
  isPreview = false
}: WorkflowBuilderProps) {
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNodeType[]>(nodes);
  const [workflowConnections, setWorkflowConnections] = useState<WorkflowConnection[]>(connections);
  const [isRunning, setIsRunning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const availableApps = [
    { id: "gmail", name: "Gmail", icon: "fas fa-envelope", color: "red-500" },
    { id: "slack", name: "Slack", icon: "fab fa-slack", color: "purple-600" },
    { id: "trello", name: "Trello", icon: "fas fa-tasks", color: "orange-500" },
    { id: "sheets", name: "Google Sheets", icon: "fab fa-google", color: "green-500" },
    { id: "hubspot", name: "HubSpot", icon: "fas fa-users", color: "orange-600" },
    { id: "twitter", name: "Twitter", icon: "fab fa-twitter", color: "blue-400" },
  ];

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(workflowNodes, workflowConnections);
    }
  }, [workflowNodes, workflowConnections, onSave]);

  const handleRunWorkflow = useCallback(() => {
    setIsRunning(!isRunning);
    // Simulate workflow execution
    setTimeout(() => {
      setIsRunning(false);
    }, 3000);
  }, [isRunning]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const appData = e.dataTransfer.getData("application/json");
    if (!appData) return;

    const app = JSON.parse(appData);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newNode: WorkflowNodeType = {
      id: `node-${Date.now()}`,
      type: workflowNodes.length === 0 ? "trigger" : "action",
      appName: app.name,
      appType: app.id,
      action: workflowNodes.length === 0 ? "trigger_event" : "perform_action",
      position: {
        x: e.clientX - rect.left - 100,
        y: e.clientY - rect.top - 50
      },
      config: {}
    };

    setWorkflowNodes(prev => [...prev, newNode]);
  }, [workflowNodes.length]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Default nodes for preview
  const defaultNodes: WorkflowNodeType[] = [
    {
      id: "trigger-1",
      type: "trigger",
      appName: "Gmail",
      appType: "email",
      action: "new_email",
      position: { x: 50, y: 20 },
      config: {}
    },
    {
      id: "action-1", 
      type: "action",
      appName: "AI Parser",
      appType: "ai",
      action: "parse_content",
      position: { x: 350, y: 20 },
      config: {}
    },
    {
      id: "action-2",
      type: "action", 
      appName: "Slack",
      appType: "communication",
      action: "send_message",
      position: { x: 650, y: 20 },
      config: {}
    }
  ];

  const displayNodes = isPreview ? defaultNodes : workflowNodes;

  return (
    <Card className="border border-border" data-testid="workflow-builder">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Workflow Builder</h3>
            <p className="text-sm text-muted-foreground">
              {isPreview ? "Drag and drop to create custom workflows" : "Build your automation workflow"}
            </p>
          </div>
          {!isPreview && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave} data-testid="save-workflow">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
              <Button 
                onClick={handleRunWorkflow}
                disabled={displayNodes.length === 0}
                data-testid="run-workflow"
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run
                  </>
                )}
              </Button>
            </div>
          )}
          {isPreview && (
            <Button data-testid="open-builder">
              <Edit className="w-4 h-4 mr-2" />
              Open Builder
            </Button>
          )}
        </div>
      </div>
      
      <div className="p-6">
        <div 
          ref={canvasRef}
          className="relative bg-muted rounded-lg p-8 min-h-[400px]"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          data-testid="workflow-canvas"
        >
          {/* SVG for connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
              </marker>
            </defs>
            {displayNodes.length > 1 && (
              <>
                <path className="connection-line" d="M 250 60 Q 300 60 350 60" />
                {displayNodes.length > 2 && (
                  <path className="connection-line" d="M 550 60 Q 600 60 650 60" />
                )}
              </>
            )}
          </svg>
          
          {/* Workflow Nodes */}
          <div className="relative" style={{ zIndex: 2 }}>
            {displayNodes.map((node) => (
              <WorkflowNode
                key={node.id}
                node={node}
                isRunning={isRunning}
                style={{
                  position: "absolute",
                  left: `${node.position.x}px`,
                  top: `${node.position.y}px`
                }}
              />
            ))}
            
            {displayNodes.length === 0 && !isPreview && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-muted-foreground/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Edit className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h4 className="text-lg font-medium text-foreground mb-2">Start Building Your Workflow</h4>
                  <p className="text-muted-foreground">Drag apps from the sidebar to create your first automation</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Available Apps Sidebar */}
          <div className="absolute right-4 top-4 w-48 bg-card rounded-lg border border-border p-4" data-testid="available-apps">
            <h4 className="font-medium text-foreground mb-3 text-sm">Available Apps</h4>
            <div className="space-y-2">
              {availableApps.map((app) => (
                <AppIntegration
                  key={app.id}
                  app={app}
                  draggable={!isPreview}
                  className="w-full justify-start cursor-move"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
