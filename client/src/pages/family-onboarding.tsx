import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  Heart,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  User,
  Wifi,
  Clock,
  PartyPopper,
} from "lucide-react";

type Step = "welcome" | "profile" | "device" | "done";

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

const FREQUENCY_OPTIONS = [
  { value: 60, label: "Every hour" },
  { value: 180, label: "Every 3 hours" },
  { value: 360, label: "Twice a day" },
  { value: 720, label: "Once a day" },
];

export default function FamilyOnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getEntity, getEntityId } = useCompanyAuth();
  const entity = getEntity();
  const entityId = getEntityId();

  const initial = splitName(entity?.name || "");

  const [step, setStep] = useState<Step>("welcome");
  const [residentId, setResidentId] = useState<number | null>(null);

  // Profile fields
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [preferredName, setPreferredName] = useState("");
  const [aboutThem, setAboutThem] = useState("");

  // Device / check-in fields
  const [deviceCode, setDeviceCode] = useState("");
  const [checkInFrequency, setCheckInFrequency] = useState(180);
  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("22:00");

  const lovedOneFirst = (preferredName || firstName || "your loved one").trim();

  const createProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/entities/${entityId}/residents`, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || firstName.trim(),
        preferredName: preferredName.trim() || undefined,
        medicalNotes: aboutThem.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (resident) => {
      setResidentId(resident.id);
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/residents`] });
      setStep("device");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save the profile", description: err.message, variant: "destructive" });
    },
  });

  const setupDevice = useMutation({
    mutationFn: async () => {
      if (!residentId) throw new Error("Profile not created yet");
      const suffix = Math.random().toString(36).slice(2, 6);
      const unitRes = await apiRequest("POST", `/api/entities/${entityId}/units`, {
        unitIdentifier: `${lovedOneFirst}-home-${suffix}`,
        label: `${lovedOneFirst}'s home`,
        hardwareType: "esp32_custom",
        esp32DeviceMac: deviceCode.trim() || undefined,
      });
      const unit = await unitRes.json();

      await apiRequest("POST", `/api/entities/${entityId}/units/${unit.id}/assign-resident`, {
        residentId,
      });

      await apiRequest("PUT", `/api/entities/${entityId}/units/${unit.id}/device-settings`, {
        aiCheckInFrequency: checkInFrequency,
        activeHoursStart: wakeTime,
        activeHoursEnd: sleepTime,
      });
      return unit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/residents`] });
      setStep("done");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't finish setup", description: err.message, variant: "destructive" });
    },
  });

  const profileValid = firstName.trim().length >= 2;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Progress dots */}
        {step !== "welcome" && step !== "done" && (
          <div className="flex items-center justify-center gap-2" data-testid="onboarding-progress">
            {(["profile", "device"] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  step === s ? "w-8 bg-primary" : i < ["profile", "device"].indexOf(step) ? "w-8 bg-primary/50" : "w-4 bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>
        )}

        {step === "welcome" && (
          <Card data-testid="step-welcome">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
                <Heart className="w-8 h-8 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold mb-2">Welcome to HeyGrand</h1>
                <p className="text-muted-foreground">
                  Let's get {entity?.name ? <span className="font-medium text-foreground">{entity.name}</span> : "your loved one"} set
                  up for daily check-ins and peace of mind. It only takes a minute.
                </p>
              </div>
              <div className="w-full space-y-3 text-left">
                {[
                  { icon: User, title: "Tell us about your loved one", desc: "A few details so check-ins feel personal" },
                  { icon: Wifi, title: "Connect their device", desc: "Pair the HeyGrand sensor (or do this later)" },
                  { icon: Clock, title: "Choose check-in times", desc: "How often and when we should reach out" },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="w-full" onClick={() => setStep("profile")} data-testid="button-start-onboarding">
                Get started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "profile" && (
          <Card data-testid="step-profile">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-semibold">About your loved one</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This helps the AI companion talk with them warmly and naturally.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ruth"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Miller"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preferredName">What do they like to be called? <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="preferredName"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="Grandma Ruthie"
                  data-testid="input-preferred-name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="aboutThem">Anything we should know? <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="aboutThem"
                  value={aboutThem}
                  onChange={(e) => setAboutThem(e.target.value)}
                  placeholder="Loves gardening and her cat Whiskers. A little hard of hearing on the left."
                  rows={3}
                  data-testid="input-about-them"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep("welcome")} data-testid="button-back-welcome">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!profileValid || createProfile.isPending}
                  onClick={() => createProfile.mutate()}
                  data-testid="button-save-profile"
                >
                  {createProfile.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "device" && (
          <Card data-testid="step-device">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-semibold">Set up check-ins</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose how often HeyGrand should reach out to {lovedOneFirst} and when they're usually awake.
                </p>
              </div>

              <div className="space-y-2">
                <Label>How often should we check in?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCheckInFrequency(opt.value)}
                      className={`rounded-lg border p-3 text-sm font-medium transition-colors hover-elevate ${
                        checkInFrequency === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                      data-testid={`button-frequency-${opt.value}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wakeTime">Usually awake from</Label>
                  <Input
                    id="wakeTime"
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    data-testid="input-wake-time"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sleepTime">Until</Label>
                  <Input
                    id="sleepTime"
                    type="time"
                    value={sleepTime}
                    onChange={(e) => setSleepTime(e.target.value)}
                    data-testid="input-sleep-time"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deviceCode">Device pairing code <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="deviceCode"
                  value={deviceCode}
                  onChange={(e) => setDeviceCode(e.target.value)}
                  placeholder="Found on the back of your HeyGrand device"
                  data-testid="input-device-code"
                />
                <p className="text-xs text-muted-foreground">
                  Don't have it handy? No problem — you can connect the device anytime from settings.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep("profile")} data-testid="button-back-profile">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={setupDevice.isPending}
                  onClick={() => setupDevice.mutate()}
                  data-testid="button-finish-setup"
                >
                  {setupDevice.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Finishing...
                    </>
                  ) : (
                    <>
                      Finish setup
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card data-testid="step-done">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">You're all set!</h2>
                <p className="text-muted-foreground">
                  {lovedOneFirst} is ready for daily check-ins. You'll see their status and alerts on your home screen.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-to-dashboard"
              >
                Go to my dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
