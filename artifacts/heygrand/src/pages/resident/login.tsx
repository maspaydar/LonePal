import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings } from "lucide-react";
import { residentLogin, isResidentAuthenticated } from "@/lib/resident-auth";

export default function ResidentLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [entityId, setEntityId] = useState("");
  const [showFacility, setShowFacility] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("hg_resident_facility_id");
    if (stored) setEntityId(stored);
    if (isResidentAuthenticated()) setLocation("/resident/home");
  }, [setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !pin || !entityId) {
      toast({
        title: "Missing info",
        description: "Please enter your username, PIN, and Facility ID.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const data = await residentLogin(username.trim(), pin.trim(), Number(entityId));
      localStorage.setItem("hg_resident_facility_id", entityId);
      if (data.isUnitAssigned) {
        setLocation("/resident/home");
      } else {
        setLocation("/resident/waiting");
      }
    } catch (err: any) {
      toast({
        title: "Sign in failed",
        description: err?.message || "Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl mb-3">
            HG
          </div>
          <CardTitle className="text-3xl">Welcome to HeyGrand</CardTitle>
          <p className="text-base text-muted-foreground mt-2">
            Sign in to chat with your companion
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="h-12 text-lg"
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin" className="text-base">
                PIN (4-6 digits)
              </Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 text-lg tracking-widest text-center"
                data-testid="input-pin"
              />
            </div>
            {showFacility ? (
              <div className="space-y-2">
                <Label htmlFor="entityId" className="text-base">
                  Facility ID
                </Label>
                <Input
                  id="entityId"
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="h-12 text-lg"
                  data-testid="input-facility-id"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFacility(true)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                data-testid="button-show-facility"
              >
                <Settings className="w-4 h-4" />
                {entityId ? `Facility ID: ${entityId} (change)` : "Set Facility ID"}
              </button>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-lg"
              disabled={submitting}
              data-testid="button-sign-in"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
