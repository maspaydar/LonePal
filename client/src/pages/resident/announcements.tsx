import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ResidentLayout } from "@/components/resident-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, RefreshCw, Loader2, Inbox } from "lucide-react";
import {
  residentSync,
  getStoredResident,
  formatRelativeTime,
  type SyncResponse,
} from "@/lib/resident-auth";
import { useToast } from "@/hooks/use-toast";

export default function ResidentAnnouncementsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resident = getStoredResident();
  const [announcements, setAnnouncements] = useState<SyncResponse["announcements"]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!resident) return;
    if (!silent) setLoading(true);
    try {
      const res = await residentSync(resident.entityId, resident.id);
      setAnnouncements(res.announcements || []);
    } catch (err: any) {
      if (!silent) {
        toast({
          title: "Could not load updates",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!resident) {
      setLocation("/resident/login");
      return;
    }
    load();
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  return (
    <ResidentLayout active="announcements">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-announcements-title">
              <Megaphone className="w-8 h-8 text-blue-600" />
              Community Updates
            </h1>
            <p className="text-base text-muted-foreground mt-1">
              News and messages from your facility
            </p>
          </div>
          <Button
            variant="ghost"
            size="lg"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            data-testid="button-refresh-announcements"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-6 h-6 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : announcements.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-base" data-testid="text-empty-announcements">
                No announcements yet. We'll let you know when staff posts something.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <Card key={a.id} className="shadow-sm" data-testid={`card-announcement-${a.id}`}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="font-semibold text-base"
                          data-testid={`text-announcement-sender-${a.id}`}
                        >
                          {a.senderName || "Facility"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(a.createdAt)}
                        </span>
                      </div>
                      <p
                        className="text-base leading-relaxed whitespace-pre-wrap"
                        data-testid={`text-announcement-message-${a.id}`}
                      >
                        {a.message}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ResidentLayout>
  );
}
