import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCompanyAuthHeaders, getCompanyUser } from "@/hooks/use-company-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  CheckCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Zap,
  Shield,
  Users,
  AlertCircle,
} from "lucide-react";

interface SubscriptionStatus {
  status: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: number | null;
}

interface PriceRow {
  product_id: string;
  product_name: string;
  product_description: string | null;
  price_id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const FEATURES = [
  "AI-powered resident monitoring",
  "Real-time safety alerts",
  "Smart speaker integration",
  "Unlimited residents & sensors",
  "Digital twin personas",
  "Community broadcasts",
  "24/7 incident logging",
  "Priority support",
];

export default function BillingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const headers = getCompanyAuthHeaders();
  const currentUser = getCompanyUser();

  if (currentUser && currentUser.role !== "admin") {
    setLocation("/");
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const successParam = urlParams.get("success");
  const cancelledParam = urlParams.get("cancelled");

  const { data: subStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/company/subscription-status"],
    queryFn: async () => {
      const res = await fetch("/api/company/subscription-status", { headers });
      if (!res.ok) return { status: null, trialEndsAt: null, daysRemaining: null, stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null };
      return res.json();
    },
  });

  const { data: pricesData, isLoading: pricesLoading } = useQuery<{ prices: PriceRow[] }>({
    queryKey: ["/api/company/billing/prices"],
    queryFn: async () => {
      const res = await fetch("/api/company/billing/prices", { headers });
      if (!res.ok) return { prices: [] };
      return res.json();
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await fetch("/api/company/billing/checkout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      return data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Portal error", description: err.message, variant: "destructive" });
    },
  });

  const prices = pricesData?.prices || [];
  const status = subStatus?.status;
  const isActive = status === "active";
  const isTrial = status === "trial";
  const isPaused = status === "paused" || status === "cancelled";
  const hasSubscription = !!subStatus?.stripeSubscriptionId;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-billing-title">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your HeyGrand subscription</p>
      </div>

      {successParam && (
        <div data-testid="banner-success" className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-medium">Subscription activated!</p>
            <p className="text-sm">Welcome aboard. Your facility now has full access to HeyGrand.</p>
          </div>
        </div>
      )}

      {cancelledParam && (
        <div data-testid="banner-cancelled" className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">Checkout was cancelled. You can try again below.</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {isActive && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0" data-testid="badge-plan-active">Active Subscription</Badge>}
                  {isTrial && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0" data-testid="badge-plan-trial">Free Trial</Badge>}
                  {isPaused && <Badge variant="destructive" data-testid="badge-plan-paused">Paused</Badge>}
                  {!status && <Badge variant="outline">No plan</Badge>}
                </div>
                {isTrial && subStatus?.daysRemaining !== null && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {subStatus.daysRemaining === 0 ? "Trial expires today" : `${subStatus.daysRemaining} day${subStatus.daysRemaining === 1 ? "" : "s"} remaining`}
                  </p>
                )}
                {isActive && subStatus?.currentPeriodEnd && (
                  <p className="text-sm text-muted-foreground">
                    Next billing date: {formatDate(subStatus.currentPeriodEnd)}
                  </p>
                )}
                {isPaused && (
                  <p className="text-sm text-muted-foreground">
                    Your subscription has expired. Subscribe below to restore full access.
                  </p>
                )}
              </div>
              {hasSubscription && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  data-testid="button-manage-billing"
                >
                  {portalMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Manage Billing
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(!isActive || !hasSubscription) && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              {isTrial ? "Upgrade to a paid plan" : isPaused ? "Reactivate your subscription" : "Choose a plan"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              All plans include every feature — no limitations, no tiers.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {pricesLoading ? (
              <Card className="animate-pulse">
                <CardContent className="p-6 h-32" />
              </Card>
            ) : prices.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">No plans available yet. Please contact support.</p>
                </CardContent>
              </Card>
            ) : (
              prices.map((price) => {
                const interval = price.recurring?.interval;
                const isYearly = interval === "year";
                return (
                  <Card key={price.price_id} className={`relative border-2 ${isYearly ? "border-primary" : "border-border"}`} data-testid={`card-price-${price.price_id}`}>
                    {isYearly && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground text-xs">Best value</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{price.product_name}</CardTitle>
                      <CardDescription>
                        <span className="text-2xl font-bold text-foreground">{formatAmount(price.unit_amount, price.currency)}</span>
                        <span className="text-muted-foreground">/{interval || "month"}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {price.product_description && (
                        <p className="text-sm text-muted-foreground">{price.product_description}</p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => checkoutMutation.mutate(price.price_id)}
                        disabled={checkoutMutation.isPending}
                        data-testid={`button-subscribe-${price.price_id}`}
                      >
                        {checkoutMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                        {isTrial ? "Subscribe Now" : "Reactivate"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <Card className="bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Everything included</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isActive && hasSubscription && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" /> Your subscription includes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground pb-4">
        <p>Questions about billing? <a href="mailto:support@heygrand.com" className="underline">Contact support</a></p>
      </div>
    </div>
  );
}
