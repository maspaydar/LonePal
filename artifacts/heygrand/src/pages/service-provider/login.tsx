import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Wrench, CheckCircle, ArrowLeft, LogIn, LogOut } from "lucide-react";
import {
  getServiceProviderIdentity,
  setServiceProviderIdentity,
  clearServiceProviderIdentity,
} from "@/lib/service-provider-auth";

export default function ServiceProviderLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const existing = getServiceProviderIdentity();

  const [serviceProviderId, setServiceProviderId] = useState(
    existing ? String(existing.serviceProviderId) : "",
  );
  const [entityId, setEntityId] = useState(existing ? String(existing.entityId) : "");
  const [signedIn, setSignedIn] = useState(Boolean(existing));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sp = Number(serviceProviderId);
    const ent = Number(entityId);
    if (!Number.isInteger(sp) || sp <= 0 || !Number.isInteger(ent) || ent <= 0) {
      toast({
        title: "Invalid details",
        description:
          "Enter the numeric Service Provider ID and Facility ID from your onboarding email.",
        variant: "destructive",
      });
      return;
    }
    setServiceProviderIdentity({ serviceProviderId: sp, entityId: ent });
    setSignedIn(true);
    toast({
      title: "Signed in",
      description: "Your service provider credentials are saved on this device.",
    });
  }

  function handleSignOut() {
    clearServiceProviderIdentity();
    setServiceProviderId("");
    setEntityId("");
    setSignedIn(false);
    toast({ title: "Signed out", description: "Your credentials were cleared from this device." });
  }

  if (signedIn) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1" data-testid="text-sp-signed-in-title">
                You're signed in
              </h2>
              <p className="text-muted-foreground text-sm">
                Your service provider credentials are saved on this device and will be used for the
                facilities you're approved for.
              </p>
            </div>
            <div className="w-full bg-muted rounded-lg p-4 text-left space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Service Provider ID</p>
                <p className="font-mono font-medium" data-testid="text-sp-id">{serviceProviderId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Facility ID</p>
                <p className="font-mono font-medium" data-testid="text-sp-entity-id">{entityId}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
              data-testid="button-sp-sign-out"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-sp-home">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary">
            <Wrench className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-sp-login-title">
              Service provider sign in
            </h1>
            <p className="text-sm text-muted-foreground">Access the facilities you're approved for</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>
              Enter the Service Provider ID and Facility ID from your onboarding email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="sp-id">Service Provider ID</Label>
                <Input
                  id="sp-id"
                  type="text"
                  inputMode="numeric"
                  value={serviceProviderId}
                  onChange={(e) => setServiceProviderId(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 1024"
                  required
                  data-testid="input-sp-id"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-entity-id">Facility ID</Label>
                <Input
                  id="sp-entity-id"
                  type="text"
                  inputMode="numeric"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 42"
                  required
                  data-testid="input-sp-entity-id"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!serviceProviderId || !entityId}
                data-testid="button-sp-login"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Not a partner yet?{" "}
            <Link
              to="/service-provider/register"
              className="text-primary underline-offset-4 hover:underline"
              data-testid="link-sp-register"
            >
              Register as a service provider
            </Link>
          </p>
          <p>
            <Link to="/" className="text-primary underline-offset-4 hover:underline" data-testid="link-sp-home">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
