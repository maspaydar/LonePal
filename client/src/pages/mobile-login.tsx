import { useState } from "react";
import { useLocation } from "wouter";
import { useMobileAuth } from "@/lib/mobile-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";

export default function MobileLogin() {
  const { login, isLoading, error, clearError } = useMobileAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [entityId] = useState(1);

  const handleLogin = async () => {
    if (!username.trim() || !pin.trim()) return;
    const success = await login(username.trim(), pin.trim(), entityId);
    if (success) {
      setLocation("/companion/chat");
    }
  };

  const handlePinChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    if (error) clearError();
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (error) clearError();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mx-auto">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <h1
            className="text-3xl font-bold tracking-tight text-foreground"
            data-testid="text-app-title"
          >
            EchoPath
          </h1>
          <p className="text-xl text-muted-foreground">
            Your Personal Companion
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-3">
              <label
                htmlFor="username"
                className="block text-lg font-semibold text-foreground"
              >
                Your Username
              </label>
              <Input
                id="username"
                data-testid="input-username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="e.g. Resident_1234"
                className="h-14 text-lg px-4"
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-3">
              <label
                htmlFor="pin"
                className="block text-lg font-semibold text-foreground"
              >
                Your PIN
              </label>
              <div className="relative">
                <Input
                  id="pin"
                  data-testid="input-pin"
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  placeholder="4-6 digit PIN"
                  className="h-14 text-lg px-4 pr-14"
                  inputMode="numeric"
                  autoComplete="current-password"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid="button-toggle-pin"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                First time? Your PIN will be saved for future logins.
              </p>
            </div>

            {error && (
              <div
                className="p-4 rounded-md bg-destructive/10 text-destructive text-lg font-medium text-center"
                data-testid="text-login-error"
              >
                {error}
              </div>
            )}

            <Button
              data-testid="button-login"
              onClick={handleLogin}
              disabled={isLoading || !username.trim() || pin.length < 4}
              className="w-full h-14 text-xl font-semibold"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Protected by EchoPath Safety System
        </p>
      </div>
    </div>
  );
}
