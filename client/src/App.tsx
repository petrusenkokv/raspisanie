import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Workflows from "@/pages/workflows";
import Templates from "@/pages/templates";
import Integrations from "@/pages/integrations";
import Analytics from "@/pages/analytics";
import BrandSettings from "@/pages/brand-settings";
import Sidebar from "@/components/layout/sidebar";
import BrandModal from "@/components/modals/brand-modal";

function Router() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/workflows" component={Workflows} />
          <Route path="/templates" component={Templates} />
          <Route path="/integrations" component={Integrations} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/brand-settings" component={BrandSettings} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <BrandModal />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
