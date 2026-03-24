import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useWebSocket } from "@/lib/websocket";
import { useCallback, type ReactNode } from "react";
import { useCompanyAuth, getCompanyEntityId } from "@/hooks/use-company-auth";

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
import Units from "@/pages/units";
import SuperAdminLogin from "@/pages/super-admin-login";
import SuperAdminDashboard from "@/pages/super-admin-dashboard";
import LoginPage from "@/pages/login";
import UserManagement from "@/pages/user-management";
import RegisterPage from "@/pages/register";
import VerifyEmailPage from "@/pages/verify-email";

function CompanyAuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useCompanyAuth();
  if (!isAuthenticated()) {
    return <Redirect to="/login" />;
  }
  return <>{children}</>;
}

function AdminOnlyGuard({ children }: { children: ReactNode }) {
  const { getUser } = useCompanyAuth();
  const user = getUser();
  if (!user || user.role !== "admin") {
    return <Redirect to="/" />;
  }
  return <>{children}</>;
}

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
      <Route path="/units" component={Units} />
      <Route path="/scenario-config" component={ScenarioConfig} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/conversations/:id" component={ConversationDetail} />
      <Route path="/user-management">
        <AdminOnlyGuard>
          <UserManagement />
        </AdminOnlyGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const eid = getCompanyEntityId();

  const { data: dashData } = useQuery<any>({
    queryKey: [`/api/entities/${eid}/dashboard`],
    refetchInterval: 15000,
    enabled: !!eid,
  });

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "scenario_triggered" || msg.type === "alert" || msg.type === "scenario_resolved" || msg.type === "motion_event") {
      const entityId = getCompanyEntityId();
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/dashboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/alerts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/active-scenarios`] });
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

function SuperAdminGuard({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("sa_token");
  if (!token) {
    return <Redirect to="/super-admin/login" />;
  }
  return <>{children}</>;
}

function SuperAdminRouter() {
  return (
    <Switch>
      <Route path="/super-admin/login" component={SuperAdminLogin} />
      <Route path="/super-admin/dashboard">
        <SuperAdminGuard>
          <SuperAdminDashboard />
        </SuperAdminGuard>
      </Route>
      <Route path="/super-admin/:rest*">
        <SuperAdminGuard>
          <Redirect to="/super-admin/dashboard" />
        </SuperAdminGuard>
      </Route>
      <Route path="/super-admin">
        <Redirect to="/super-admin/login" />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/super-admin/:rest*">
              <SuperAdminRouter />
            </Route>
            <Route path="/super-admin">
              <SuperAdminRouter />
            </Route>
            <Route path="/login" component={LoginPage} />
            <Route path="/register" component={RegisterPage} />
            <Route path="/verify-email" component={VerifyEmailPage} />
            <Route>
              <CompanyAuthGuard>
                <AppLayout />
              </CompanyAuthGuard>
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
