import { 
  type User, 
  type InsertUser, 
  type Workflow, 
  type InsertWorkflow,
  type Template,
  type InsertTemplate,
  type Integration,
  type InsertIntegration,
  type WorkflowRun,
  type InsertWorkflowRun,
  type WorkflowNode,
  type WorkflowConnection
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBrandSettings(userId: string, brandSettings: any): Promise<User>;

  // Workflows
  getWorkflows(userId: string): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  createWorkflow(workflow: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;

  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;

  // Integrations
  getIntegrations(userId: string): Promise<Integration[]>;
  getIntegration(id: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration>;

  // Workflow Runs
  getWorkflowRuns(workflowId: string): Promise<WorkflowRun[]>;
  createWorkflowRun(run: InsertWorkflowRun): Promise<WorkflowRun>;
  updateWorkflowRun(id: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun>;

  // Analytics
  getWorkflowStats(userId: string): Promise<{
    activeWorkflows: number;
    tasksExecuted: number;
    connectedApps: number;
    timeSaved: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private templates: Map<string, Template> = new Map();
  private integrations: Map<string, Integration> = new Map();
  private workflowRuns: Map<string, WorkflowRun> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed popular templates
    const sampleTemplates: Template[] = [
      {
        id: "template-1",
        name: "Lead Capture to CRM",
        description: "Automatically add new form submissions to your CRM and send welcome emails",
        category: "Lead Management",
        nodes: [
          {
            id: "trigger-1",
            type: "trigger",
            appName: "Google Forms",
            appType: "forms",
            action: "new_form_submission",
            position: { x: 100, y: 100 },
            config: {}
          },
          {
            id: "action-1",
            type: "action",
            appName: "HubSpot",
            appType: "crm",
            action: "create_contact",
            position: { x: 400, y: 100 },
            config: {}
          }
        ],
        connections: [
          {
            id: "conn-1",
            sourceId: "trigger-1",
            targetId: "action-1"
          }
        ],
        isPublic: true,
        usageCount: 247,
        createdAt: new Date()
      },
      {
        id: "template-2",
        name: "Content Publishing",
        description: "Schedule and publish content across multiple social media platforms",
        category: "Social Media",
        nodes: [
          {
            id: "trigger-2",
            type: "trigger",
            appName: "Scheduler",
            appType: "scheduler",
            action: "scheduled_time",
            position: { x: 100, y: 100 },
            config: {}
          },
          {
            id: "action-2",
            type: "action",
            appName: "Twitter",
            appType: "social",
            action: "post_tweet",
            position: { x: 400, y: 100 },
            config: {}
          }
        ],
        connections: [
          {
            id: "conn-2",
            sourceId: "trigger-2",
            targetId: "action-2"
          }
        ],
        isPublic: true,
        usageCount: 189,
        createdAt: new Date()
      },
      {
        id: "template-3",
        name: "Team Notifications",
        description: "Send Slack notifications when important events happen in your tools",
        category: "Team Communication",
        nodes: [
          {
            id: "trigger-3",
            type: "trigger",
            appName: "Webhook",
            appType: "webhook",
            action: "webhook_received",
            position: { x: 100, y: 100 },
            config: {}
          },
          {
            id: "action-3",
            type: "action",
            appName: "Slack",
            appType: "communication",
            action: "send_message",
            position: { x: 400, y: 100 },
            config: {}
          }
        ],
        connections: [
          {
            id: "conn-3",
            sourceId: "trigger-3",
            targetId: "action-3"
          }
        ],
        isPublic: true,
        usageCount: 156,
        createdAt: new Date()
      }
    ];

    sampleTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      company: insertUser.company || null,
      id, 
      createdAt: new Date(),
      brandSettings: null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserBrandSettings(userId: string, brandSettings: any): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    
    const updatedUser = { ...user, brandSettings };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getWorkflows(userId: string): Promise<Workflow[]> {
    return Array.from(this.workflows.values()).filter(w => w.userId === userId);
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    return this.workflows.get(id);
  }

  async createWorkflow(insertWorkflow: InsertWorkflow): Promise<Workflow> {
    const id = randomUUID();
    const workflow: Workflow = {
      ...insertWorkflow,
      id,
      status: insertWorkflow.status || "draft",
      description: insertWorkflow.description || null,
      nodes: (insertWorkflow.nodes || []) as WorkflowNode[],
      connections: (insertWorkflow.connections || []) as WorkflowConnection[],
      lastRun: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.workflows.set(id, workflow);
    return workflow;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const workflow = this.workflows.get(id);
    if (!workflow) throw new Error("Workflow not found");
    
    const updatedWorkflow = { ...workflow, ...updates, updatedAt: new Date() };
    this.workflows.set(id, updatedWorkflow);
    return updatedWorkflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
  }

  async getTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values()).filter(t => t.isPublic);
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const id = randomUUID();
    const template: Template = {
      ...insertTemplate,
      id,
      nodes: (insertTemplate.nodes || []) as WorkflowNode[],
      connections: (insertTemplate.connections || []) as WorkflowConnection[],
      isPublic: insertTemplate.isPublic !== undefined ? insertTemplate.isPublic : true,
      usageCount: insertTemplate.usageCount || 0,
      createdAt: new Date()
    };
    this.templates.set(id, template);
    return template;
  }

  async getIntegrations(userId: string): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(i => i.userId === userId);
  }

  async getIntegration(id: string): Promise<Integration | undefined> {
    return this.integrations.get(id);
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const id = randomUUID();
    const integration: Integration = {
      ...insertIntegration,
      id,
      isConnected: insertIntegration.isConnected !== undefined ? insertIntegration.isConnected : false,
      credentials: insertIntegration.credentials || null,
      lastSync: null,
      createdAt: new Date()
    };
    this.integrations.set(id, integration);
    return integration;
  }

  async updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration> {
    const integration = this.integrations.get(id);
    if (!integration) throw new Error("Integration not found");
    
    const updatedIntegration = { ...integration, ...updates };
    this.integrations.set(id, updatedIntegration);
    return updatedIntegration;
  }

  async getWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
    return Array.from(this.workflowRuns.values()).filter(r => r.workflowId === workflowId);
  }

  async createWorkflowRun(insertRun: InsertWorkflowRun): Promise<WorkflowRun> {
    const id = randomUUID();
    const run: WorkflowRun = {
      ...insertRun,
      id,
      logs: (insertRun.logs || []) as string[],
      startedAt: new Date(),
      completedAt: null
    };
    this.workflowRuns.set(id, run);
    return run;
  }

  async updateWorkflowRun(id: string, updates: Partial<WorkflowRun>): Promise<WorkflowRun> {
    const run = this.workflowRuns.get(id);
    if (!run) throw new Error("Workflow run not found");
    
    const updatedRun = { ...run, ...updates };
    this.workflowRuns.set(id, updatedRun);
    return updatedRun;
  }

  async getWorkflowStats(userId: string): Promise<{
    activeWorkflows: number;
    tasksExecuted: number;
    connectedApps: number;
    timeSaved: number;
  }> {
    const userWorkflows = await this.getWorkflows(userId);
    const userIntegrations = await this.getIntegrations(userId);
    
    const activeWorkflows = userWorkflows.filter(w => w.status === "active").length;
    const connectedApps = userIntegrations.filter(i => i.isConnected).length;
    
    // Mock calculations for demo
    const tasksExecuted = activeWorkflows * 52; // Assume ~52 tasks per active workflow
    const timeSaved = activeWorkflows * 1.77; // Assume ~1.77 hours saved per workflow

    return {
      activeWorkflows,
      tasksExecuted,
      connectedApps,
      timeSaved
    };
  }
}

export const storage = new MemStorage();
