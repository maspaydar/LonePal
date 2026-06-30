import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSuperAdminAuth } from "@/hooks/use-super-admin-auth";
import { Shield, Eye, EyeOff, KeyRound, Ban, LifeBuoy, Smartphone } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type LoginResult =
  | { kind: "super"; token: string; admin: Record<string, any> }
  | { kind: "super-2fa"; pendingToken: string }
  | { kind: "company"; session: any }
  | { kind: "failed"; status: number; code?: string; message?: string };

// Single server endpoint determines the account type and tells us where to
// route. The password is only ever submitted to this one endpoint.
async function unifiedLogin(identifier: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        kind: "failed",
        status: res.status,
        code: typeof data.error === "string" ? data.error : undefined,
        message: data.message || (typeof data.error === "string" ? data.error : undefined),
      };
    }

    if (data.accountType === "super") {
      if (data.requires2FA) return { kind: "super-2fa", pendingToken: data.pendingToken };
      return { kind: "super", token: data.token, admin: data.admin };
    }
    if (data.accountType === "company") {
      return { kind: "company", session: { token: data.token, user: data.user, entity: data.entity } };
    }
    return { kind: "failed", status: res.status, message: "Unexpected response from server" };
  } catch {
    return { kind: "failed", status: 0, message: "Connection failed" };
  }
}

// Maps a failed login into a tailored inline message. Subscription, wrong-portal,
// and deactivated cases each get a friendlier, more actionable presentation than
// a plain error toast.
type LoginErrorKind = "subscription" | "resident" | "deactivated" | "generic";
interface LoginErrorView {
  kind: LoginErrorKind;
  title: string;
  description: string;
}

function classifyLoginError(result: Extract<LoginResult, { kind: "failed" }>): LoginErrorView {
  const code = result.code;
  if (code === "subscription_paused") {
    return {
      kind: "subscription",
      title: "Subscription expired",
      description:
        result.message ||
        "Your facility's subscription has expired. Renew to restore access to your dashboard.",
    };
  }
  if (code === "subscription_cancelled") {
    return {
      kind: "subscription",
      title: "Subscription cancelled",
      description:
        result.message ||
        "Your facility's subscription has been cancelled. Contact support to reactivate your account.",
    };
  }
  if (result.status === 403 && /portal is for facility staff|residents must use/i.test(result.message || "")) {
    return {
      kind: "resident",
      title: "This is the staff sign-in",
      description:
        "It looks like you have a resident account. Use the resident sign-in to reach your companion app.",
    };
  }
  if (result.status === 401 && /deactivated/i.test(result.message || "")) {
    return {
      kind: "deactivated",
      title: "Account deactivated",
      description:
        "This account has been deactivated. Please ask your facility administrator to restore your access.",
    };
  }
  return {
    kind: "generic",
    title: "Login failed",
    description: result.message || "Invalid credentials. Check your email/username and password.",
  };
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const company = useCompanyAuth();
  const superAdmin = useSuperAdminAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [step, setStep] = useState<"login" | "2fa">("login");
  const [totpCode, setTotpCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [loginError, setLoginError] = useState<LoginErrorView | null>(null);

  useEffect(() => {
    if (superAdmin.isAuthenticated()) {
      setLocation("/super-admin/dashboard");
    } else if (company.isAuthenticated()) {
      setLocation("/dashboard");
    }
  }, []);

  function applyResult(result: LoginResult): boolean {
    if (result.kind === "super") {
      superAdmin.setSession(result.token, result.admin);
      setLocation("/super-admin/dashboard");
      return true;
    }
    if (result.kind === "super-2fa") {
      setPendingToken(result.pendingToken);
      setPendingEmail(identifier);
      setStep("2fa");
      toast({ title: "Two-factor required", description: "Enter the code from your authenticator app." });
      return true;
    }
    if (result.kind === "company") {
      company.setSession(result.session);
      setLocation("/dashboard");
      return true;
    }
    return false;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);
    try {
      const result = await unifiedLogin(identifier, password);
      if (result.kind !== "failed") {
        applyResult(result);
        return;
      }

      const view = classifyLoginError(result);
      setLoginError(view);
      // Generic credential failures stay as a lightweight toast; the more
      // specific account-state cases get a persistent inline call-to-action.
      if (view.kind === "generic") {
        toast({ title: view.title, description: view.description, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/auth/verify-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ email: pendingEmail, token: totpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.error || "Invalid code", variant: "destructive" });
        return;
      }
      superAdmin.setSession(data.token, data.admin);
      setLocation("/super-admin/dashboard");
    } catch {
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-login-title">HeyGrand</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {step === "login" ? "Sign in" : "Two-factor verification"}
            </CardTitle>
            <CardDescription>
              {step === "login"
                ? "Use your email or username — we'll take you to the right place."
                : "Enter the 6-digit code from your authenticator app."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && loginError.kind !== "generic" && (
                  <Alert variant="destructive" data-testid={`alert-login-${loginError.kind}`}>
                    {loginError.kind === "subscription" && <LifeBuoy className="h-4 w-4" />}
                    {loginError.kind === "resident" && <Smartphone className="h-4 w-4" />}
                    {loginError.kind === "deactivated" && <Ban className="h-4 w-4" />}
                    <AlertTitle data-testid="text-login-error-title">{loginError.title}</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p data-testid="text-login-error-description">{loginError.description}</p>
                      {loginError.kind === "subscription" && (
                        <a
                          href="mailto:support@heygrand.com?subject=Subscription%20renewal"
                          className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                          data-testid="link-contact-support"
                        >
                          <LifeBuoy className="h-3.5 w-3.5" />
                          Contact support to renew
                        </a>
                      )}
                      {loginError.kind === "resident" && (
                        <button
                          type="button"
                          onClick={() => setLocation("/resident/login")}
                          className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                          data-testid="link-go-resident-login"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          Go to resident sign in
                        </button>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1">
                  <Label htmlFor="identifier">Email or Username</Label>
                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or username"
                    autoComplete="username"
                    required
                    data-testid="input-username"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !identifier || !password}
                  data-testid="button-login"
                >
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}

            {step === "2fa" && (
              <form onSubmit={handleVerify2FA} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="totp">Authenticator Code</Label>
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="text-center text-2xl tracking-widest"
                    required
                    autoFocus
                    data-testid="input-totp"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || totpCode.length !== 6}
                  data-testid="button-verify-2fa"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {isLoading ? "Verifying..." : "Verify"}
                </Button>
                <div className="text-center">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setStep("login");
                      setTotpCode("");
                    }}
                    data-testid="link-back-login"
                  >
                    Back to login
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {step === "login" && (
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>
              New to HeyGrand?{" "}
              <button
                type="button"
                onClick={() => setLocation("/register")}
                className="text-primary underline-offset-4 hover:underline"
                data-testid="link-register"
              >
                Register your facility
              </button>
            </p>
            <p>
              Are you a resident?{" "}
              <button
                type="button"
                onClick={() => setLocation("/resident/login")}
                className="text-primary underline-offset-4 hover:underline"
                data-testid="link-resident-login"
              >
                Resident sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
