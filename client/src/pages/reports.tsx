import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Bell,
  Shield,
  Radio,
  MessageSquare,
  Download,
  FileText,
  TrendingUp,
  Activity,
  Megaphone,
} from "lucide-react";
import { getCompanyEntityId, getCompanyAuthHeaders } from "@/hooks/use-company-auth";
import { useCompanyAuth } from "@/hooks/use-company-auth";

const SEVERITY_COLORS: Record<string, string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  critical: "#ef4444",
  emergency: "#7c3aed",
};

const STATUS_COLORS: Record<string, string> = {
  safe: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

const SCENARIO_TYPE_LABELS: Record<string, string> = {
  inactivity_gentle: "Gentle Check-in",
  inactivity_urgent: "Urgent Inactivity",
  fall_detected: "Fall Detected",
  bathroom_extended: "Extended Bathroom",
  shower_extended: "Extended Shower",
  custom: "Custom",
};

const PIE_COLORS = ["#6366f1", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

type DayRange = 7 | 30 | 90;

interface SummaryData {
  period: { days: number; since: string };
  overview: {
    totalResidents: number;
    activeResidents: number;
    openAlerts: number;
    activeScenarios: number;
    totalSensors: number;
    activeSensors: number;
  };
  alertsBySeverity: { severity: string; count: number }[];
  alertTrend: { date: string; count: number }[];
  scenarioTypes: { type: string; count: number }[];
  residentStatuses: { status: string; count: number }[];
  engagement: {
    totalConversations: number;
    totalMessages: number;
    totalBroadcasts: number;
  };
}

interface DetailsData {
  period: { days: number; since: string };
  residents: {
    id: number;
    name: string;
    preferredName: string | null;
    roomNumber: string | null;
    status: string;
    lastActivityAt: string | null;
    conversationCount: number;
    messageCount: number;
  }[];
  conversationsPerResident: { residentId: number; residentName: string; count: number }[];
  alertSummary: { total: number; acknowledged: number; unacknowledged: number };
}

function KpiCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color = "text-foreground",
  testId,
}: {
  icon: React.ElementType;
  title: string;
  value: number | string;
  subtitle?: string;
  color?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0 mt-0.5">
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p className={`text-2xl font-bold ${color}`} data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    safe: "default",
    amber: "secondary",
    red: "destructive",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className="capitalize" data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
  );
}

