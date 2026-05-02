import { Link, useLocation } from "wouter";
import { Home, MessageCircle, Megaphone, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { residentLogout, getStoredResident } from "@/lib/resident-auth";
import type { ReactNode } from "react";

interface ResidentLayoutProps {
  children: ReactNode;
  active?: "home" | "chat" | "announcements";
  hideNav?: boolean;
}

export function ResidentLayout({ children, active, hideNav }: ResidentLayoutProps) {
  const [, setLocation] = useLocation();
  const resident = getStoredResident();

  const handleLogout = async () => {
    await residentLogout();
    setLocation("/resident/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <Link href="/resident/home" data-testid="link-resident-home">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
              HG
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">HeyGrand</div>
              {resident && (
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="text-resident-name"
                >
                  Hello, {resident.preferredName || resident.anonymousUsername}
                </div>
              )}
            </div>
          </div>
        </Link>
        <Button
          variant="ghost"
          size="lg"
          onClick={handleLogout}
          data-testid="button-resident-logout"
          className="text-base"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Sign out
        </Button>
      </header>

      <main className="flex-1 overflow-auto">{children}</main>

      {!hideNav && (
        <nav
          className="border-t bg-white dark:bg-slate-900 shadow-lg"
          data-testid="nav-resident-bottom"
        >
          <div className="grid grid-cols-3 max-w-2xl mx-auto">
            <NavItem
              to="/resident/home"
              icon={<Home className="w-7 h-7" />}
              label="Home"
              active={active === "home"}
              testId="nav-link-home"
            />
            <NavItem
              to="/resident/chat"
              icon={<MessageCircle className="w-7 h-7" />}
              label="Chat"
              active={active === "chat"}
              testId="nav-link-chat"
            />
            <NavItem
              to="/resident/announcements"
              icon={<Megaphone className="w-7 h-7" />}
              label="Updates"
              active={active === "announcements"}
              testId="nav-link-announcements"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  active,
  testId,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  testId: string;
}) {
  return (
    <Link href={to} data-testid={testId}>
      <div
        className={`flex flex-col items-center justify-center gap-1 py-3 cursor-pointer transition-colors ${
          active
            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
}
