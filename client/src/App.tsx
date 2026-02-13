import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileAuthProvider, useMobileAuth } from "@/lib/mobile-auth";
import { useWebSocket } from "@/lib/websocket";
import { useCallback } from "react";
import { Redirect } from "wouter";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Residents from "@/pages/residents";
import ResidentDetail from "@/pages/resident-detail";
import Scenarios from "@/pages/scenarios";
import Alerts from "@/pages/alerts";
import ActivityLog from "@/pages/activity";
import Sensors from "@/pages/sensors";
import ScenarioConfig from "@/pages/scenario-config";
import SettingsPage from "@/pages/settings";
import ConversationDetail from "@/pages/conversation-detail";
import MobileLogin from "@/pages/mobile-login";
import MobileCompanion from "@/pages/mobile-companion";

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/residents" component={Residents} />
      <Route path="/residents/:id" component={ResidentDetail} />
      <Route path="/scenarios" component={Scenarios} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/activity" component={ActivityLog} />
      <Route path="/sensors" component={Sensors} />
      <Route path="/scenario-config" component={ScenarioConfig} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/conversations/:id" component={ConversationDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MobileAuthGuard() {
  const { user, token, isLoading } = useMobileAuth();
  if (isLoading) return null;
  if (!user || !token) return <Redirect to="/companion" />;
  return <MobileCompanion />;
}

function AppLayout() {
  const { data: dashData } = useQuery<any>({
    queryKey: ["/api/entities/1/dashboard"],
    refetchInterval: 15000,
  });

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "scenario_triggered" || msg.type === "alert" || msg.type === "scenario_resolved" || msg.type === "motion_event") {
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/active-scenarios"] });
    }
  }, []);

  useWebSocket(handleWsMessage);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          unreadAlerts={dashData?.unreadAlerts || 0}
          activeScenarios={dashData?.activeScenarios || 0}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AdminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  const [isCompanionRoute] = useRoute("/companion/*?");
  const [isCompanionRoot] = useRoute("/companion");

  if (isCompanionRoute || isCompanionRoot) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <MobileAuthProvider>
              <Switch>
                <Route path="/companion" component={MobileLogin} />
                <Route path="/companion/chat" component={MobileAuthGuard} />
                <Route>{() => <Redirect to="/companion" />}</Route>
              </Switch>
            </MobileAuthProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppLayout />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