export default function ReportsPage() {
  const [days, setDays] = useState<DayRange>(30);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const entityId = getCompanyEntityId();
  const { getEntity } = useCompanyAuth();
  const entity = getEntity();

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: [`/api/entities/${entityId}/reports/summary`, days],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${entityId}/reports/summary?days=${days}`, {
        headers: getCompanyAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch report summary");
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 60000,
  });

  const { data: details, isLoading: detailsLoading } = useQuery<DetailsData>({
    queryKey: [`/api/entities/${entityId}/reports/details`, days],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${entityId}/reports/details?days=${days}`, {
        headers: getCompanyAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch report details");
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 60000,
  });

  async function handleExportPDF() {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const headerHeight = 18;
      const contentWidth = pageWidth - 2 * margin;

      function addHeader(isFirstPage: boolean) {
        pdf.setFillColor(79, 70, 229);
        pdf.rect(0, 0, pageWidth, headerHeight, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${entity?.name ?? "Facility"} — Management Report`, margin, 11.5);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        const label = isFirstPage
          ? `Generated ${new Date().toLocaleDateString("en-US", { dateStyle: "full" })} · Last ${days} days`
          : `${entity?.name ?? "Facility"} · Last ${days} days`;
        pdf.text(label, pageWidth - margin, 11.5, { align: "right" });
        pdf.setTextColor(0, 0, 0);
      }

      // Calculate how much of the canvas fits per page in pixels
      const availablePageHeight = pageHeight - headerHeight - margin;
      // Scale factor: how many canvas pixels fit in one mm
      const canvasPxPerMm = canvas.width / contentWidth;
      const pageSlicePx = availablePageHeight * canvasPxPerMm;

      let offsetPx = 0;
      let isFirstPage = true;

      while (offsetPx < canvas.height) {
        if (!isFirstPage) pdf.addPage();

        addHeader(isFirstPage);
        isFirstPage = false;

        const sliceHeight = Math.min(pageSlicePx, canvas.height - offsetPx);

        // Create a temporary canvas for this slice
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;
        const ctx = sliceCanvas.getContext("2d");
        if (!ctx) break;
        ctx.drawImage(canvas, 0, -offsetPx);

        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
        const slicePdfHeight = sliceHeight / canvasPxPerMm;

        pdf.addImage(sliceData, "JPEG", margin, headerHeight, contentWidth, slicePdfHeight);

        offsetPx += sliceHeight;
      }

      const facilitySlug = (entity?.name ?? "facility").toLowerCase().replace(/\s+/g, "-");
      pdf.save(`${facilitySlug}-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }

  const isLoading = summaryLoading || detailsLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-reports-title">
            <FileText className="w-6 h-6" />
            Facility Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Management insights for {entity?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md p-1" data-testid="select-days-range">
            {([7, 30, 90] as DayRange[]).map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "ghost"}
                size="sm"
                onClick={() => setDays(d)}
                data-testid={`button-days-${d}`}
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button
            onClick={handleExportPDF}
            disabled={isLoading || isExporting}
            data-testid="button-export-pdf"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6 bg-background">
        {/* Section 1: Facility Overview */}
        <section data-testid="section-overview">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Facility Overview
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard icon={Users} title="Total Residents" value={summary?.overview.totalResidents ?? 0} testId="kpi-total-residents" />
              <KpiCard icon={Users} title="Active Residents" value={summary?.overview.activeResidents ?? 0} color="text-green-600" testId="kpi-active-residents" />
              <KpiCard icon={Bell} title="Open Alerts" value={summary?.overview.openAlerts ?? 0} color={(summary?.overview.openAlerts ?? 0) > 0 ? "text-red-500" : "text-foreground"} testId="kpi-open-alerts" />
              <KpiCard icon={Shield} title="Active Scenarios" value={summary?.overview.activeScenarios ?? 0} color={(summary?.overview.activeScenarios ?? 0) > 0 ? "text-amber-500" : "text-foreground"} testId="kpi-active-scenarios" />
              <KpiCard icon={Radio} title="Total Sensors" value={summary?.overview.totalSensors ?? 0} testId="kpi-total-sensors" />
              <KpiCard icon={MessageSquare} title="AI Conversations" value={summary?.engagement.totalConversations ?? 0} color="text-indigo-500" testId="kpi-total-conversations" />
            </div>
          )}
        </section>

        {/* Section 2: Safety & Incidents */}
        <section data-testid="section-safety">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Safety &amp; Incidents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Alert Trend Line Chart */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Alert Volume — Last {days} Days</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary?.alertTrend ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => {
                          if ((summary?.alertTrend?.length ?? 0) > 14) {
                            const d = new Date(v);
                            return d.getDate() === 1 || d.getDate() % 7 === 0 ? formatDate(v) : "";
                          }
                          return formatDate(v);
                        }}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} className="text-muted-foreground" />
                      <Tooltip
                        labelFormatter={(v) => formatDate(v as string)}
                        formatter={(v) => [`${v} alert${Number(v) !== 1 ? "s" : ""}`, "Alerts"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Alerts by Severity Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Alerts by Severity</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={summary?.alertsBySeverity ?? []}
                      margin={{ top: 5, right: 5, left: -30, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="severity" tick={{ fontSize: 10 }} className="text-muted-foreground capitalize" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} className="text-muted-foreground" />
                      <Tooltip
                        formatter={(v) => [`${v}`, "Count"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {(summary?.alertsBySeverity ?? []).map((entry) => (
                          <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? "#6366f1"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Scenario Types Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scenario Types</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (summary?.scenarioTypes.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No scenarios in this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={summary?.scenarioTypes.map(s => ({ ...s, label: SCENARIO_TYPE_LABELS[s.type] ?? s.type })) ?? []}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="45%"
                        outerRadius={70}
                        label={({ label, percent }) => `${label}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={9}
                      >
                        {(summary?.scenarioTypes ?? []).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, name) => [`${v}`, name]} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Alert Acknowledgment */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Alert Response Summary (Last {days} Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <div className="flex items-center gap-6 h-48">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Acknowledged", value: details?.alertSummary.acknowledged ?? 0 },
                              { name: "Unacknowledged", value: details?.alertSummary.unacknowledged ?? 0 },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={60}
                            innerRadius={35}
                          >
                            <Cell fill="#22c55e" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4 shrink-0">
                      <div>
                        <p className="text-3xl font-bold text-foreground">{details?.alertSummary.total ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Total Alerts</p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold text-green-600">{details?.alertSummary.acknowledged ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Acknowledged</p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold text-red-500">{details?.alertSummary.unacknowledged ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 3: Resident Status */}
        <section data-testid="section-residents">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Resident Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={summary?.residentStatuses.filter(s => s.count > 0) ?? []}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={({ status, percent }) => `${status}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={11}
                      >
                        {(summary?.residentStatuses ?? []).map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#6366f1"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, name) => [`${v} resident${Number(v) !== 1 ? "s" : ""}`, name]} contentStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resident Activity Log</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-sm" data-testid="table-residents">
                      <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm">
                        <tr>
                          <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground">Resident</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Room</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Last Activity</th>
                          <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground">Conversations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(details?.residents ?? []).map((r) => (
                          <tr key={r.id} data-testid={`row-resident-${r.id}`} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-4 font-medium truncate max-w-[140px]">{r.name}</td>
                            <td className="py-2 px-2 text-muted-foreground">{r.roomNumber ?? "—"}</td>
                            <td className="py-2 px-2">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="py-2 px-2 text-muted-foreground text-xs">{formatDateTime(r.lastActivityAt)}</td>
                            <td className="py-2 px-4 text-right text-muted-foreground">{r.conversationCount}</td>
                          </tr>
                        ))}
                        {(details?.residents.length ?? 0) === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">No active residents</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 4: AI Companion Engagement */}
        <section data-testid="section-engagement">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            AI Companion Engagement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3">
              <KpiCard
                icon={MessageSquare}
                title="Total AI Messages"
                value={summary?.engagement.totalMessages ?? 0}
                color="text-indigo-500"
                testId="kpi-total-messages"
              />
              <KpiCard
                icon={Megaphone}
                title="Community Broadcasts"
                value={summary?.engagement.totalBroadcasts ?? 0}
                color="text-blue-500"
                testId="kpi-total-broadcasts"
              />
            </div>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Conversations per Resident</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (details?.conversationsPerResident.length ?? 0) === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No conversation data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={details?.conversationsPerResident ?? []}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} className="text-muted-foreground" />
                      <YAxis
                        type="category"
                        dataKey="residentName"
                        width={100}
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                        tickFormatter={(v) => v.length > 14 ? v.slice(0, 14) + "…" : v}
                      />
                      <Tooltip
                        formatter={(v) => [`${v} conversation${Number(v) !== 1 ? "s" : ""}`, ""]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
