import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Users,
  Shield,
  Bell,
  Settings,
  Activity,
  Radio,
  Zap,
  Building2,
  UserCog,
  LogOut,
  CreditCard,
  FileText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompanyAuth } from "@/hooks/use-company-auth";

interface NavItem {
  title: string;
  familyTitle?: string;
  url: string;
  icon: typeof LayoutDashboard;
  facilityOnly?: boolean;
}

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Residents", familyTitle: "Loved One", url: "/residents", icon: Users },
  { title: "Active Scenarios", familyTitle: "Check-ins", url: "/scenarios", icon: Shield },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Activity Log", url: "/activity", icon: Activity },
  { title: "Sensors", familyTitle: "Devices", url: "/sensors", icon: Radio },
  { title: "Units", url: "/units", icon: Building2, facilityOnly: true },
];

const configItems: NavItem[] = [
  { title: "Scenario Rules", familyTitle: "Check-in Rules", url: "/scenario-config", icon: Zap },
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  unreadAlerts?: number;
  activeScenarios?: number;
}

export function AppSidebar({ unreadAlerts = 0, activeScenarios = 0 }: AppSidebarProps) {
  const [location] = useLocation();
  const { getUser, getEntity, logout } = useCompanyAuth();
  const user = getUser();
  const entity = getEntity();
  const isAdmin = user?.role === "admin";
  const isFamily = entity?.type === "family";

  const labelOf = (item: NavItem) => (isFamily && item.familyTitle ? item.familyTitle : item.title);
  const visibleNavItems = navItems.filter((item) => !(isFamily && item.facilityOnly));
  const visibleConfigItems = configItems.filter((item) => item.title !== "Billing" || isAdmin);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary shrink-0">
            <span className="text-xs font-bold text-primary-foreground leading-none">
              {entity ? entity.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "HG"}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" data-testid="text-company-name">
              {entity ? entity.name : "HeyGrand"}
            </h2>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-app-title">
              Powered by HeyGrand
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isFamily ? "Home" : "Monitoring"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex-1">{labelOf(item)}</span>
                        {item.title === "Alerts" && unreadAlerts > 0 && (
                          <Badge variant="destructive" className="text-xs" data-testid="badge-unread-alerts">
                            {unreadAlerts}
                          </Badge>
                        )}
                        {item.title === "Active Scenarios" && activeScenarios > 0 && (
                          <Badge className="text-xs" data-testid="badge-active-scenarios">
                            {activeScenarios}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleConfigItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{labelOf(item)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin && !isFamily && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={location === "/user-management"}>
                    <Link href="/user-management" data-testid="link-nav-user-management">
                      <UserCog className="w-4 h-4" />
                      <span>User Management</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && !isFamily && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild data-active={location === "/reports"}>
                    <Link href="/reports" data-testid="link-nav-reports">
                      <FileText className="w-4 h-4" />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        {user && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium truncate" data-testid="text-sidebar-username">{user.username}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize" data-testid="badge-user-role">
              {user.role}
            </Badge>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={logout}
          data-testid="button-logout"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
