import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSuperAdminAuth } from "@/hooks/use-super-admin-auth";
import { Shield, Eye, EyeOff, KeyRound } from "lucide-react";

type LoginResult =
  | { kind: "super"; token: string; admin: Record<string, any> }
  | { kind: "super-2fa"; pendingToken: string }
  | { kind: "company"; session: any }
  | { kind: "failed"; status: number; message?: string };

async function trySuperAdmin(identifier: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch("/api/super-admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { kind: "failed", status: res.status, message: data.error };
    if (data.requires2FA) return { kind: "super-2fa", pendingToken: data.pendingToken };
    return { kind: "super", token: data.token, admin: data.admin };
  } catch {
    return { kind: "failed", status: 0, message: "Connection failed" };
  }
}

async function tryCompany(identifier: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch("/api/company/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: identifier, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { kind: "failed", status: res.status, message: data.message || data.error };
    return { kind: "company", session: data };
  } catch {
    return { kind: "failed", status: 0, message: "Connection failed" };
  }
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
    try {
      // Probe the most likely backend first based on the identifier shape:
      // emails → super admin, plain usernames → facility (company) users.
      const looksLikeEmail = identifier.includes("@");
      const attempts = looksLikeEmail
        ? [trySuperAdmin, tryCompany]
        : [tryCompany, trySuperAdmin];

      let lastFailure: LoginResult | null = null;
      for (const attempt of attempts) {
        const result = await attempt(identifier, password);
        if (result.kind !== "failed") {
          applyResult(result);
          return;
        }
        lastFailure = result;
      }

      toast({
        title: "Login failed",
        description: lastFailure?.message || "Invalid credentials. Check your email/username and password.",
        variant: "destructive",
      });
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
