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

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Residents", url: "/residents", icon: Users },
  { title: "Active Scenarios", url: "/scenarios", icon: Shield },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Activity Log", url: "/activity", icon: Activity },
  { title: "Sensors", url: "/sensors", icon: Radio },
];

const configItems = [
  { title: "Scenario Rules", url: "/scenario-config", icon: Zap },
  { title: "Settings", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  unreadAlerts?: number;
  activeScenarios?: number;
}

export function AppSidebar({ unreadAlerts = 0, activeScenarios = 0 }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" data-testid="text-app-title">EchoPath Nexus</h2>
            <p className="text-xs text-muted-foreground">Safety Monitoring</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex-1">{item.title}</span>
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
              {configItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground">v1.0 - Multi-Tenant Safety System</p>
      </SidebarFooter>
    </Sidebar>
  );
}
