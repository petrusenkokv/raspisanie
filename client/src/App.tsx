import { BrowserRouter, Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "@/lib/queryClient";
import { GymSchedulePage } from "@/pages/gym-schedule";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={GymSchedulePage} />
        <Route>
          <GymSchedulePage />
        </Route>
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}