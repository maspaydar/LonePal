import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  UserPlus,
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

  // When the family already has a loved one, we revisit the wizard in edit mode
  // (pre-fill + update existing records). Setting `addingNew` switches back to
  // create mode so families can add an additional loved one.
  const [addingNew, setAddingNew] = useState(false);

  const { data: residents } = useQuery<any[]>({
    queryKey: [`/api/entities/${entityId}/residents`],
    enabled: !!entityId,
  });
  const { data: units } = useQuery<any[]>({
    queryKey: [`/api/entities/${entityId}/units`],
    enabled: !!entityId,
  });

  const existingResident =
    !addingNew && Array.isArray(residents) && residents.length > 0 ? residents[0] : undefined;
  const isEditMode = !!existingResident;

  const editUnit =
    existingResident && Array.isArray(units)
      ? units.find(
          (u: any) => u.resident?.id === existingResident.id || u.id === existingResident.unitId,
        )
      : undefined;
  const editUnitId = editUnit?.id ?? null;

  const { data: deviceSettings } = useQuery<any>({
    queryKey: [`/api/entities/${entityId}/units/${editUnitId}/device-settings`],
    enabled: !!entityId && !!editUnitId,
  });

  const [step, setStep] = useState<Step>("welcome");
  const [residentId, setResidentId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

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

  // Pre-fill guards so a family's in-progress edits aren't clobbered on refetch.
  const [profilePrefilled, setProfilePrefilled] = useState(false);
  const [unitPrefilled, setUnitPrefilled] = useState(false);
  const [settingsPrefilled, setSettingsPrefilled] = useState(false);

  useEffect(() => {
    if (existingResident && !profilePrefilled) {
      setResidentId(existingResident.id);
      setFirstName(existingResident.firstName || "");
      setLastName(existingResident.lastName || "");
      setPreferredName(existingResident.preferredName || "");
      setAboutThem(existingResident.medicalNotes || "");
      setProfilePrefilled(true);
    }
  }, [existingResident, profilePrefilled]);

  useEffect(() => {
    if (editUnit && !unitPrefilled) {
      setUnitId(editUnit.id);
      if (editUnit.esp32DeviceMac) setDeviceCode(editUnit.esp32DeviceMac);
      setUnitPrefilled(true);
    }
  }, [editUnit, unitPrefilled]);

  useEffect(() => {
    if (deviceSettings && !settingsPrefilled) {
      if (deviceSettings.aiCheckInFrequency) setCheckInFrequency(deviceSettings.aiCheckInFrequency);
      if (deviceSettings.activeHoursStart) setWakeTime(deviceSettings.activeHoursStart);
      if (deviceSettings.activeHoursEnd) setSleepTime(deviceSettings.activeHoursEnd);
      setSettingsPrefilled(true);
    }
  }, [deviceSettings, settingsPrefilled]);

  const lovedOneFirst = (preferredName || firstName || "your loved one").trim();

  const createProfile = useMutation({
    mutationFn: async () => {
      const trimmedPreferred = preferredName.trim();
      const trimmedNotes = aboutThem.trim();
      if (isEditMode && residentId) {
        const res = await apiRequest("PATCH", `/api/residents/${residentId}`, {
          firstName: firstName.trim(),
          lastName: lastName.trim() || firstName.trim(),
          preferredName: trimmedPreferred || null,
          medicalNotes: trimmedNotes || null,
        });
        return res.json();
      }
      const res = await apiRequest("POST", `/api/entities/${entityId}/residents`, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || firstName.trim(),
        preferredName: trimmedPreferred || undefined,
        medicalNotes: trimmedNotes || undefined,
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
      let targetUnitId = unitId;

      if (isEditMode && targetUnitId) {
        // Update the loved one's existing home instead of creating a duplicate.
        await apiRequest("PUT", `/api/entities/${entityId}/units/${targetUnitId}`, {
          esp32DeviceMac: deviceCode.trim() || null,
        });
      } else {
        const suffix = Math.random().toString(36).slice(2, 6);
        const unitRes = await apiRequest("POST", `/api/entities/${entityId}/units`, {
          unitIdentifier: `${lovedOneFirst}-home-${suffix}`,
          label: `${lovedOneFirst}'s home`,
          hardwareType: "esp32_custom",
          esp32DeviceMac: deviceCode.trim() || undefined,
        });
        const unit = await unitRes.json();
        targetUnitId = unit.id;

        await apiRequest("POST", `/api/entities/${entityId}/units/${targetUnitId}/assign-resident`, {
          residentId,
        });
      }

      await apiRequest("PUT", `/api/entities/${entityId}/units/${targetUnitId}/device-settings`, {
        aiCheckInFrequency: checkInFrequency,
        activeHoursStart: wakeTime,
        activeHoursEnd: sleepTime,
      });
      return targetUnitId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/residents`] });
      if (editUnitId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/entities/${entityId}/units/${editUnitId}/device-settings`],
        });
      }
      setCompletedCount((c) => c + 1);
      setStep("done");
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't finish setup", description: err.message, variant: "destructive" });
    },
  });

  const profileValid = firstName.trim().length >= 2;

  const startAnotherLovedOne = () => {
    setAddingNew(true);
    setResidentId(null);
    setUnitId(null);
    setFirstName("");
    setLastName("");
    setPreferredName("");
    setAboutThem("");
    setDeviceCode("");
    setCheckInFrequency(180);
    setWakeTime("07:00");
    setSleepTime("22:00");
    setStep("profile");
  };

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
                <h1 className="text-2xl font-bold mb-2">
                  {isEditMode ? "Update your setup" : "Welcome to HeyGrand"}
                </h1>
                <p className="text-muted-foreground">
                  {isEditMode ? (
                    <>
                      Review or change{" "}
                      <span className="font-medium text-foreground">{lovedOneFirst}</span>'s
                      details, check-in times, and device whenever you like.
                    </>
                  ) : (
                    <>
                      Let's get {entity?.name ? <span className="font-medium text-foreground">{entity.name}</span> : "your loved one"} set
                      up for daily check-ins and peace of mind. It only takes a minute.
                    </>
                  )}
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
                {isEditMode ? "Review settings" : "Get started"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              {isEditMode && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/dashboard")}
                  data-testid="button-cancel-onboarding"
                >
                  Back to dashboard
                </Button>
              )}
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
                      {isEditMode ? "Saving..." : "Finishing..."}
                    </>
                  ) : (
                    <>
                      {isEditMode ? "Save changes" : "Finish setup"}
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
                <h2 className="text-2xl font-bold mb-2">
                  {isEditMode ? `${lovedOneFirst}'s settings saved!` : `${lovedOneFirst} is all set!`}
                </h2>
                <p className="text-muted-foreground">
                  {isEditMode
                    ? `Your changes are live. ${lovedOneFirst}'s check-ins will use the updated settings right away.`
                    : `${lovedOneFirst} is ready for daily check-ins. You'll see their status and alerts on your home screen.`}
                  {completedCount > 1 && (
                    <>
                      {" "}
                      That's{" "}
                      <span className="font-medium text-foreground">
                        {completedCount} loved ones
                      </span>{" "}
                      set up so far.
                    </>
                  )}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Caring for someone else too? You can add them now.
              </p>
              <div className="w-full space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={startAnotherLovedOne}
                  data-testid="button-add-another"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add another loved one
                </Button>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/dashboard")}
                  data-testid="button-go-to-dashboard"
                >
                  Go to my dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
