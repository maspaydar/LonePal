import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Bell,
  Shield,
  Zap,
  Brain,
  Megaphone,
  Send,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

function getStatusColor(status: string) {
  switch (status) {
    case "safe": return "bg-status-online";
    case "checking": return "bg-status-away";
    case "alert": return "bg-status-busy";
    case "emergency": return "bg-status-busy";
    default: return "bg-status-offline";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "safe": return "Active";
    case "checking": return "Checking";
    case "alert": return "Alert";
    case "emergency": return "Emergency";
    default: return status;
  }
}

function getMoodColor(score: number) {
  if (score >= 4) return "text-status-online";
  if (score === 3) return "text-muted-foreground";
  if (score >= 1) return "text-status-busy";
  return "text-muted-foreground";
}

function getSeverityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "emergency": return "destructive";
    case "critical": return "destructive";
    case "warning": return "default";
    default: return "secondary";
  }
}

export default function Dashboard() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { toast } = useToast();

  const { data: dashData, isLoading } = useQuery<any>({
    queryKey: [`/api/entities/${eid}/dashboard`],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/ai-insights`],
    enabled: !!dashData && dashData.totalResidents > 0,
    refetchInterval: 60000,
  });

  const { data: broadcasts } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/broadcasts`],
    enabled: !!dashData && dashData.totalResidents > 0,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/seed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/dashboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/ai-insights`] });
      toast({ title: "Demo data loaded successfully" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!dashData || dashData.totalResidents === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
        <Shield className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold" data-testid="text-empty-state">Welcome to EchoPath Nexus</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Load demo data to see the safety monitoring dashboard in action with sample residents, sensors, and scenario configurations.
        </p>
        <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-data">
          {seedMutation.isPending ? "Loading..." : "Load Demo Data"}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">Nexus Dashboard</h1>
        <p className="text-muted-foreground">Sunrise Senior Living - Real-time monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Residents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-residents">{dashData.totalResidents}</div>
            <p className="text-xs text-muted-foreground">{dashData.safeResidents} safe, {dashData.checkingResidents} checking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Safe Status</CardTitle>
            <ShieldCheck className="h-4 w-4 text-status-online" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-online" data-testid="text-safe-count">{dashData.safeResidents}</div>
            <p className="text-xs text-muted-foreground">All systems nominal</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <Bell className="h-4 w-4 text-status-busy" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-unread-alerts">{dashData.unreadAlerts}</div>
            <p className="text-xs text-muted-foreground">{dashData.activeScenarios} active scenarios</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sensors Online</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sensor-count">{dashData.totalSensors}</div>
            <p className="text-xs text-muted-foreground">Motion detectors active</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Resident Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dashData.residents?.map((resident: any) => {
              const insight = insights?.find((i: any) => i.residentId === resident.id);
              return (
                <div
                  key={resident.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`card-resident-${resident.id}`}
                >
                  <div className="relative">
                    <Avatar>
                      <AvatarFallback>
                        {resident.firstName[0]}{resident.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(resident.status)}`}
                      data-testid={`status-light-${resident.id}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {resident.preferredName || resident.firstName} {resident.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Room {resident.roomNumber}
                    </p>
                    {insight && insight.mood !== "No recent conversations" && (
                      <p className={`text-xs mt-0.5 truncate ${getMoodColor(insight.moodScore)}`} data-testid={`text-mood-${resident.id}`}>
                        {insight.mood}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={resident.status === "safe" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {getStatusLabel(resident.status)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insightsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : insights?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-insights">
                No conversation data available yet
              </p>
            ) : (
              insights?.map((insight: any) => (
                <div
                  key={insight.residentId}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`card-insight-${insight.residentId}`}
                >
                  <Brain className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getMoodColor(insight.moodScore)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{insight.name} {insight.lastName}</p>
                      {insight.moodScore > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {insight.moodScore >= 4 ? "Good" : insight.moodScore >= 3 ? "Neutral" : "Needs Attention"}
                        </Badge>
                      )}
                    </div>
                    <p className={`text-xs mt-1 ${getMoodColor(insight.moodScore)}`}>
                      {insight.mood}
                    </p>
                    {insight.messageCount > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{insight.messageCount} recent messages</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashData.alerts?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-alerts">
                No active alerts - all residents are safe
              </p>
            ) : (
              dashData.alerts?.slice(0, 5).map((alert: any) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`card-alert-${alert.id}`}
                >
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                    alert.severity === "emergency" || alert.severity === "critical"
                      ? "text-status-busy"
                      : "text-status-away"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <Badge variant={getSeverityVariant(alert.severity)} className="text-xs">
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BroadcastForm />

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Broadcasts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!broadcasts || broadcasts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-broadcasts">
                No announcements sent yet
              </p>
            ) : (
              broadcasts.slice(0, 5).map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`card-broadcast-${b.id}`}
                >
                  <Megaphone className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{b.message}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        by {b.senderName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <TriggerButton residentId={1} scenarioType="inactivity_gentle" label="Test Gentle Check-in (Maggie)" />
            <TriggerButton residentId={2} scenarioType="inactivity_urgent" label="Test Urgent Check-in (Bob)" />
            <TriggerButton residentId={3} scenarioType="fall_detected" label="Test Fall Detection (Ellie)" />
            <TriggerButton residentId={1} scenarioType="bathroom_extended" label="Test Bathroom Alert (Maggie)" location="bathroom" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const broadcastFormSchema = z.object({
  senderName: z.string().default(""),
  message: z.string().min(1, "Announcement message is required").max(500, "Message must be under 500 characters"),
});

type BroadcastFormValues = z.infer<typeof broadcastFormSchema>;

function BroadcastForm() {
  const { toast } = useToast();

  const form = useForm<BroadcastFormValues>({
    resolver: zodResolver(broadcastFormSchema),
    defaultValues: { senderName: "", message: "" },
  });

  const broadcastMutation = useMutation({
    mutationFn: (values: BroadcastFormValues) => apiRequest("POST", `/api/entities/${eid}/broadcasts`, {
      senderName: values.senderName.trim() || "Facility Admin",
      message: values.message.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/broadcasts`] });
      toast({ title: "Announcement sent to all AI companions" });
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to send announcement", description: err.message, variant: "destructive" });
    },
  });

  function onSubmit(values: BroadcastFormValues) {
    broadcastMutation.mutate(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          Community Broadcast
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="senderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Name (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Facility Admin"
                      {...field}
                      data-testid="input-broadcast-sender"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Announcement</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Type an announcement for all residents... (e.g., 'Bridge club at 3 PM in the common room')"
                      className="resize-none min-h-[80px]"
                      {...field}
                      data-testid="input-broadcast-message"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={broadcastMutation.isPending}
              className="w-full"
              data-testid="button-send-broadcast"
            >
              <Send className="h-4 w-4 mr-2" />
              {broadcastMutation.isPending ? "Sending..." : "Send to All AI Companions"}
            </Button>
            <p className="text-xs text-muted-foreground">
              This announcement will be delivered through each resident's AI companion during their next conversation.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function TriggerButton({ residentId, scenarioType, label, location }: {
  residentId: number;
  scenarioType: string;
  label: string;
  location?: string;
}) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/trigger-scenario", {
      residentId, scenarioType, location,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/dashboard`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/alerts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/active-scenarios`] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/ai-insights`] });
      toast({
        title: "Scenario Triggered",
        description: data.aiMessage?.slice(0, 100) + "...",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      data-testid={`button-trigger-${scenarioType}-${residentId}`}
    >
      {mutation.isPending ? "Triggering..." : label}
    </Button>
  );
}
