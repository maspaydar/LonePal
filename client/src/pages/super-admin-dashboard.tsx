import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSuperAdminAuth, getSuperAdminAuthHeaders } from "@/hooks/use-super-admin-auth";
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
  Wrench,
  FileText,
  RotateCcw,
  Database,
  Terminal,
  Download,
  Cpu,
  HardDrive,
  Clock,
  Radio,
  Map,
  Play,
  Megaphone,
  AlertTriangle,
  Speaker,
  Zap,
  Eye,
  Copy,
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

const authHeaders = getSuperAdminAuthHeaders;

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
  const { logout, getAdmin } = useSuperAdminAuth();
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [totpData, setTotpData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  const [activePanel, setActivePanel] = useState<"registry" | "healthmap" | "logstream" | "broadcast" | "recovery" | "provision">("registry");

  const [showMaintenance, setShowMaintenance] = useState(false);
  const [maintenanceFacility, setMaintenanceFacility] = useState<Facility | null>(null);
  const [maintenanceTab, setMaintenanceTab] = useState<"logs" | "services" | "cache" | "diagnostics">("logs");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logFileName, setLogFileName] = useState<string>("");
  const [availableLogFiles, setAvailableLogFiles] = useState<string[]>([]);
  const [selectedLogFile, setSelectedLogFile] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [maintenanceHistory, setMaintenanceHistory] = useState<any[]>([]);

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
        logout();
        throw new Error("Unauthorized");
      }
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: facilitiesData } = useQuery<Facility[]>({
    queryKey: ["/api/super-admin/facilities"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/facilities", { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        logout();
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
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/facilities"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/facilities"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/facilities"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/facilities"] });
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
    logout();
  }

  async function openMaintenance(facility: Facility) {
    setMaintenanceFacility(facility);
    setMaintenanceTab("logs");
    setLogLines([]);
    setLogFileName("");
    setAvailableLogFiles([]);
    setSelectedLogFile("");
    setDiagnosticsData(null);
    setMaintenanceHistory([]);
    setShowMaintenance(true);

    try {
      const res = await fetch(`/api/super-admin/facilities/${facility.id}/maintenance-logs?limit=20`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceHistory(data);
      }
    } catch {}
  }

  async function fetchLogs(facilityId: number, logFile?: string) {
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/super-admin/facilities/${facilityId}/maintenance/logs`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ logFile: logFile || undefined, lines: 100 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setLogLines(data.lines || []);
      setLogFileName(data.file || "");
      setAvailableLogFiles(data.availableFiles || []);
    } catch {
      toast({ title: "Error", description: "Failed to fetch logs", variant: "destructive" });
    } finally {
      setIsLoadingLogs(false);
    }
  }

  async function fetchDiagnostics(facilityId: number) {
    setIsLoadingDiagnostics(true);
    try {
      const res = await fetch(`/api/super-admin/facilities/${facilityId}/maintenance/diagnostics`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setDiagnosticsData(data);
    } catch {
      toast({ title: "Error", description: "Failed to fetch diagnostics", variant: "destructive" });
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }

  const restartServiceMutation = useMutation({
    mutationFn: async ({ facilityId, service }: { facilityId: number; service: string }) => {
      const res = await fetch(`/api/super-admin/facilities/${facilityId}/maintenance/restart-service`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Service Restarted", description: data.result });
    },
    onError: (err: Error) => {
      toast({ title: "Restart Failed", description: err.message, variant: "destructive" });
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: async ({ facilityId, cache }: { facilityId: number; cache: string }) => {
      const res = await fetch(`/api/super-admin/facilities/${facilityId}/maintenance/clear-cache`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ cache }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Cache Cleared", description: data.result || "All caches cleared" });
    },
    onError: (err: Error) => {
      toast({ title: "Cache Clear Failed", description: err.message, variant: "destructive" });
    },
  });

  const admin = getAdmin();

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
              <h1 className="text-sm font-semibold" data-testid="text-dashboard-title">HeyGrand Command Hub</h1>
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

        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: "registry", label: "Facility Registry", icon: Building2 },
            { id: "provision", label: "Provision Company", icon: Plus },
            { id: "healthmap", label: "Health Map", icon: Map },
            { id: "logstream", label: "Log Stream", icon: Radio },
            { id: "broadcast", label: "Broadcast", icon: Megaphone },
            { id: "recovery", label: "Recovery", icon: Terminal },
          ] as const).map((tab) => (
            <Button
              key={tab.id}
              variant={activePanel === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActivePanel(tab.id)}
              data-testid={`button-panel-${tab.id}`}
            >
              <tab.icon className="w-4 h-4 mr-1" />
              {tab.label}
            </Button>
          ))}
        </div>

        {activePanel === "registry" && (<RegistryPanel
          dashData={dashData}
          facilities={facilitiesData}
          healthCheckMutation={healthCheckMutation}
          showAddFacility={showAddFacility}
          setShowAddFacility={setShowAddFacility}
          newFacility={newFacility}
          setNewFacility={setNewFacility}
          addFacilityMutation={addFacilityMutation}
          deleteFacilityMutation={deleteFacilityMutation}
          updateFacilityMutation={updateFacilityMutation}
          openMaintenance={openMaintenance}
          setSelectedFacility={setSelectedFacility}
          setShowConfigDialog={setShowConfigDialog}
        />)}

        {activePanel === "provision" && (<ProvisionCompanyPanel />)}
        {activePanel === "healthmap" && (<HealthMapPanel />)}
        {activePanel === "logstream" && (<LogStreamPanel />)}
        {activePanel === "broadcast" && (<BroadcastPanel />)}
        {activePanel === "recovery" && (<RecoveryPanel dashData={dashData} />)}
      </main>

      <ConfigDialog
        showConfigDialog={showConfigDialog}
        setShowConfigDialog={setShowConfigDialog}
        selectedFacility={selectedFacility}
        configKey={configKey}
        setConfigKey={setConfigKey}
        configValue={configValue}
        setConfigValue={setConfigValue}
        pushConfigMutation={pushConfigMutation}
      />

      <TwoFADialog
        showSetup2FA={showSetup2FA}
        setShowSetup2FA={setShowSetup2FA}
        totpData={totpData}
        verifyCode={verifyCode}
        setVerifyCode={setVerifyCode}
        isVerifying2FA={isVerifying2FA}
        setIsVerifying2FA={setIsVerifying2FA}
        toast={toast}
      />

      <MaintenanceDialog
        showMaintenance={showMaintenance}
        setShowMaintenance={setShowMaintenance}
        maintenanceFacility={maintenanceFacility}
        maintenanceTab={maintenanceTab}
        setMaintenanceTab={setMaintenanceTab}
        logLines={logLines}
        logFileName={logFileName}
        availableLogFiles={availableLogFiles}
        selectedLogFile={selectedLogFile}
        setSelectedLogFile={setSelectedLogFile}
        isLoadingLogs={isLoadingLogs}
        diagnosticsData={diagnosticsData}
        isLoadingDiagnostics={isLoadingDiagnostics}
        maintenanceHistory={maintenanceHistory}
        fetchLogs={fetchLogs}
        fetchDiagnostics={fetchDiagnostics}
        restartServiceMutation={restartServiceMutation}
        clearCacheMutation={clearCacheMutation}
        toast={toast}
      />
    </div>
  );
}

function ProvisionCompanyPanel() {
  const { toast } = useToast();
  const { logout } = useSuperAdminAuth();
  const [form, setForm] = useState({
    name: "",
    type: "facility",
    address: "",
    contactEmail: "",
    contactPhone: "",
    geminiApiKey: "",
  });
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [result, setResult] = useState<{
    id: number;
    name: string;
    defaultAdminCredentials: { username: string; password: string; note: string };
  } | null>(null);

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setIsProvisioning(true);
    setResult(null);
    try {
      const body: Record<string, string | boolean> = {
        name: form.name,
        type: form.type,
        isActive: true,
      };
      if (form.address) body.address = form.address;
      if (form.contactEmail) body.contactEmail = form.contactEmail;
      if (form.contactPhone) body.contactPhone = form.contactPhone;
      if (form.geminiApiKey) body.geminiApiKey = form.geminiApiKey;

      const res = await fetch("/api/entities", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Provisioning failed", description: data.error || "Unknown error", variant: "destructive" });
        return;
      }
      setResult(data);
      setForm({ name: "", type: "facility", address: "", contactEmail: "", contactPhone: "", geminiApiKey: "" });
      toast({ title: "Company provisioned", description: `${data.name} is ready. Save the credentials below.` });
    } catch {
      toast({ title: "Error", description: "Failed to provision company", variant: "destructive" });
    } finally {
      setIsProvisioning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-provision-title">Provision New Company</h2>
          <p className="text-sm text-muted-foreground">Create a new tenant entity with default admin credentials</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProvision} className="space-y-3">
              <div className="space-y-1">
                <Label>Company Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sunrise Gardens Senior Living"
                  required
                  data-testid="input-provision-name"
                />
              </div>
              <div className="space-y-1">
                <Label>Facility Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger data-testid="select-provision-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facility">Facility</SelectItem>
                    <SelectItem value="hospital">Hospital</SelectItem>
                    <SelectItem value="clinic">Clinic</SelectItem>
                    <SelectItem value="home_care">Home Care</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, City, ST 12345"
                  data-testid="input-provision-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    placeholder="admin@facility.com"
                    data-testid="input-provision-email"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Contact Phone</Label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    placeholder="+1 555-000-0000"
                    data-testid="input-provision-phone"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Gemini API Key</Label>
                <Input
                  type="password"
                  value={form.geminiApiKey}
                  onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                  data-testid="input-provision-apikey"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!form.name || isProvisioning}
                data-testid="button-provision-company"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isProvisioning ? "Provisioning..." : "Provision Company Tenant"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {result ? (
            <Card className="border-green-500/50 bg-green-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Shield className="w-4 h-4" />
                  Company Provisioned Successfully
                </CardTitle>
                <CardDescription>Save these credentials immediately — the password cannot be retrieved again</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Company</p>
                  <p className="text-sm font-semibold" data-testid="text-provision-result-name">{result.name}</p>
                  <p className="text-xs text-muted-foreground">Entity ID: {result.id}</p>
                </div>
                <div className="bg-muted rounded-md p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin Credentials</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Username</span>
                      <div className="flex items-center gap-1">
                        <code className="text-sm font-mono font-bold" data-testid="text-provision-username">
                          {result.defaultAdminCredentials.username}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { navigator.clipboard.writeText(result.defaultAdminCredentials.username); toast({ title: "Copied username" }); }}
                          data-testid="button-copy-username"
                          title="Copy username"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Password</span>
                      <div className="flex items-center gap-1">
                        <code className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400" data-testid="text-provision-password">
                          {result.defaultAdminCredentials.password}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { navigator.clipboard.writeText(result.defaultAdminCredentials.password); toast({ title: "Copied password" }); }}
                          data-testid="button-copy-password"
                          title="Copy password"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{result.defaultAdminCredentials.note}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Provisioning credentials will appear here</p>
                <p className="text-xs mt-1">Each company gets a unique admin account with a one-time password</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">What happens when you provision?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { icon: Building2, text: "A new tenant entity is created in the database" },
                { icon: Users, text: "A default admin user is generated with a secure one-time password" },
                { icon: Shield, text: "The admin can log into the Company Admin portal at /company/login" },
                { icon: Settings, text: "The company can then manage residents, sensors, and units" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <item.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{item.text}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface NewFacilityForm {
  facilityId: string;
  name: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  installationUrl: string;
  status: string;
  geminiApiKey: string;
}

interface RegistryPanelProps {
  dashData: DashboardData | undefined;
  facilities: Facility[] | undefined;
  healthCheckMutation: { mutate: () => void; isPending: boolean };
  showAddFacility: boolean;
  setShowAddFacility: (v: boolean) => void;
  newFacility: NewFacilityForm;
  setNewFacility: (v: NewFacilityForm) => void;
  addFacilityMutation: { mutate: () => void; isPending: boolean };
  deleteFacilityMutation: { mutate: (id: number) => void; isPending: boolean };
  updateFacilityMutation: { mutate: (args: { id: number; data: Record<string, string> }) => void; isPending: boolean };
  openMaintenance: (facility: Facility) => void;
  setSelectedFacility: (facility: Facility) => void;
  setShowConfigDialog: (v: boolean) => void;
}

function RegistryPanel({ dashData, facilities, healthCheckMutation, showAddFacility, setShowAddFacility, newFacility, setNewFacility, addFacilityMutation, deleteFacilityMutation, updateFacilityMutation, openMaintenance, setSelectedFacility, setShowConfigDialog }: RegistryPanelProps) {
  const { toast } = useToast();
  const { logout } = useSuperAdminAuth();
  const [facilityHealthResults, setFacilityHealthResults] = useState<Record<number, { status: string; responseTimeMs?: number; loading?: boolean }>>({}); 

  async function checkFacilityHealth(facility: Facility) {
    setFacilityHealthResults(prev => ({ ...prev, [facility.id]: { ...prev[facility.id], loading: true, status: "checking" } }));
    try {
      const res = await fetch(`/api/super-admin/facilities/${facility.id}/health-check`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      const data = await res.json();
      setFacilityHealthResults(prev => ({ ...prev, [facility.id]: { loading: false, status: data.status, responseTimeMs: data.responseTimeMs } }));
      toast({
        title: `Health: ${facility.name}`,
        description: data.status === "healthy"
          ? `Healthy — ${data.responseTimeMs}ms`
          : data.status === "no_url"
          ? "No installation URL configured"
          : `Status: ${data.status}`,
        variant: data.status === "healthy" ? "default" : "destructive",
      });
    } catch {
      setFacilityHealthResults(prev => ({ ...prev, [facility.id]: { loading: false, status: "error" } }));
      toast({ title: "Health check failed", description: `Could not reach ${facility.name}`, variant: "destructive" });
    }
  }

  return (
    <>
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
                      placeholder="https://facility.heygrand.app"
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
          {(facilities ?? []).map((facility: Facility) => (
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
                    onClick={() => openMaintenance(facility)}
                    data-testid={`button-maintenance-${facility.id}`}
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Remote Fix
                  </Button>
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
                    Push Config
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkFacilityHealth(facility)}
                    disabled={facilityHealthResults[facility.id]?.loading}
                    data-testid={`button-health-${facility.id}`}
                  >
                    <Activity className={`w-3 h-3 mr-1 ${facilityHealthResults[facility.id]?.loading ? "animate-spin" : ""}`} />
                    {facilityHealthResults[facility.id]?.loading
                      ? "Checking..."
                      : facilityHealthResults[facility.id]?.status
                        ? facilityHealthResults[facility.id].status === "healthy"
                          ? `✓ ${facilityHealthResults[facility.id].responseTimeMs}ms`
                          : facilityHealthResults[facility.id].status
                        : "Check Health"
                    }
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

          {(!facilities || facilities.length === 0) && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No facilities registered yet</p>
              <p className="text-xs">Click "Add Facility" to register your first installation</p>
            </div>
          )}
        </div>
    </>
  );
}

function HealthMapPanel() {
  const { toast } = useToast();
  const [heartbeatData, setHeartbeatData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function fetchHeartbeat() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/facilities/heartbeat-all", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      setHeartbeatData(data);
    } catch {
      toast({ title: "Error", description: "Failed to fetch heartbeat data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold" data-testid="text-healthmap-title">Hardware Health Map</h2>
        <Button
          size="sm"
          onClick={fetchHeartbeat}
          disabled={isLoading}
          data-testid="button-fetch-heartbeat"
        >
          <Radio className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Scanning..." : "Scan All Facilities"}
        </Button>
      </div>

      {!heartbeatData && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Map className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Click "Scan All Facilities" to load the hardware health map</p>
          </CardContent>
        </Card>
      )}

      {heartbeatData?.facilities?.map((facility: any) => (
        <Card key={facility.facilityId} data-testid={`card-heartbeat-${facility.facilityId}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CircleDot className={`w-4 h-4 ${facility.status === "online" ? "text-green-500" : facility.status === "unreachable" ? "text-red-500" : "text-muted-foreground"}`} />
                {facility.name || facility.facilityId}
              </CardTitle>
              <Badge variant={facility.status === "online" ? "default" : "destructive"}>
                {facility.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {facility.entities?.map((entity: any) => (
              <div key={entity.entityId} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{entity.entityName} - {entity.totalUnits} units</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {entity.units?.map((unit: any) => (
                    <div key={unit.unitId} className="border rounded-md p-3 space-y-2" data-testid={`unit-heartbeat-${unit.unitId}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{unit.unitIdentifier}</span>
                        {unit.floor && <span className="text-xs text-muted-foreground">Floor {unit.floor}</span>}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1">
                            <Speaker className="w-3 h-3" />
                            Speaker
                          </span>
                          {unit.smartSpeaker?.id ? (
                            <Badge variant={unit.smartSpeaker.healthy !== false ? "default" : "destructive"} className="text-[10px]">
                              {unit.smartSpeaker.healthy !== false ? "OK" : `Fail (${unit.smartSpeaker.consecutiveFailures})`}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">N/A</Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            Sensors
                          </span>
                          <Badge variant={unit.sensorsActive > 0 ? "default" : "outline"} className="text-[10px]">
                            {unit.sensorsActive}/{unit.sensorsTotal} active
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            Resident
                          </span>
                          {unit.residentAssigned ? (
                            <span className="text-foreground font-medium">{unit.residentName}</span>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </div>
                        {unit.residentStatus && (
                          <div className="flex items-center justify-between gap-2">
                            <span>Status</span>
                            <Badge variant={unit.residentStatus === "safe" ? "default" : "destructive"} className="text-[10px]">
                              {unit.residentStatus}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {entity.units?.length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-full">No units configured</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {heartbeatData && heartbeatData.facilities?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No facilities to scan</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LogStreamPanel() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");

  async function fetchCentralLogs() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (severityFilter !== "all") params.append("severity", severityFilter);
      const res = await fetch(`/api/super-admin/central-logs?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setLogs(data);
    } catch {
      toast({ title: "Error", description: "Failed to fetch central logs", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-600 dark:text-red-400";
      case "error": return "text-red-500 dark:text-red-400";
      case "warning": return "text-amber-600 dark:text-amber-400";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold" data-testid="text-logstream-title">Centralized Log Stream</h2>
        <div className="flex items-center gap-2">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-auto" data-testid="select-severity-filter">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetchCentralLogs} disabled={isLoading} data-testid="button-fetch-central-logs">
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {logs.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Radio className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No log entries yet. Click "Refresh" to load centralized logs.</p>
            <p className="text-xs mt-1">Critical errors and safety alerts are streamed here in real-time.</p>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardContent className="py-3 px-0">
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Severity</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Facility</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Source</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry: any) => (
                    <tr key={entry.id} className="border-b last:border-0" data-testid={`row-log-${entry.id}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={entry.severity === "critical" ? "destructive" : entry.severity === "error" ? "destructive" : entry.severity === "warning" ? "secondary" : "outline"} className="text-[10px]">
                          {entry.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{entry.facilityName}</td>
                      <td className="px-4 py-2 font-mono">{entry.source}</td>
                      <td className={`px-4 py-2 ${severityColor(entry.severity)}`}>{entry.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BroadcastPanel() {
  const { toast } = useToast();
  const [broadcastKey, setBroadcastKey] = useState("");
  const [broadcastValue, setBroadcastValue] = useState("");
  const [broadcastDescription, setBroadcastDescription] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  async function handleBroadcast() {
    if (!broadcastKey || !broadcastValue) return;
    setIsBroadcasting(true);
    try {
      const res = await fetch("/api/super-admin/broadcast-config", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          config: { [broadcastKey]: broadcastValue },
          description: broadcastDescription || `Update ${broadcastKey}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results || []);
      toast({ title: "Broadcast Complete", description: `Pushed to ${data.pushed}/${data.total} facilities` });
      setBroadcastKey("");
      setBroadcastValue("");
      setBroadcastDescription("");
    } catch (err: any) {
      toast({ title: "Broadcast Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsBroadcasting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold" data-testid="text-broadcast-title">Global Update Dispatcher</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Broadcast Configuration to All Facilities</CardTitle>
          <CardDescription className="text-xs">Push a config change (security patch, AI prompt update, etc.) to every active facility at once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Config Key</Label>
              <Input
                value={broadcastKey}
                onChange={(e) => setBroadcastKey(e.target.value)}
                placeholder="AI_SYSTEM_PROMPT"
                data-testid="input-broadcast-key"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Config Value</Label>
              <Input
                value={broadcastValue}
                onChange={(e) => setBroadcastValue(e.target.value)}
                placeholder="Updated prompt text..."
                data-testid="input-broadcast-value"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={broadcastDescription}
              onChange={(e) => setBroadcastDescription(e.target.value)}
              placeholder="Security patch v2.1 - updated AI prompt"
              data-testid="input-broadcast-desc"
            />
          </div>
          <Button
            onClick={handleBroadcast}
            disabled={!broadcastKey || !broadcastValue || isBroadcasting}
            className="w-full"
            data-testid="button-broadcast-push"
          >
            <Megaphone className="w-4 h-4 mr-1" />
            {isBroadcasting ? "Broadcasting..." : "Broadcast to All Active Facilities"}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Broadcast Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs" data-testid={`text-broadcast-result-${i}`}>
                  <div className="flex items-center gap-2">
                    <CircleDot className={`w-3 h-3 ${r.status === "success" ? "text-green-500" : "text-red-500"}`} />
                    <span className="font-medium">{r.name || r.facilityId}</span>
                  </div>
                  <Badge variant={r.status === "success" ? "default" : "destructive"} className="text-[10px]">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecoveryPanel({ dashData }: { dashData: DashboardData | undefined }) {
  const { toast } = useToast();
  const [scripts, setScripts] = useState<any[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [selectedFacilityForRecovery, setSelectedFacilityForRecovery] = useState<string>("");
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [recoveryHistory, setRecoveryHistory] = useState<any[]>([]);

  async function fetchScripts() {
    setIsLoadingScripts(true);
    try {
      const res = await fetch("/api/super-admin/recovery-scripts", {
        headers: authHeaders(),
      });
      const data = await res.json();
      setScripts(data);
    } catch {
      toast({ title: "Error", description: "Failed to load recovery scripts", variant: "destructive" });
    } finally {
      setIsLoadingScripts(false);
    }
  }

  async function executeScript(scriptId: number) {
    if (!selectedFacilityForRecovery) {
      toast({ title: "Select a facility", description: "Choose which facility to run the recovery on", variant: "destructive" });
      return;
    }
    setIsExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch(`/api/super-admin/facilities/${selectedFacilityForRecovery}/execute-recovery`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ scriptId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExecutionResult(data);
      toast({ title: "Recovery Complete", description: `Script executed in ${data.executionTimeMs}ms` });

      const histRes = await fetch(`/api/super-admin/facilities/${selectedFacilityForRecovery}/recovery-logs?limit=10`, {
        headers: authHeaders(),
      });
      if (histRes.ok) setRecoveryHistory(await histRes.json());
    } catch (err: any) {
      toast({ title: "Recovery Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold" data-testid="text-recovery-title">Recovery Scripts</h2>
        <div className="flex items-center gap-2">
          <Select value={selectedFacilityForRecovery} onValueChange={setSelectedFacilityForRecovery}>
            <SelectTrigger className="w-auto" data-testid="select-recovery-facility">
              <SelectValue placeholder="Select facility" />
            </SelectTrigger>
            <SelectContent>
              {dashData?.facilities?.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={fetchScripts} disabled={isLoadingScripts} data-testid="button-load-scripts">
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoadingScripts ? "animate-spin" : ""}`} />
            {isLoadingScripts ? "Loading..." : "Load Scripts"}
          </Button>
        </div>
      </div>

      {scripts.length === 0 && !isLoadingScripts && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Click "Load Scripts" to view available recovery operations</p>
            <p className="text-xs mt-1">Pre-defined scripts fix common database, connectivity, and service issues.</p>
          </CardContent>
        </Card>
      )}

      {scripts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {scripts.map((script: any) => (
            <Card key={script.id} data-testid={`card-script-${script.id}`}>
              <CardContent className="py-4 px-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{script.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{script.description}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{script.scriptType}</Badge>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(script.commandSequence as string[])?.map((cmd: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-mono">{cmd}</Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={isExecuting || !selectedFacilityForRecovery}
                  onClick={() => executeScript(script.id)}
                  data-testid={`button-run-script-${script.id}`}
                >
                  <Play className="w-3 h-3 mr-1" />
                  {isExecuting ? "Executing..." : "Run Script"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {executionResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CircleDot className="w-4 h-4 text-green-500" />
              Execution Result - {executionResult.script}
            </CardTitle>
            <CardDescription className="text-xs">Completed in {executionResult.executionTimeMs}ms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-md p-3 font-mono text-xs space-y-1" data-testid="container-execution-result">
              {executionResult.results && Object.entries(executionResult.results).map(([cmd, result]: [string, any]) => (
                <div key={cmd}>
                  <span className="text-muted-foreground">$ {cmd}: </span>
                  <span>{String(result)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recoveryHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recovery History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-auto">
              {recoveryHistory.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between gap-2 text-xs" data-testid={`text-recovery-log-${log.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={log.status === "completed" ? "default" : log.status === "running" ? "secondary" : "destructive"} className="text-[10px]">
                      {log.status}
                    </Badge>
                    <span className="text-muted-foreground truncate">Script #{log.scriptId}</span>
                    <span className="text-muted-foreground">{log.initiatedBy}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ConfigDialog({ showConfigDialog, setShowConfigDialog, selectedFacility, configKey, setConfigKey, configValue, setConfigValue, pushConfigMutation }: any) {
  return (
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
  );
}

function TwoFADialog({ showSetup2FA, setShowSetup2FA, totpData, verifyCode, setVerifyCode, isVerifying2FA, setIsVerifying2FA, toast }: any) {
  return (
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
                  const adminData = JSON.parse(localStorage.getItem("sa_admin") || "{}");
                  adminData.totpEnabled = true;
                  localStorage.setItem("sa_admin", JSON.stringify(adminData));
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
  );
}

function MaintenanceDialog({ showMaintenance, setShowMaintenance, maintenanceFacility, maintenanceTab, setMaintenanceTab, logLines, logFileName, availableLogFiles, selectedLogFile, setSelectedLogFile, isLoadingLogs, diagnosticsData, isLoadingDiagnostics, maintenanceHistory, fetchLogs, fetchDiagnostics, restartServiceMutation, clearCacheMutation }: any) {
  return (
    <Dialog open={showMaintenance} onOpenChange={setShowMaintenance}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Remote Diagnostics - {maintenanceFacility?.name}
          </DialogTitle>
          <DialogDescription>
            Remote maintenance tunnel for {maintenanceFacility?.facilityId}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 flex-wrap">
          {(["logs", "services", "cache", "diagnostics"] as const).map((tab) => (
            <Button
              key={tab}
              variant={maintenanceTab === tab ? "default" : "outline"}
              size="sm"
              onClick={() => setMaintenanceTab(tab)}
              data-testid={`button-tab-${tab}`}
            >
              {tab === "logs" && <FileText className="w-3 h-3 mr-1" />}
              {tab === "services" && <RotateCcw className="w-3 h-3 mr-1" />}
              {tab === "cache" && <Database className="w-3 h-3 mr-1" />}
              {tab === "diagnostics" && <Cpu className="w-3 h-3 mr-1" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
        </div>

        {maintenanceTab === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => maintenanceFacility && fetchLogs(maintenanceFacility.id, selectedLogFile || undefined)}
                disabled={isLoadingLogs}
                data-testid="button-fetch-logs"
              >
                <Download className="w-3 h-3 mr-1" />
                {isLoadingLogs ? "Loading..." : "Fetch Logs"}
              </Button>
              {availableLogFiles.length > 0 && (
                <Select value={selectedLogFile} onValueChange={(v) => setSelectedLogFile(v)}>
                  <SelectTrigger className="w-auto" data-testid="select-log-file">
                    <SelectValue placeholder="Latest log file" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLogFiles.map((f: string) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {logFileName && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{logFileName}</Badge>
                <span className="text-xs text-muted-foreground">{logLines.length} lines</span>
              </div>
            )}
            <div
              className="bg-muted rounded-md p-3 font-mono text-xs max-h-64 overflow-auto"
              data-testid="container-log-viewer"
            >
              {logLines.length === 0 ? (
                <p className="text-muted-foreground">No logs loaded. Click "Fetch Logs" to retrieve facility logs.</p>
              ) : (
                logLines.map((line: string, i: number) => {
                  let parsed: any = null;
                  try { parsed = JSON.parse(line); } catch {}
                  const levelColor = parsed?.level === "ERROR"
                    ? "text-red-500"
                    : parsed?.level === "WARN"
                      ? "text-amber-500"
                      : "text-foreground";
                  return (
                    <div key={i} className={`whitespace-pre-wrap break-all ${levelColor}`} data-testid={`text-log-line-${i}`}>
                      {parsed
                        ? `[${parsed.timestamp?.slice(11, 19) || ""}] [${parsed.level}] ${parsed.source}: ${parsed.message}`
                        : line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {maintenanceTab === "services" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Restart individual services on the facility backend without a full redeploy.
            </p>
            {[
              { id: "ai-engine", label: "AI Engine", desc: "Reset Gemini client connection", icon: Cpu },
              { id: "inactivity-monitor", label: "Inactivity Monitor", desc: "Restart monitoring timers", icon: Clock },
              { id: "websocket", label: "WebSocket", desc: "Refresh client connections", icon: Wifi },
            ].map((svc) => (
              <Card key={svc.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <svc.icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{svc.label}</p>
                      <p className="text-xs text-muted-foreground">{svc.desc}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restartServiceMutation.isPending}
                    onClick={() => maintenanceFacility && restartServiceMutation.mutate({
                      facilityId: maintenanceFacility.id,
                      service: svc.id,
                    })}
                    data-testid={`button-restart-${svc.id}`}
                  >
                    <RotateCcw className={`w-3 h-3 mr-1 ${restartServiceMutation.isPending ? "animate-spin" : ""}`} />
                    Restart
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {maintenanceTab === "cache" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Clear specific caches or all caches on the facility backend.
            </p>
            <Button
              size="sm"
              variant="destructive"
              disabled={clearCacheMutation.isPending}
              onClick={() => maintenanceFacility && clearCacheMutation.mutate({
                facilityId: maintenanceFacility.id,
                cache: "all",
              })}
              data-testid="button-clear-all-cache"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              {clearCacheMutation.isPending ? "Clearing..." : "Clear All Caches"}
            </Button>
            {[
              { id: "persona-cache", label: "AI Persona Cache", desc: "In-memory persona prompts for residents", icon: Cpu },
              { id: "query-cache", label: "Query Cache", desc: "Application query results", icon: Database },
              { id: "temp-files", label: "Temporary Files", desc: "Files in data/tmp directory", icon: HardDrive },
            ].map((cache) => (
              <Card key={cache.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <cache.icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{cache.label}</p>
                      <p className="text-xs text-muted-foreground">{cache.desc}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={clearCacheMutation.isPending}
                    onClick={() => maintenanceFacility && clearCacheMutation.mutate({
                      facilityId: maintenanceFacility.id,
                      cache: cache.id,
                    })}
                    data-testid={`button-clear-${cache.id}`}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {maintenanceTab === "diagnostics" && (
          <div className="space-y-3">
            <Button
              size="sm"
              onClick={() => maintenanceFacility && fetchDiagnostics(maintenanceFacility.id)}
              disabled={isLoadingDiagnostics}
              data-testid="button-fetch-diagnostics"
            >
              <Cpu className="w-3 h-3 mr-1" />
              {isLoadingDiagnostics ? "Loading..." : "Run Diagnostics"}
            </Button>
            {diagnosticsData && (
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-lg font-bold" data-testid="text-diag-uptime">
                      {Math.floor(diagnosticsData.uptime / 3600)}h {Math.floor((diagnosticsData.uptime % 3600) / 60)}m
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Memory (Heap)</p>
                    <p className="text-lg font-bold" data-testid="text-diag-memory">
                      {diagnosticsData.memoryUsage?.heapUsed}MB / {diagnosticsData.memoryUsage?.heapTotal}MB
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Node Version</p>
                    <p className="text-sm font-medium" data-testid="text-diag-node">{diagnosticsData.nodeVersion}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">Log Files</p>
                    <p className="text-lg font-bold" data-testid="text-diag-logs">{diagnosticsData.logFileCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">RSS Memory</p>
                    <p className="text-lg font-bold">{diagnosticsData.memoryUsage?.rss}MB</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs text-muted-foreground">PID</p>
                    <p className="text-sm font-medium">{diagnosticsData.pid}</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {maintenanceHistory.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">Recent Maintenance Activity</p>
            <div className="space-y-1 max-h-32 overflow-auto">
              {maintenanceHistory.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between gap-2 text-xs" data-testid={`text-maint-log-${log.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={log.status === "completed" ? "default" : "destructive"} className="text-[10px]">
                      {log.action}
                    </Badge>
                    <span className="text-muted-foreground truncate">{log.command}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
