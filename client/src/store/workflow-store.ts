import { create } from 'zustand';
import { type Workflow, type Template, type Integration, type WorkflowNode, type WorkflowConnection } from '@shared/schema';

interface WorkflowStore {
  // Current user (mock)
  currentUser: { id: string; name: string; company: string; initials: string; brandSettings?: any } | null;
  
  // Workflows
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  
  // Templates
  templates: Template[];
  
  // Integrations
  integrations: Integration[];
  availableApps: any[];
  
  // Analytics
  stats: {
    activeWorkflows: number;
    tasksExecuted: number;
    connectedApps: number;
    timeSaved: number;
  };
  
  // UI State
  isBrandModalOpen: boolean;
  isWorkflowBuilderOpen: boolean;
  
  // Actions
  setCurrentUser: (user: any) => void;
  setWorkflows: (workflows: Workflow[]) => void;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  setTemplates: (templates: Template[]) => void;
  setIntegrations: (integrations: Integration[]) => void;
  setAvailableApps: (apps: any[]) => void;
  setStats: (stats: any) => void;
  setBrandModalOpen: (open: boolean) => void;
  setWorkflowBuilderOpen: (open: boolean) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  // Initial state
  currentUser: {
    id: 'user-1',
    name: 'John Doe',
    company: 'Acme Corp',
    initials: 'JD'
  },
  workflows: [],
  currentWorkflow: null,
  templates: [],
  integrations: [],
  availableApps: [],
  stats: {
    activeWorkflows: 0,
    tasksExecuted: 0,
    connectedApps: 0,
    timeSaved: 0
  },
  isBrandModalOpen: false,
  isWorkflowBuilderOpen: false,
  
  // Actions
  setCurrentUser: (user) => set({ currentUser: user }),
  setWorkflows: (workflows) => set({ workflows }),
  setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),
  setTemplates: (templates) => set({ templates }),
  setIntegrations: (integrations) => set({ integrations }),
  setAvailableApps: (apps) => set({ availableApps: apps }),
  setStats: (stats) => set({ stats }),
  setBrandModalOpen: (open) => set({ isBrandModalOpen: open }),
  setWorkflowBuilderOpen: (open) => set({ isWorkflowBuilderOpen: open }),
}));
