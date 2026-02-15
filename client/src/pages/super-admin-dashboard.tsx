import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  RefreshCw,
  Shield,
  LogOut,
  Activity,
  Users,
  Wifi,
  WifiOff,
  Settings,
  Send,
  Trash2,
  KeyRound,
  X,
  CircleDot,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getToken() {
  return localStorage.getItem("superAdminToken") || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`,
  };
}

interface Facility {
  id: number;
  facilityId: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  installationUrl: string | null;
  status: string;
  geminiApiKey: string | null;
  configJson: any;
  activeResidents: number;
  lastHealthCheck: string | null;
  lastHealthStatus: string | null;
  uptimePercent: number;
  createdAt: string;
}

interface DashboardData {
  totalFacilities: number;
  active: number;
  inactive: number;
  maintenance: number;
  onboarding: number;
  healthy: number;
  unhealthy: number;
  totalResidents: number;
  facilities: Facility[];
}

function StatusLight({ status }: { status: string | null }) {
  if (status === "healthy") return <CircleDot className="w-4 h-4 text-green-500" />;
  if (status === "unhealthy") return <CircleDot className="w-4 h-4 text-red-500" />;
  if (status === "unreachable") return <WifiOff className="w-4 h-4 text-red-500" />;
  return <CircleDot className="w-4 h-4 text-muted-foreground" />;
}

function FacilityStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    inactive: "destructive",
    maintenance: "secondary",
    onboarding: "outline",
  };
  return <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>{status}</Badge>;
}

export default function SuperAdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [totpData, setTotpData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  const [newFacility, setNewFacility] = useState({
    facilityId: "",
    name: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
    installationUrl: "",
    status: "onboarding",
    geminiApiKey: "",
  });

  const [configKey, setConfigKey] = useState("");
  const [configValue, setConfigValue] = useState("");

  const { data: dashData, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/super-admin/dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/dashboard", { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("superAdminToken");
        setLocation("/super-admin");
        throw new Error("Unauthorized");
      }
      return res.json();
    },
    refetchInterval: 30000,
  });

  const healthCheckMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/super-admin/facilities/check-health", {
        method: "POST",
        headers: authHeaders(),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dashboard"] });
      toast({ title: "Health check complete", description: `Checked ${data.checked} facilities` });
    },
  });

  const addFacilityMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/super-admin/facilities", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(newFacility),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add facility");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dashboard"] });
      setShowAddFacility(false);
      setNewFacility({ facilityId: "", name: "", address: "", contactEmail: "", contactPhone: "", installationUrl: "", status: "onboarding", geminiApiKey: "" });
      toast({ title: "Facility added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteFacilityMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/super-admin/facilities/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dashboard"] });
      toast({ title: "Facility removed" });
    },
  });

  const pushConfigMutation = useMutation({
    mutationFn: async ({ id, config }: { id: number; config: Record<string, string> }) => {
      const res = await fetch(`/api/super-admin/facilities/${id}/push-config`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to push config");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Config pushed successfully" });
      setShowConfigDialog(false);
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const updateFacilityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const res = await fetch(`/api/super-admin/facilities/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dashboard"] });
      toast({ title: "Facility updated" });
    },
  });

  async function handleSetup2FA() {
    try {
      const res = await fetch("/api/super-admin/auth/setup-2fa", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setTotpData(data);
      setShowSetup2FA(true);
    } catch {
      toast({ title: "Error", description: "Failed to setup 2FA", variant: "destructive" });
    }
  }

  function handleLogout() {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdmin");
    setLocation("/super-admin");
  }

  const admin = JSON.parse(localStorage.getItem("superAdmin") || "{}");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold" data-testid="text-dashboard-title">EchoPath Command Hub</h1>
              <p className="text-xs text-muted-foreground">{admin.fullName} ({admin.email})</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSetup2FA} data-testid="button-setup-2fa">
              <KeyRound className="w-4 h-4 mr-1" />
              {admin.totpEnabled ? "Reset 2FA" : "Setup 2FA"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total Facilities</p>
                  <p className="text-2xl font-bold" data-testid="text-total-facilities">{dashData?.totalFacilities || 0}</p>
                </div>
                <Building2 className="w-8 h-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-active-facilities">{dashData?.active || 0}</p>
                </div>
                <Wifi className="w-8 h-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total Residents</p>
                  <p className="text-2xl font-bold" data-testid="text-total-residents">{dashData?.totalResidents || 0}</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Health Issues</p>
                  <p className="text-2xl font-bold text-red-600" data-testid="text-unhealthy">{dashData?.unhealthy || 0}</p>
                </div>
                <Activity className="w-8 h-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Facility Registry</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => healthCheckMutation.mutate()}
              disabled={healthCheckMutation.isPending}
              data-testid="button-health-check"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${healthCheckMutation.isPending ? "animate-spin" : ""}`} />
              {healthCheckMutation.isPending ? "Checking..." : "Health Check All"}
            </Button>
            <Dialog open={showAddFacility} onOpenChange={setShowAddFacility}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-facility">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Facility
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Facility</DialogTitle>
                  <DialogDescription>Register a new facility installation</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addFacilityMutation.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Facility ID</Label>
                      <Input
                        value={newFacility.facilityId}
                        onChange={(e) => setNewFacility({ ...newFacility, facilityId: e.target.value })}
                        placeholder="FAC-001"
                        required
                        data-testid="input-facility-id"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Name</Label>
                      <Input
                        value={newFacility.name}
                        onChange={(e) => setNewFacility({ ...newFacility, name: e.target.value })}
                        placeholder="Sunrise Gardens"
                        required
                        data-testid="input-facility-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Address</Label>
                    <Input
                      value={newFacility.address}
                      onChange={(e) => setNewFacility({ ...newFacility, address: e.target.value })}
                      placeholder="123 Main St, City, ST 12345"
                      data-testid="input-facility-address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Contact Email</Label>
                      <Input
                        type="email"
                        value={newFacility.contactEmail}
                        onChange={(e) => setNewFacility({ ...newFacility, contactEmail: e.target.value })}
                        data-testid="input-facility-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Contact Phone</Label>
                      <Input
                        value={newFacility.contactPhone}
                        onChange={(e) => setNewFacility({ ...newFacility, contactPhone: e.target.value })}
                        data-testid="input-facility-phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Installation URL</Label>
                    <Input
                      value={newFacility.installationUrl}
                      onChange={(e) => setNewFacility({ ...newFacility, installationUrl: e.target.value })}
                      placeholder="https://facility.echopath.app"
                      data-testid="input-facility-url"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={newFacility.status}
                        onValueChange={(v) => setNewFacility({ ...newFacility, status: v })}
                      >
                        <SelectTrigger data-testid="select-facility-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onboarding">Onboarding</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Gemini API Key</Label>
                      <Input
                        type="password"
                        value={newFacility.geminiApiKey}
                        onChange={(e) => setNewFacility({ ...newFacility, geminiApiKey: e.target.value })}
                        data-testid="input-facility-apikey"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={addFacilityMutation.isPending} data-testid="button-submit-facility">
                    {addFacilityMutation.isPending ? "Adding..." : "Add Facility"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashData?.facilities?.map((facility) => (
            <Card key={facility.id} className="relative" data-testid={`card-facility-${facility.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusLight status={facility.lastHealthStatus} />
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate" data-testid={`text-facility-name-${facility.id}`}>{facility.name}</CardTitle>
                      <CardDescription className="text-xs truncate">{facility.facilityId}</CardDescription>
                    </div>
                  </div>
                  <FacilityStatusBadge status={facility.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {facility.address && (
                  <p className="text-xs text-muted-foreground truncate">{facility.address}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Residents: </span>
                    <span className="font-medium" data-testid={`text-residents-${facility.id}`}>{facility.activeResidents || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uptime: </span>
                    <span className="font-medium">{facility.uptimePercent}%</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Last check: </span>
                    <span className="font-medium">
                      {facility.lastHealthCheck
                        ? new Date(facility.lastHealthCheck).toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                  {facility.installationUrl && (
                    <div className="col-span-2 truncate">
                      <span className="text-muted-foreground">URL: </span>
                      <span className="font-medium">{facility.installationUrl}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFacility(facility);
                      setShowConfigDialog(true);
                    }}
                    data-testid={`button-config-${facility.id}`}
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Config
                  </Button>
                  <Select
                    value={facility.status}
                    onValueChange={(v) => updateFacilityMutation.mutate({ id: facility.id, data: { status: v } })}
                  >
                    <SelectTrigger className="w-auto" data-testid={`select-status-${facility.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Remove ${facility.name}?`)) {
                        deleteFacilityMutation.mutate(facility.id);
                      }
                    }}
                    data-testid={`button-delete-${facility.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {(!dashData?.facilities || dashData.facilities.length === 0) && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No facilities registered yet</p>
              <p className="text-xs">Click "Add Facility" to register your first installation</p>
            </div>
          )}
        </div>
      </main>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push Configuration - {selectedFacility?.name}</DialogTitle>
            <DialogDescription>Push environment config to {selectedFacility?.facilityId}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Config Key</Label>
                <Input
                  value={configKey}
                  onChange={(e) => setConfigKey(e.target.value)}
                  placeholder="GEMINI_API_KEY"
                  data-testid="input-config-key"
                />
              </div>
              <div className="space-y-1">
                <Label>Config Value</Label>
                <Input
                  value={configValue}
                  onChange={(e) => setConfigValue(e.target.value)}
                  placeholder="AIza..."
                  data-testid="input-config-value"
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!configKey || !configValue || pushConfigMutation.isPending}
              onClick={() => {
                if (selectedFacility) {
                  pushConfigMutation.mutate({
                    id: selectedFacility.id,
                    config: { [configKey]: configValue },
                  });
                }
              }}
              data-testid="button-push-config"
            >
              <Send className="w-4 h-4 mr-1" />
              {pushConfigMutation.isPending ? "Pushing..." : "Push Config"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSetup2FA} onOpenChange={setShowSetup2FA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication Setup</DialogTitle>
            <DialogDescription>Add your authenticator app for enhanced security</DialogDescription>
          </DialogHeader>
          {totpData && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Add this secret key to your authenticator app (Google Authenticator, Authy, etc.):
                </p>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-sm font-mono break-all" data-testid="text-totp-secret">{totpData.secret}</code>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Or use this URI:</p>
                <div className="bg-muted p-3 rounded-md">
                  <code className="text-xs font-mono break-all">{totpData.otpauthUrl}</code>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Enter a code from your authenticator to verify setup:</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="text-center text-xl tracking-widest"
                  data-testid="input-verify-2fa-code"
                />
              </div>
              <Button
                className="w-full"
                disabled={verifyCode.length !== 6 || isVerifying2FA}
                onClick={async () => {
                  setIsVerifying2FA(true);
                  try {
                    const res = await fetch("/api/super-admin/auth/confirm-2fa", {
                      method: "POST",
                      headers: authHeaders(),
                      body: JSON.stringify({ token: verifyCode }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast({ title: "Verification failed", description: data.error, variant: "destructive" });
                      return;
                    }
                    toast({ title: "2FA Enabled", description: "Two-factor authentication is now active" });
                    setShowSetup2FA(false);
                    setVerifyCode("");
                    const adminData = JSON.parse(localStorage.getItem("superAdmin") || "{}");
                    adminData.totpEnabled = true;
                    localStorage.setItem("superAdmin", JSON.stringify(adminData));
                  } catch {
                    toast({ title: "Error", description: "Verification failed", variant: "destructive" });
                  } finally {
                    setIsVerifying2FA(false);
                  }
                }}
                data-testid="button-confirm-2fa"
              >
                <KeyRound className="w-4 h-4 mr-1" />
                {isVerifying2FA ? "Verifying..." : "Verify and Enable 2FA"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
