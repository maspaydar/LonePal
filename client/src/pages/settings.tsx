import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Database, Wifi, Shield } from "lucide-react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

export default function SettingsPage() {
  const { toast } = useToast();
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();

  const { data: entities } = useQuery<any[]>({
    queryKey: ["/api/entities"],
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/seed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/dashboard`] });
      toast({ title: "Demo data loaded" });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground">System configuration and management</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> Data Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Load demo data to populate the system with sample residents, sensors, and scenario configurations.
            </p>
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-load-demo"
            >
              {seedMutation.isPending ? "Loading..." : "Load Demo Data"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="h-4 w-4" /> ADT Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Configure your ADT webhook endpoint to receive motion sensor events.
            </p>
            <div className="p-3 rounded-md bg-muted">
              <p className="text-xs font-mono text-muted-foreground break-all">
                POST {window.location.origin}/api/webhook/adt
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Send JSON payload with deviceId, eventType, and optional timestamp fields.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Entities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entities?.map((entity: any) => (
              <div key={entity.id} className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">{entity.name}</p>
                  <p className="text-xs text-muted-foreground">{entity.type} - {entity.address}</p>
                </div>
                <Badge variant={entity.isActive ? "secondary" : "outline"} className="text-xs">
                  {entity.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
            {(!entities || entities.length === 0) && (
              <p className="text-sm text-muted-foreground">No entities configured. Load demo data to create one.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" /> AI Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI check-ins are powered by Google Gemini 1.5 Flash. Provide a GEMINI_API_KEY to enable personalized AI conversations.
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Model: gemini-1.5-flash</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Without an API key, the system uses placeholder messages for check-ins.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
