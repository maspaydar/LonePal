import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Database, Wifi, Shield, CreditCard, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { useCompanyAuth, getCompanyAuthHeaders } from "@/hooks/use-company-auth";
import { Link } from "wouter";

interface SubscriptionStatus {
  status: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: number | null;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { getEntityId, getEntity } = useCompanyAuth();
  const eid = getEntityId();
  const entity = getEntity();
  const headers = getCompanyAuthHeaders();

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/seed"),
    onSuccess: (data: any) => {
      if (data?.alreadySeeded) {
        toast({ title: "Demo data already loaded", description: "This facility already has residents. No changes were made." });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/dashboard`] });
        toast({ title: "Demo data loaded" });
      }
    },
  });

  const { data: subStatus } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/company/subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/company/subscription-status", { headers });
      if (!res.ok) return { status: null, trialEndsAt: null, daysRemaining: null, stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null };
      return res.json();
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/company/billing/portal", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Portal access failed");
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const status = subStatus?.status;
  const isActive = status === "active";
  const isTrial = status === "trial";
  const isPaused = status === "paused" || status === "cancelled";
  const hasStripeCustomer = !!subStatus?.stripeCustomerId;

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
              <CreditCard className="h-4 w-4" /> Billing & Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {isActive && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs" data-testid="badge-settings-active">Active</Badge>}
              {isTrial && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0 text-xs" data-testid="badge-settings-trial">Free Trial</Badge>}
              {isPaused && <Badge variant="destructive" className="text-xs" data-testid="badge-settings-paused">Paused</Badge>}
            </div>
            {isTrial && subStatus?.daysRemaining !== null && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {subStatus.daysRemaining === 0 ? "Trial expires today" : `${subStatus.daysRemaining} day${subStatus.daysRemaining === 1 ? "" : "s"} remaining in trial`}
              </p>
            )}
            {isActive && subStatus?.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Next billing: {formatDate(subStatus.currentPeriodEnd)}
              </p>
            )}
            {!isActive && (
              <p className="text-sm text-muted-foreground">
                {isPaused ? "Your subscription has expired." : "Subscribe to unlock full access."}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild data-testid="button-view-billing">
                <Link to="/billing">View Plans</Link>
              </Button>
              {hasStripeCustomer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  data-testid="button-manage-billing-settings"
                >
                  {portalMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                  Manage
                </Button>
              )}
            </div>
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
              <Shield className="h-4 w-4" /> Your Facility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entity ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <div className="flex-1">
                  <p className="text-sm font-medium" data-testid="text-entity-name">{entity.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{entity.type}</p>
                </div>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No facility configured.</p>
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
