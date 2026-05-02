import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStoredResident } from "@/lib/resident-auth";
import { ResidentLayout } from "@/components/resident-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Wifi, WifiOff, RefreshCw } from "lucide-react";
import {
  fetchDeviceSettings,
  saveDeviceSettings,
  type DeviceSettingsResponse,
  type DeviceSettingsValues,
} from "@/lib/resident-auth";
import { useToast } from "@/hooks/use-toast";

function settingsKey(residentId: number | undefined) {
  return ["/api/mobile/device-settings", residentId] as const;
}

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
        connected
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
      data-testid={`badge-device-status-${connected ? "online" : "offline"}`}
    >
      {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      {connected ? "Device online" : "Device offline"}
    </div>
  );
}

export default function ResidentDeviceSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resident = getStoredResident();
  const queryKey = settingsKey(resident?.id);
  const [form, setForm] = useState<DeviceSettingsValues | null>(null);
  const [dirty, setDirty] = useState(false);
  const initializedRef = useRef(false);

  const query = useQuery<DeviceSettingsResponse>({
    queryKey,
    queryFn: fetchDeviceSettings,
    refetchInterval: 30_000,
  });

  // Initialize the form ONCE from the first successful fetch. Subsequent
  // background refetches must NEVER overwrite in-flight user edits — even
  // before the user has nudged a control (which is when `dirty` is still
  // false but the form is already authoritative on screen).
  useEffect(() => {
    if (query.data && !initializedRef.current) {
      setForm(query.data.settings);
      initializedRef.current = true;
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (values: DeviceSettingsValues) => saveDeviceSettings(values),
    onSuccess: (result) => {
      setDirty(false);
      // Re-baseline the form from the server's canonical response.
      setForm(result.settings);
      queryClient.invalidateQueries({ queryKey });
      if (result.pushedToDevice) {
        toast({
          title: "Saved & pushed to device",
          description: "Your sensor will apply the new settings immediately.",
        });
      } else if (result.deviceMac) {
        toast({
          title: "Saved",
          description: "Device is offline — settings will apply when it reconnects.",
        });
      } else {
        toast({
          title: "Saved",
          description: "Settings stored. No device is currently linked to your unit.",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  function update<K extends keyof DeviceSettingsValues>(
    key: K,
    value: DeviceSettingsValues[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  function resetToDefaults() {
    if (!query.data) return;
    setForm({ ...query.data.defaults });
    setDirty(true);
  }

  function discardChanges() {
    if (!query.data) return;
    setForm(query.data.settings);
    setDirty(false);
  }

  if (query.isLoading) {
    return (
      <ResidentLayout active="settings">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </ResidentLayout>
    );
  }

  if (query.isError) {
    return (
      <ResidentLayout active="settings">
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-base mb-4" data-testid="text-settings-error">
                {(query.error as any)?.message || "Could not load device settings."}
              </p>
              <Button onClick={() => query.refetch()} data-testid="button-retry-settings">
                <RefreshCw className="w-4 h-4 mr-2" /> Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </ResidentLayout>
    );
  }

  if (!form || !query.data) return null;

  return (
    <ResidentLayout active="settings">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Device Settings</h1>
          <p className="text-muted-foreground text-base">
            Customize how your safety sensor watches over you.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Your sensor</CardTitle>
              <StatusBadge connected={query.data.device.connected} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <div data-testid="text-unit-identifier">
              <span className="font-medium text-foreground">Unit:</span>{" "}
              {query.data.unitIdentifier}
            </div>
            <div data-testid="text-device-mac">
              <span className="font-medium text-foreground">Device:</span>{" "}
              {query.data.deviceMac || "Not yet linked"}
            </div>
            {query.data.device.firmwareVersion && (
              <div>
                <span className="font-medium text-foreground">Firmware:</span>{" "}
                {query.data.device.firmwareVersion}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Detection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base">Sensitivity</Label>
                <span
                  className="text-base font-semibold"
                  data-testid="text-sensitivity-value"
                >
                  {form.sensitivity}
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[form.sensitivity]}
                onValueChange={(v) => update("sensitivity", v[0])}
                data-testid="slider-sensitivity"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Higher values detect smaller movements but may cause false alarms.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base">Detection distance</Label>
                <span
                  className="text-base font-semibold"
                  data-testid="text-distance-value"
                >
                  {form.detectionDistance} cm
                </span>
              </div>
              <Slider
                min={50}
                max={600}
                step={25}
                value={[form.detectionDistance]}
                onValueChange={(v) => update("detectionDistance", v[0])}
                data-testid="slider-distance"
              />
              <p className="text-sm text-muted-foreground mt-1">
                How far the radar should look for movement (max ~6 meters).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Check-ins</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base">AI check-in frequency</Label>
                <span
                  className="text-base font-semibold"
                  data-testid="text-frequency-value"
                >
                  Every {form.aiCheckInFrequency} min
                </span>
              </div>
              <Slider
                min={15}
                max={720}
                step={15}
                value={[form.aiCheckInFrequency]}
                onValueChange={(v) => update("aiCheckInFrequency", v[0])}
                data-testid="slider-frequency"
              />
              <p className="text-sm text-muted-foreground mt-1">
                How often your AI companion checks in if no presence is detected.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="active-start" className="text-base">
                  Active from
                </Label>
                <Input
                  id="active-start"
                  type="time"
                  value={form.activeHoursStart}
                  onChange={(e) => update("activeHoursStart", e.target.value)}
                  className="mt-1 text-lg"
                  data-testid="input-active-start"
                />
              </div>
              <div>
                <Label htmlFor="active-end" className="text-base">
                  Active until
                </Label>
                <Input
                  id="active-end"
                  type="time"
                  value={form.activeHoursEnd}
                  onChange={(e) => update("activeHoursEnd", e.target.value)}
                  className="mt-1 text-lg"
                  data-testid="input-active-end"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground -mt-2">
              Outside these hours the sensor enters quiet mode.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3 sticky bottom-0 bg-gradient-to-t from-blue-50 dark:from-slate-900 pt-4 pb-2">
          <Button
            size="lg"
            className="flex-1 text-lg py-6"
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            data-testid="button-save-to-device"
          >
            {mutation.isPending ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            Save to Device
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={resetToDefaults}
            data-testid="button-reset-defaults"
          >
            Reset to defaults
          </Button>
        </div>
      </div>
    </ResidentLayout>
  );
}
