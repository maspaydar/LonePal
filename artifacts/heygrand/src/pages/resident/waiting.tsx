import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { residentMe, residentLogout, getStoredResident } from "@/lib/resident-auth";

export default function ResidentWaitingPage() {
  const [, setLocation] = useLocation();
  const resident = getStoredResident();

  useEffect(() => {
    if (!resident) {
      setLocation("/resident/login");
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const me = await residentMe();
        if (!cancelled && me?.resident?.unitId) {
          setLocation("/resident/home");
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [resident, setLocation]);

  const handleSignOut = async () => {
    await residentLogout();
    setLocation("/resident/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Home className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-waiting-title">
            Almost ready!
          </h1>
          <p className="text-base text-muted-foreground" data-testid="text-waiting-message">
            Your account is set up. We're waiting for staff to assign you to a room.
            Once that's done, you'll be brought to your home screen automatically.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Checking every 30 seconds…</span>
          </div>
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="mt-4"
            data-testid="button-waiting-signout"
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
