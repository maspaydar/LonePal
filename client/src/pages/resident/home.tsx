import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ResidentLayout } from "@/components/resident-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  residentSync,
  getStoredResident,
  formatRelativeTime,
  type SyncResponse,
} from "@/lib/resident-auth";
import { useToast } from "@/hooks/use-toast";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function statusVisuals(status: string, hasAlert: boolean) {
  if (hasAlert || status === "alert") {
    return {
      icon: <AlertTriangle className="w-12 h-12" />,
      label: "Needs Attention",
      desc: "We noticed something. Please tap Chat to check in.",
      bg: "bg-red-50 dark:bg-red-950/30",
      ring: "ring-red-200 dark:ring-red-900",
      text: "text-red-700 dark:text-red-300",
    };
  }
  if (status === "monitoring") {
    return {
      icon: <ShieldAlert className="w-12 h-12" />,
      label: "Monitoring",
      desc: "We're keeping an eye on things.",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      ring: "ring-amber-200 dark:ring-amber-900",
      text: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    icon: <ShieldCheck className="w-12 h-12" />,
    label: "All Secure",
    desc: "Everything looks great.",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    ring: "ring-emerald-200 dark:ring-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  };
}

export default function ResidentHomePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resident = getStoredResident();
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const dismissedAlertIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resident) {
      setLocation("/resident/login");
      return;
    }
    let cancelled = false;
    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await residentSync(resident.entityId, resident.id);
        if (cancelled) return;
        setData(res);
        if (res.safetyStatus.hasActiveAlert) {
          const sig = res.safetyStatus.activeScenarios;
          if (dismissedAlertIdRef.current !== sig) setCheckInOpen(true);
        } else {
          dismissedAlertIdRef.current = null;
          setCheckInOpen(false);
        }
      } catch (err: any) {
        if (!silent) {
          toast({
            title: "Sync issue",
            description: err?.message || "Could not refresh.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(() => load(true), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    if (!resident) return;
    setRefreshing(true);
    try {
      const res = await residentSync(resident.entityId, resident.id);
      setData(res);
    } catch (err: any) {
      toast({
        title: "Sync issue",
        description: err?.message || "Could not refresh.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const visuals = statusVisuals(
    data?.safetyStatus.current || "safe",
    data?.safetyStatus.hasActiveAlert || false,
  );

  return (
    <ResidentLayout active="home">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-3xl font-bold"
              data-testid="text-greeting"
            >
              {getGreeting()},{" "}
              {resident?.preferredName || resident?.anonymousUsername || "friend"}
            </h1>
            {data?.syncedAt && (
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-last-sync">
                Updated {formatRelativeTime(data.syncedAt)}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="lg"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            data-testid="button-refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-6 h-6 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card
              className={`${visuals.bg} ring-2 ${visuals.ring} border-0 shadow-sm`}
              data-testid="card-safety-status"
            >
              <CardContent className="pt-6 pb-6 flex items-center gap-4">
                <div className={visuals.text}>{visuals.icon}</div>
                <div className="flex-1">
                  <div
                    className={`text-2xl font-bold ${visuals.text}`}
                    data-testid="text-safety-label"
                  >
                    {visuals.label}
                  </div>
                  <div className="text-base text-muted-foreground mt-1">
                    {visuals.desc}
                  </div>
                </div>
              </CardContent>
            </Card>

            {data?.lastAIMessage && (
              <Card
                className="border-blue-200 dark:border-blue-900 shadow-sm"
                data-testid="card-last-message"
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                        Your companion said
                      </div>
                      <p
                        className="text-base leading-relaxed"
                        data-testid="text-last-ai-message"
                      >
                        {data.lastAIMessage.content}
                      </p>
                      <div className="text-xs text-muted-foreground mt-2">
                        {formatRelativeTime(data.lastAIMessage.createdAt)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                size="lg"
                className="h-24 text-lg flex-col gap-2"
                onClick={() => setLocation("/resident/chat")}
                data-testid="button-open-chat"
              >
                <MessageCircle className="w-7 h-7" />
                Talk with companion
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-24 text-lg flex-col gap-2 relative"
                onClick={() => setLocation("/resident/announcements")}
                data-testid="button-open-announcements"
              >
                <Megaphone className="w-7 h-7" />
                Community updates
                {data?.announcements && data.announcements.length > 0 && (
                  <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-red-500 text-white text-xs font-bold">
                    {data.announcements.length}
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={checkInOpen}
        onOpenChange={(open) => {
          setCheckInOpen(open);
          if (!open && data) {
            dismissedAlertIdRef.current = data.safetyStatus.activeScenarios;
          }
        }}
      >
        <DialogContent data-testid="dialog-check-in">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              Quick check-in
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              We noticed some unusual activity. Could you take a moment to chat
              with your companion and let us know you're okay?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setCheckInOpen(false)}
              data-testid="button-checkin-later"
            >
              Later
            </Button>
            <Button
              onClick={() => {
                setCheckInOpen(false);
                setLocation("/resident/chat");
              }}
              data-testid="button-checkin-chat"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Chat now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResidentLayout>
  );
}
