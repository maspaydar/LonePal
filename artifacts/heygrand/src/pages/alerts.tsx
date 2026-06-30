import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCircle, AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "emergency": return <AlertOctagon className="h-4 w-4 text-status-busy" />;
    case "critical": return <AlertTriangle className="h-4 w-4 text-status-busy" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-status-away" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function getSeverityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "emergency": return "destructive";
    case "critical": return "destructive";
    case "warning": return "default";
    default: return "secondary";
  }
}

export default function Alerts() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { toast } = useToast();

  const { data: alertsList, isLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/alerts`],
    enabled: !!eid,
  });

  const ackMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/alerts/${id}/acknowledge`, { acknowledgedBy: "staff" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/alerts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/dashboard`] });
      toast({ title: "Alert acknowledged" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-alerts-title">Alerts</h1>
        <p className="text-muted-foreground">{alertsList?.length || 0} total alerts</p>
      </div>

      {(!alertsList || alertsList.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Bell className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-alerts">No alerts recorded</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alertsList.map((alert: any) => (
            <Card
              key={alert.id}
              className={alert.isRead ? "opacity-70" : ""}
              data-testid={`card-alert-${alert.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium">{alert.title}</h3>
                      <Badge variant={getSeverityVariant(alert.severity)} className="text-xs">
                        {alert.severity}
                      </Badge>
                      {alert.isAcknowledged && (
                        <Badge variant="outline" className="text-xs">Acknowledged</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!alert.isAcknowledged && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ackMutation.mutate(alert.id)}
                      disabled={ackMutation.isPending}
                      data-testid={`button-ack-alert-${alert.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
