import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity as ActivityIcon, Radio } from "lucide-react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

export default function ActivityLog() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { data: events, isLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/motion-events`],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        {[1, 2, 3, 4].map(i => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-activity-title">Activity Log</h1>
        <p className="text-muted-foreground">Recent motion sensor events</p>
      </div>

      {(!events || events.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ActivityIcon className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-events">
              No motion events recorded yet. Events will appear here when sensors detect activity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((event: any) => (
            <Card key={event.id} data-testid={`card-event-${event.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{event.eventType}</span>
                      <span className="text-sm text-muted-foreground">at {event.location}</span>
                    </div>
                    {event.residentId && (
                      <p className="text-xs text-muted-foreground">Resident #{event.residentId}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
