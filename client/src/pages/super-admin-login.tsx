import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, KeyRound } from "lucide-react";

export default function SuperAdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"login" | "2fa" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.error || "Invalid credentials", variant: "destructive" });
        return;
      }
      if (data.requires2FA) {
        setPendingToken(data.pendingToken);
        setStep("2fa");
        toast({ title: "2FA Required", description: "Enter the code from your authenticator app" });
      } else {
        localStorage.setItem("superAdminToken", data.token);
        localStorage.setItem("superAdmin", JSON.stringify(data.admin));
        setLocation("/super-admin/dashboard");
      }
    } catch {
      toast({ title: "Error", description: "Connection failed", variant: "destructive" });
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
          "Authorization": `Bearer ${pendingToken}`,
        },
        body: JSON.stringify({ email, token: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.error || "Invalid code", variant: "destructive" });
        return;
      }
      localStorage.setItem("superAdminToken", data.token);
      localStorage.setItem("superAdmin", JSON.stringify(data.admin));
      setLocation("/super-admin/dashboard");
    } catch {
      toast({ title: "Error", description: "Verification failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Registration failed", description: data.error, variant: "destructive" });
        return;
      }
      localStorage.setItem("superAdminToken", data.token);
      localStorage.setItem("superAdmin", JSON.stringify(data.admin));
      setLocation("/super-admin/dashboard");
    } catch {
      toast({ title: "Error", description: "Registration failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle data-testid="text-super-admin-title">EchoPath Super Admin</CardTitle>
          <CardDescription>
            {step === "login" && "Sign in to manage all facility installations"}
            {step === "2fa" && "Enter your authenticator code"}
            {step === "register" && "Create your Super Admin account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                <Lock className="w-4 h-4 mr-2" />
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <div className="text-center">
                <Button variant="link" type="button" onClick={() => setStep("register")} data-testid="link-register">
                  Create new account
                </Button>
              </div>
            </form>
          )}

          {step === "2fa" && (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <div className="space-y-2">
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
              <Button type="submit" className="w-full" disabled={isLoading || totpCode.length !== 6} data-testid="button-verify-2fa">
                <KeyRound className="w-4 h-4 mr-2" />
                {isLoading ? "Verifying..." : "Verify"}
              </Button>
              <div className="text-center">
                <Button variant="link" type="button" onClick={() => { setStep("login"); setTotpCode(""); }} data-testid="link-back-login">
                  Back to login
                </Button>
              </div>
            </form>
          )}

          {step === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  data-testid="input-fullname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regEmail">Email</Label>
                <Input
                  id="regEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-reg-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regPassword">Password</Label>
                <Input
                  id="regPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-reg-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
              <div className="text-center">
                <Button variant="link" type="button" onClick={() => setStep("login")} data-testid="link-back-to-login">
                  Already have an account? Sign in
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
