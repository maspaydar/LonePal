import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Radio,
  User,
  Speaker,
  Trash2,
  LinkIcon,
  Unlink,
  Layers,
  Volume2,
  QrCode,
  Copy,
  Clock,
  Mic,
  Cpu,
  Wifi,
  Signal,
  Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface UnitSensor {
  id: number;
  entityId: number;
  unitId: number | null;
  residentId: number | null;
  sensorType: string;
  location: string;
  adtDeviceId: string | null;
  esp32DeviceMac: string | null;
  isActive: boolean;
}

interface UnitResident {
  id: number;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  roomNumber: string | null;
  status: string;
  unitId: number | null;
}

interface UnitData {
  id: number;
  entityId: number;
  unitIdentifier: string;
  label: string | null;
  hardwareType: "adt_google" | "esp32_custom";
  smartSpeakerId: string | null;
  esp32DeviceMac: string | null;
  esp32FirmwareVersion: string | null;
  esp32LastHeartbeat: string | null;
  esp32IpAddress: string | null;
  esp32SignalStrength: number | null;
  floor: string | null;
  isActive: boolean;
  sensors: UnitSensor[];
  resident: UnitResident | null;
}

interface SpeakerEvent {
  id: number;
  eventType: string;
  message: string | null;
  status: string;
  responseText: string | null;
  createdAt: string;
}

interface PairingCode {
  id: number;
  code: string;
  unitId: number;
  isUsed: boolean;
  expiresAt: string;
}

