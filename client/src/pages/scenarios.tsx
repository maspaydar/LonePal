import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, Clock, MapPin, CheckCircle } from "lucide-react";

function getScenarioLabel(type: string) {
  switch (type) {
    case "inactivity_gentle": return "Gentle Check-in";
    case "inactivity_urgent": return "Urgent Check-in";
    case "fall_detected": return "Fall Detected";
    case "bathroom_extended": return "Extended Bathroom";
    case "shower_extended": return "Extended Shower";
    default: return type;
  }
}

function getScenarioSeverity(type: string): "default" | "secondary" | "destructive" {
  switch (type) {
    case "fall_detected": return "destructive";
    case "inactivity_urgent": return "destructive";
    case "bathroom_extended":
    case "shower_extended": return "default";
    default: return "secondary";
  }
}

export default function Scenarios() {
  const { toast } = useToast();

  const { data: scenarios, isLoading } = useQuery<any[]>({
    queryKey: ["/api/entities/1/active-scenarios"],
  });

  const { data: residents } = useQuery<any[]>({
    queryKey: ["/api/entities/1/residents"],
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/scenarios/${id}/resolve`, { resolvedBy: "staff" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/active-scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/entities/1/alerts"] });
      toast({ title: "Scenario resolved" });
    },
  });

  const getResidentName = (residentId: number) => {
    const r = residents?.find((res: any) => res.id === residentId);
    return r ? `${r.preferredName || r.firstName} ${r.lastName}` : `Resident #${residentId}`;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Active Scenarios</h1>
        {[1, 2].map(i => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-scenarios-title">Active Scenarios</h1>
        <p className="text-muted-foreground">{scenarios?.length || 0} scenarios in progress</p>
      </div>

      {(!scenarios || scenarios.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Shield className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-scenarios">No active scenarios - all residents are safe</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {scenarios.map((scenario: any) => (
            <Card key={scenario.id} data-testid={`card-scenario-${scenario.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{getResidentName(scenario.residentId)}</h3>
                      <Badge variant={getScenarioSeverity(scenario.scenarioType)}>
                        {getScenarioLabel(scenario.scenarioType)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Escalation: {scenario.escalationLevel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started: {new Date(scenario.createdAt).toLocaleString()}
                      </span>
                      {scenario.triggerLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {scenario.triggerLocation}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolveMutation.mutate(scenario.id)}
                    disabled={resolveMutation.isPending}
                    data-testid={`button-resolve-${scenario.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Resolve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
