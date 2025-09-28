import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWorkflowSchema, insertTemplateSchema, insertIntegrationSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Workflows
  app.get("/api/workflows", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const workflows = await storage.getWorkflows(userId);
      res.json(workflows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  });

  app.get("/api/workflows/:id", async (req, res) => {
    try {
      const workflow = await storage.getWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch workflow" });
    }
  });

  app.post("/api/workflows", async (req, res) => {
    try {
      const workflowData = insertWorkflowSchema.parse(req.body);
      const workflow = await storage.createWorkflow(workflowData);
      res.status(201).json(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid workflow data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create workflow" });
    }
  });

  app.put("/api/workflows/:id", async (req, res) => {
    try {
      const updates = req.body;
      const workflow = await storage.updateWorkflow(req.params.id, updates);
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ message: "Failed to update workflow" });
    }
  });

  app.delete("/api/workflows/:id", async (req, res) => {
    try {
      await storage.deleteWorkflow(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete workflow" });
    }
  });

  // Templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const templateData = insertTemplateSchema.parse(req.body);
      const template = await storage.createTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Integrations
  app.get("/api/integrations", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const integrations = await storage.getIntegrations(userId);
      res.json(integrations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations", async (req, res) => {
    try {
      const integrationData = insertIntegrationSchema.parse(req.body);
      const integration = await storage.createIntegration(integrationData);
      res.status(201).json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid integration data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  app.put("/api/integrations/:id", async (req, res) => {
    try {
      const updates = req.body;
      const integration = await storage.updateIntegration(req.params.id, updates);
      res.json(integration);
    } catch (error) {
      res.status(500).json({ message: "Failed to update integration" });
    }
  });

  // Analytics
  app.get("/api/analytics/stats", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      const stats = await storage.getWorkflowStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // User brand settings
  app.put("/api/users/:id/brand-settings", async (req, res) => {
    try {
      const { id } = req.params;
      const { brandSettings } = req.body;
      
      const user = await storage.updateUserBrandSettings(id, brandSettings);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update brand settings" });
    }
  });

  // Mock app integrations data
  app.get("/api/available-apps", async (req, res) => {
    const availableApps = [
      { id: "gmail", name: "Gmail", type: "email", icon: "fas fa-envelope", color: "red-500", connected: false },
      { id: "slack", name: "Slack", type: "communication", icon: "fab fa-slack", color: "purple-600", connected: false },
      { id: "trello", name: "Trello", type: "productivity", icon: "fas fa-tasks", color: "orange-500", connected: false },
      { id: "sheets", name: "Google Sheets", type: "spreadsheet", icon: "fab fa-google", color: "green-500", connected: false },
      { id: "hubspot", name: "HubSpot", type: "crm", icon: "fas fa-users", color: "orange-600", connected: false },
      { id: "twitter", name: "Twitter", type: "social", icon: "fab fa-twitter", color: "blue-400", connected: false },
      { id: "zapier", name: "Zapier", type: "automation", icon: "fas fa-bolt", color: "orange-500", connected: false },
      { id: "github", name: "GitHub", type: "development", icon: "fab fa-github", color: "gray-900", connected: false },
      { id: "salesforce", name: "Salesforce", type: "crm", icon: "fab fa-salesforce", color: "blue-600", connected: false },
      { id: "mailchimp", name: "MailChimp", type: "email-marketing", icon: "fab fa-mailchimp", color: "yellow-500", connected: false }
    ];
    
    res.json(availableApps);
  });

  const httpServer = createServer(app);
  return httpServer;
}
