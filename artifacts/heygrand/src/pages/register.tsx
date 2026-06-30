import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Mail, CheckCircle, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const registrationSchema = z.object({
  facilityName: z.string().min(2, "Facility name must be at least 2 characters"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  contactEmail: z.string().email("Please enter a valid email address"),
  contactPhone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [devAutoVerified, setDevAutoVerified] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      facilityName: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegistrationForm) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName: data.facilityName,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone || undefined,
          password: data.password,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error && typeof body.error === "object") {
          const msgs = Object.values(body.error).flat().join("; ");
          throw new Error(msgs);
        }
        throw new Error(body.error || "Registration failed");
      }
      return body;
    },
    onSuccess: (data, variables) => {
      setSubmittedEmail(variables.contactEmail);
      if (data?.devAutoVerified && data?.loginUsername) {
        setDevAutoVerified(true);
        setLoginUsername(data.loginUsername);
      }
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast({
        title: "Registration failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(data: RegistrationForm) {
    registerMutation.mutate(data);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            {devAutoVerified ? (
              <>
                <div>
                  <h2 className="text-xl font-semibold mb-1">Account ready!</h2>
                  <p className="text-muted-foreground text-sm">Your trial has been activated. Use these credentials to log in:</p>
                </div>
                <div className="w-full bg-muted rounded-lg p-4 text-left space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Username</p>
                    <p className="font-mono font-medium" data-testid="text-login-username">{loginUsername}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Password</p>
                    <p className="text-sm text-muted-foreground">The password you just set</p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-go-to-login">
                  Go to login
                </Button>
              </>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold mb-1" data-testid="text-check-email-title">Check your inbox</h2>
                  <p className="text-muted-foreground text-sm">
                    We sent a verification link to
                  </p>
                  <p className="font-medium mt-1" data-testid="text-submitted-email">{submittedEmail}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to verify your address and start your 30-day free trial. The link expires in 24 hours.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/login")}
                  data-testid="button-go-to-login"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to login
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-3">
            <Building2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Register your facility</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Start your 30-day free trial — no credit card required
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Facility information</CardTitle>
            <CardDescription>Tell us about your facility and who we should contact.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="facilityName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Facility name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Sunrise Senior Living"
                          data-testid="input-facility-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your full name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jane Smith"
                            data-testid="input-contact-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone number <span className="text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="+1 (555) 000-0000"
                            type="tel"
                            data-testid="input-contact-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@facility.com"
                          type="email"
                          data-testid="input-contact-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="At least 8 characters"
                            type={showPassword ? "text" : "password"}
                            data-testid="input-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Re-enter your password"
                            type={showConfirm ? "text" : "password"}
                            data-testid="input-confirm-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                  data-testid="button-register"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Create account & verify email
                    </>
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setLocation("/login")}
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="link-go-to-login"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By registering, you agree to our terms of service. Your 30-day trial starts upon email verification.
        </p>
      </div>
    </div>
  );
}