export default function Units() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [hardwareType, setHardwareType] = useState<"adt_google" | "esp32_custom">("adt_google");
  const [smartSpeakerId, setSmartSpeakerId] = useState("");
  const [esp32DeviceMac, setEsp32DeviceMac] = useState("");
  const [floor, setFloor] = useState("");
  const [assignResidentUnit, setAssignResidentUnit] = useState<number | null>(null);
  const [assignSensorUnit, setAssignSensorUnit] = useState<number | null>(null);
  const [speakerEventsUnit, setSpeakerEventsUnit] = useState<number | null>(null);
  const [pairingUnit, setPairingUnit] = useState<number | null>(null);

  const { data: units, isLoading } = useQuery<UnitData[]>({
    queryKey: [`/api/entities/${eid}/units`],
    enabled: !!eid,
  });

  const { data: allResidents } = useQuery<UnitResident[]>({
    queryKey: [`/api/entities/${eid}/residents`],
    enabled: !!eid,
  });

  const { data: allSensors } = useQuery<UnitSensor[]>({
    queryKey: [`/api/entities/${eid}/sensors`],
    enabled: !!eid,
  });

  const { data: speakerEvents } = useQuery<SpeakerEvent[]>({
    queryKey: [`/api/entities/${eid}/units`, speakerEventsUnit, "speaker/events"],
    queryFn: () => apiRequest("GET", `/api/entities/${eid}/units/${speakerEventsUnit}/speaker/events?limit=10`).then(r => r.json()),
    enabled: !!speakerEventsUnit,
  });

  const { data: pairingCodes } = useQuery<PairingCode[]>({
    queryKey: [`/api/entities/${eid}/units`, pairingUnit, "pairing-codes"],
    queryFn: () => apiRequest("GET", `/api/entities/${eid}/units/${pairingUnit}/pairing-codes`).then(r => r.json()),
    enabled: !!pairingUnit,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/entities/${eid}/units`, {
        unitIdentifier: unitId,
        label: unitLabel || undefined,
        hardwareType,
        smartSpeakerId: hardwareType === "adt_google" ? (smartSpeakerId || undefined) : undefined,
        esp32DeviceMac: hardwareType === "esp32_custom" ? (esp32DeviceMac || undefined) : undefined,
        floor: floor || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`] });
      toast({ title: "Unit created successfully" });
      setCreateOpen(false);
      setUnitId("");
      setUnitLabel("");
      setHardwareType("adt_google");
      setSmartSpeakerId("");
      setEsp32DeviceMac("");
      setFloor("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create unit", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/entities/${eid}/units/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/residents`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/sensors`] });
      toast({ title: "Unit deleted" });
    },
  });

  const assignResidentMutation = useMutation({
    mutationFn: ({ unitId, residentId }: { unitId: number; residentId: number }) =>
      apiRequest("POST", `/api/entities/${eid}/units/${unitId}/assign-resident`, { residentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/residents`] });
      setAssignResidentUnit(null);
      toast({ title: "Resident assigned to unit" });
    },
  });

  const assignSensorMutation = useMutation({
    mutationFn: ({ unitId, sensorId }: { unitId: number; sensorId: number }) =>
      apiRequest("POST", `/api/entities/${eid}/units/${unitId}/assign-sensor`, { sensorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/sensors`] });
      setAssignSensorUnit(null);
      toast({ title: "Sensor assigned to unit" });
    },
  });

  const unassignSensorMutation = useMutation({
    mutationFn: ({ unitId, sensorId }: { unitId: number; sensorId: number }) =>
      apiRequest("POST", `/api/entities/${eid}/units/${unitId}/unassign-sensor`, { sensorId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/sensors`] });
      toast({ title: "Sensor removed from unit" });
    },
  });

  const pushCheckInMutation = useMutation({
    mutationFn: (unitId: number) =>
      apiRequest("POST", `/api/entities/${eid}/units/${unitId}/speaker/check-in`, {
        scenarioType: "inactivity_gentle",
        escalationLevel: 0,
      }),
    onSuccess: (_, unitId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`, unitId, "speaker/events"] });
      toast({ title: "Check-in pushed to speaker" });
    },
    onError: (err: any) => {
      toast({ title: "Check-in failed", description: err.message, variant: "destructive" });
    },
  });

  const generatePairingMutation = useMutation({
    mutationFn: (unitId: number) =>
      apiRequest("POST", `/api/entities/${eid}/units/${unitId}/pairing-code`),
    onSuccess: (_, unitId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/units`, unitId, "pairing-codes"] });
      toast({ title: "Pairing code generated" });
    },
  });

  const unassignedResidents = allResidents?.filter((r) => !r.unitId) || [];
  const unassignedSensors = allSensors?.filter((s) => !s.unitId) || [];

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-units-title">Unit Management</h1>
          <p className="text-muted-foreground">Map residents, sensors, and smart speakers to apartment units</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-unit">
              <Plus className="w-4 h-4 mr-2" />
              Add Unit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Unit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Unit ID</Label>
                <Input
                  placeholder="e.g., Apt-402"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  data-testid="input-unit-id"
                />
              </div>
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input
                  placeholder="e.g., Corner Suite"
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  data-testid="input-unit-label"
                />
              </div>
              <div className="space-y-2">
                <Label>Hardware Type</Label>
                <Select value={hardwareType} onValueChange={(v) => setHardwareType(v as "adt_google" | "esp32_custom")}>
                  <SelectTrigger data-testid="select-hardware-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adt_google">ADT + Google Home</SelectItem>
                    <SelectItem value="esp32_custom">ESP32 Custom Hardware</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hardwareType === "adt_google" && (
                <div className="space-y-2">
                  <Label>Smart Speaker ID</Label>
                  <Input
                    placeholder="e.g., GH-402-LIVING"
                    value={smartSpeakerId}
                    onChange={(e) => setSmartSpeakerId(e.target.value)}
                    data-testid="input-smart-speaker-id"
                  />
                </div>
              )}
              {hardwareType === "esp32_custom" && (
                <div className="space-y-2">
                  <Label>ESP32 Device MAC Address</Label>
                  <Input
                    placeholder="e.g., AA:BB:CC:DD:EE:FF"
                    value={esp32DeviceMac}
                    onChange={(e) => setEsp32DeviceMac(e.target.value)}
                    data-testid="input-esp32-device-mac"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Floor</Label>
                <Input
                  placeholder="e.g., 4th"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  data-testid="input-unit-floor"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!unitId || createMutation.isPending}
                data-testid="button-submit-unit"
              >
                {createMutation.isPending ? "Creating..." : "Create Unit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!units || units.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Building2 className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-units">No units configured yet. Add a unit to begin mapping hardware.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map((unit) => (
            <Card key={unit.id} data-testid={`card-unit-${unit.id}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <CardTitle className="text-base truncate" data-testid={`text-unit-name-${unit.id}`}>{unit.unitIdentifier}</CardTitle>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge
                    variant={unit.hardwareType === "esp32_custom" ? "default" : "secondary"}
                    className="text-xs"
                    data-testid={`badge-hardware-${unit.id}`}
                  >
                    {unit.hardwareType === "esp32_custom" ? (
                      <><Cpu className="w-3 h-3 mr-1" />ESP32</>
                    ) : (
                      <>ADT</>
                    )}
                  </Badge>
                  {unit.floor && <Badge variant="outline" className="text-xs">{unit.floor}</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(unit.id)}
                    data-testid={`button-delete-unit-${unit.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {unit.label && (
                  <p className="text-sm text-muted-foreground">{unit.label}</p>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Resident</span>
                  </div>
                  {unit.resident ? (
                    <div className="flex items-center gap-2 pl-5">
                      <span className="text-sm" data-testid={`text-unit-resident-${unit.id}`}>
                        {unit.resident.preferredName || unit.resident.firstName} {unit.resident.lastName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {unit.resident.status}
                      </Badge>
                    </div>
                  ) : (
                    <div className="pl-5">
                      {assignResidentUnit === unit.id ? (
                        <Select
                          onValueChange={(val) => {
                            assignResidentMutation.mutate({ unitId: unit.id, residentId: Number(val) });
                          }}
                        >
                          <SelectTrigger data-testid={`select-resident-${unit.id}`}>
                            <SelectValue placeholder="Select resident..." />
                          </SelectTrigger>
                          <SelectContent>
                            {unassignedResidents.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>
                                {r.preferredName || r.firstName} {r.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAssignResidentUnit(unit.id)}
                          data-testid={`button-assign-resident-${unit.id}`}
                        >
                          <LinkIcon className="w-3.5 h-3.5 mr-1" />
                          Assign Resident
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {unit.hardwareType === "esp32_custom" ? "mmWave Sensors" : "Motion Sensors"}
                    </span>
                    <Badge variant="secondary" className="text-xs">{unit.sensors.length}</Badge>
                  </div>
                  {unit.sensors.length > 0 && (
                    <div className="space-y-1 pl-5">
                      {unit.sensors.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate" data-testid={`text-sensor-${s.id}`}>
                            {s.adtDeviceId || s.location} ({s.location})
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => unassignSensorMutation.mutate({ unitId: unit.id, sensorId: s.id })}
                            data-testid={`button-unassign-sensor-${s.id}`}
                          >
                            <Unlink className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pl-5">
                    {assignSensorUnit === unit.id ? (
                      <Select
                        onValueChange={(val) => {
                          assignSensorMutation.mutate({ unitId: unit.id, sensorId: Number(val) });
                        }}
                      >
                        <SelectTrigger data-testid={`select-sensor-${unit.id}`}>
                          <SelectValue placeholder="Select sensor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unassignedSensors.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.adtDeviceId || s.location} ({s.sensorType})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignSensorUnit(unit.id)}
                        disabled={unassignedSensors.length === 0}
                        data-testid={`button-assign-sensor-${unit.id}`}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Sensor
                      </Button>
                    )}
                  </div>
                </div>

                {unit.hardwareType === "esp32_custom" && unit.esp32DeviceMac && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">ESP32-S3-BOX-3</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => pushCheckInMutation.mutate(unit.id)}
                          disabled={!unit.resident || pushCheckInMutation.isPending}
                          title="Push check-in to ESP32 speaker"
                          data-testid={`button-push-checkin-${unit.id}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSpeakerEventsUnit(speakerEventsUnit === unit.id ? null : unit.id)}
                          title="View speaker events"
                          data-testid={`button-speaker-events-${unit.id}`}
                        >
                          <Mic className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="pl-5 space-y-1">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground" data-testid={`text-esp32-mac-${unit.id}`}>
                          {unit.esp32DeviceMac}
                        </span>
                        {unit.esp32SignalStrength !== null && (
                          <Badge variant="outline" className="text-[10px]">
                            <Signal className="w-2.5 h-2.5 mr-0.5" />
                            {unit.esp32SignalStrength} dBm
                          </Badge>
                        )}
                      </div>
                      {unit.esp32FirmwareVersion && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          FW: {unit.esp32FirmwareVersion}
                        </p>
                      )}
                      {unit.esp32IpAddress && (
                        <p className="text-xs text-muted-foreground">
                          IP: {unit.esp32IpAddress}
                        </p>
                      )}
                      {unit.esp32LastHeartbeat && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last seen: {new Date(unit.esp32LastHeartbeat).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {speakerEventsUnit === unit.id && speakerEvents && (
                      <div className="pl-5 space-y-1 max-h-36 overflow-y-auto" data-testid={`speaker-events-list-${unit.id}`}>
                        {speakerEvents.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No events yet</p>
                        ) : (
                          speakerEvents.map((evt) => (
                            <div key={evt.id} className="flex items-start gap-2 text-xs" data-testid={`speaker-event-${evt.id}`}>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                                {evt.eventType.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-muted-foreground truncate">
                                {evt.message?.slice(0, 60) || evt.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {unit.hardwareType === "adt_google" && unit.smartSpeakerId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Speaker className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">Google Home Speaker</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => pushCheckInMutation.mutate(unit.id)}
                          disabled={!unit.resident || pushCheckInMutation.isPending}
                          title="Push check-in to speaker"
                          data-testid={`button-push-checkin-${unit.id}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSpeakerEventsUnit(speakerEventsUnit === unit.id ? null : unit.id)}
                          title="View speaker events"
                          data-testid={`button-speaker-events-${unit.id}`}
                        >
                          <Mic className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pl-5" data-testid={`text-speaker-${unit.id}`}>
                      {unit.smartSpeakerId}
                    </p>

                    {speakerEventsUnit === unit.id && speakerEvents && (
                      <div className="pl-5 space-y-1 max-h-36 overflow-y-auto" data-testid={`speaker-events-list-${unit.id}`}>
                        {speakerEvents.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No speaker events yet</p>
                        ) : (
                          speakerEvents.map((evt) => (
                            <div key={evt.id} className="flex items-start gap-2 text-xs" data-testid={`speaker-event-${evt.id}`}>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                                {evt.eventType.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-muted-foreground truncate">
                                {evt.message?.slice(0, 60) || evt.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2 pt-1 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">Device Pairing</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPairingUnit(pairingUnit === unit.id ? null : unit.id);
                        if (pairingUnit !== unit.id) {
                          generatePairingMutation.mutate(unit.id);
                        }
                      }}
                      data-testid={`button-pairing-${unit.id}`}
                    >
                      <QrCode className="w-3.5 h-3.5 mr-1" />
                      {pairingUnit === unit.id ? "Hide" : "Generate Code"}
                    </Button>
                  </div>

                  {pairingUnit === unit.id && pairingCodes && (
                    <div className="pl-5 space-y-2" data-testid={`pairing-codes-${unit.id}`}>
                      {pairingCodes.filter(c => !c.isUsed && new Date(c.expiresAt) > new Date()).slice(0, 3).map((code) => (
                        <div key={code.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold tracking-wider" data-testid={`text-pairing-code-${code.id}`}>
                              {code.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 60000))}m
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => copyToClipboard(code.code)}
                              data-testid={`button-copy-code-${code.id}`}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {pairingCodes.filter(c => !c.isUsed && new Date(c.expiresAt) > new Date()).length === 0 && (
                        <p className="text-xs text-muted-foreground">No active pairing codes</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(unassignedResidents.length > 0 || unassignedSensors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Unassigned Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {unassignedResidents.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Residents without a unit ({unassignedResidents.length})</p>
                <div className="flex flex-wrap gap-2">
                  {unassignedResidents.map((r) => (
                    <Badge key={r.id} variant="outline" data-testid={`badge-unassigned-resident-${r.id}`}>
                      {r.preferredName || r.firstName} {r.lastName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {unassignedSensors.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Sensors without a unit ({unassignedSensors.length})</p>
                <div className="flex flex-wrap gap-2">
                  {unassignedSensors.map((s) => (
                    <Badge key={s.id} variant="outline" data-testid={`badge-unassigned-sensor-${s.id}`}>
                      {s.adtDeviceId || s.location}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
