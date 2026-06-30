import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Wrench, CheckCircle, ArrowLeft, Send, Bot, Cpu } from "lucide-react";

const PROVIDER_TYPES = [
  {
    value: "agent_sp" as const,
    label: "Resident companion agents",
    description: "Deliver AI companions and check-in experiences for residents.",
    icon: Bot,
  },
  {
    value: "integration_sp" as const,
    label: "Hardware & integrations",
    description: "Connect sensors, devices, and facility environments.",
    icon: Cpu,
  },
];

const applicationSchema = z.object({
  organizationName: z.string().min(2, "Organization name must be at least 2 characters"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  contactEmail: z.string().email("Please enter a valid email address"),
  providerType: z.enum(["agent_sp", "integration_sp"], {
    errorMap: () => ({ message: "Please choose what you provide" }),
  }),
  message: z.string().optional(),
});

type ApplicationForm = z.infer<typeof applicationSchema>;

export default function ServiceProviderRegisterPage() {
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<ApplicationForm>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      organizationName: "",
      contactName: "",
      contactEmail: "",
      providerType: undefined as unknown as ApplicationForm["providerType"],
      message: "",
    },
  });

  function onSubmit(data: ApplicationForm) {
    const typeLabel =
      PROVIDER_TYPES.find((t) => t.value === data.providerType)?.label ?? data.providerType;
    const subject = `Service provider application — ${data.organizationName}`;
    const body = [
      `Organization: ${data.organizationName}`,
      `Contact: ${data.contactName}`,
      `Email: ${data.contactEmail}`,
      `Provider type: ${typeLabel} (${data.providerType})`,
      "",
      data.message || "(no additional details)",
    ].join("\n");
    const mailto = `mailto:partnerships@heygrand.com?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSubmittedEmail(data.contactEmail);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1" data-testid="text-sp-application-title">
                Application started
              </h2>
              <p className="text-muted-foreground text-sm">
                We've opened a pre-filled email to our partnerships team. Send it and we'll review
                your application and reach out at
              </p>
              <p className="font-medium mt-1" data-testid="text-sp-submitted-email">{submittedEmail}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Certified providers complete guided training before going live for the facilities they
              serve.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/service-provider/login")}
              data-testid="button-sp-go-to-login"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Go to sign in
            </Button>
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
            <Wrench className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Register as a service provider</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Apply to deliver AI companions, hardware, or integrations on HeyGrand
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Partner application</CardTitle>
            <CardDescription>Tell us about your organization and what you provide.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="organizationName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Care Technologies" data-testid="input-sp-org-name" {...field} />
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
                          <Input placeholder="Jane Smith" data-testid="input-sp-contact-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@company.com"
                            type="email"
                            data-testid="input-sp-contact-email"
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
                  name="providerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What do you provide?</FormLabel>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {PROVIDER_TYPES.map(({ value, label, description, icon: Icon }) => {
                          const active = field.value === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => field.onChange(value)}
                              aria-pressed={active}
                              data-testid={`button-sp-type-${value}`}
                              className={`flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors ${
                                active
                                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <Icon
                                className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                              />
                              <span className="text-sm font-medium">{label}</span>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Anything else? <span className="text-muted-foreground">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about your product and the facilities you'd like to serve."
                          rows={3}
                          data-testid="input-sp-message"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" data-testid="button-sp-register">
                  <Send className="w-4 h-4 mr-2" />
                  Submit application
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Already a partner?{" "}
                  <Link
                    to="/service-provider/login"
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="link-sp-go-to-login"
                  >
                    Sign in
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Applications are reviewed by our partnerships team. Certified providers complete guided
          training before going live.
        </p>
      </div>
    </div>
  );
}
