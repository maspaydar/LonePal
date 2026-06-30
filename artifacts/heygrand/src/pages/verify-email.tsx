import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Building2, ArrowRight } from "lucide-react";

type VerifyState = "loading" | "success" | "already_verified" | "error" | "expired";

interface VerifyResult {
  success: boolean;
  alreadyVerified?: boolean;
  message?: string;
  facilityName?: string;
  loginUsername?: string;
  trialEndsAt?: string;
  error?: string;
}

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<VerifyState>("loading");
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setState("error");
      setResult({ success: false, error: "No verification token provided." });
      return;
    }

    fetch(`/api/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data: VerifyResult = await res.json();
        if (res.status === 410) {
          setState("expired");
        } else if (!res.ok) {
          setState("error");
        } else if (data.alreadyVerified) {
          setState("already_verified");
        } else {
          setState("success");
        }
        setResult(data);
      })
      .catch(() => {
        setState("error");
        setResult({ success: false, error: "Network error. Please try again." });
      });
  }, []);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center mb-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-3">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">HeyGrand</h1>
        </div>

        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-5">
            {state === "loading" && (
              <>
                <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
                <div>
                  <h2 className="text-lg font-semibold">Verifying your email...</h2>
                  <p className="text-muted-foreground text-sm mt-1">Just a moment.</p>
                </div>
              </>
            )}

            {state === "success" && (
              <>
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" data-testid="icon-success" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" data-testid="text-verified-title">Email verified!</h2>
                  {result?.facilityName && (
                    <p className="text-muted-foreground text-sm mt-1">
                      <strong>{result.facilityName}</strong> is now on a 30-day free trial.
                    </p>
                  )}
                  {result?.trialEndsAt && (
                    <p className="text-sm mt-1 text-muted-foreground">
                      Trial ends: <strong>{formatDate(result.trialEndsAt)}</strong>
                    </p>
                  )}
                </div>
                {result?.loginUsername && (
                  <div className="w-full bg-muted rounded-lg p-3 text-left text-sm space-y-1">
                    <p className="text-muted-foreground">Your login username:</p>
                    <p className="font-mono font-medium" data-testid="text-login-username">{result.loginUsername}</p>
                    <p className="text-xs text-muted-foreground">Use the password you set during registration.</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  A welcome email with your credentials has been sent to your inbox.
                </p>
                <Button
                  onClick={() => setLocation("/login")}
                  className="w-full"
                  data-testid="button-go-to-dashboard"
                >
                  Go to login
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            )}

            {state === "already_verified" && (
              <>
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Already verified</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {result?.facilityName && <><strong>{result.facilityName}</strong> — your </>}
                    email was already verified.
                  </p>
                </div>
                <Button onClick={() => setLocation("/login")} className="w-full" data-testid="button-login">
                  Sign in
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            )}

            {state === "expired" && (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Link expired</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    This verification link has expired (links are valid for 24 hours). Please register again.
                  </p>
                </div>
                <Button onClick={() => setLocation("/register")} className="w-full" data-testid="button-re-register">
                  Register again
                </Button>
              </>
            )}

            {state === "error" && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-600" data-testid="icon-error" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Verification failed</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {result?.error || "This link is invalid or has already been used."}
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <Button variant="outline" onClick={() => setLocation("/register")} className="flex-1" data-testid="button-try-again">
                    Register again
                  </Button>
                  <Button onClick={() => setLocation("/login")} className="flex-1" data-testid="button-login-error">
                    Sign in
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
