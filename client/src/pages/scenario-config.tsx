import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Zap, Plus, Clock, ArrowUp, Settings } from "lucide-react";
import { useState } from "react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

function getTypeLabel(type: string) {
  switch (type) {
    case "inactivity_gentle": return "Gentle Check-in (A)";
    case "inactivity_urgent": return "Urgent Non-Response (B)";
    case "fall_detected": return "Fall Detection (C)";
    case "bathroom_extended": return "Bathroom Extended (C)";
    case "shower_extended": return "Shower Extended (C)";
    case "custom": return "Custom";
    default: return type;
  }
}

export default function ScenarioConfig() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: configs, isLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/scenario-configs`],
  });

  const form = useForm({
    defaultValues: {
      scenarioType: "inactivity_gentle",
      label: "",
      triggerMinutes: 10,
      escalationMinutes: 5,
      maxEscalations: 3,
      aiPromptOverride: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/entities/${eid}/scenario-configs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/scenario-configs`] });
      toast({ title: "Scenario rule created" });
      setOpen(false);
      form.reset();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/scenario-configs/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/scenario-configs`] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Scenario Rules</h1>
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-config-title">Scenario Rules</h1>
          <p className="text-muted-foreground">Configure inactivity thresholds and AI response behaviors</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-rule">
              <Plus className="h-4 w-4 mr-1" /> Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Scenario Rule</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="scenarioType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scenario Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-scenario-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="inactivity_gentle">Gentle Check-in (A)</SelectItem>
                          <SelectItem value="inactivity_urgent">Urgent Non-Response (B)</SelectItem>
                          <SelectItem value="fall_detected">Fall Detection (C)</SelectItem>
                          <SelectItem value="bathroom_extended">Bathroom Extended (C)</SelectItem>
                          <SelectItem value="shower_extended">Shower Extended (C)</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Custom Night Check" {...field} data-testid="input-rule-label" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="triggerMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trigger (min)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            data-testid="input-trigger-minutes"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="escalationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Escalation (min)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            data-testid="input-escalation-minutes"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxEscalations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Escalations</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            data-testid="input-max-escalations"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="aiPromptOverride"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom AI Prompt (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Override the default AI prompt for this scenario..."
                          className="resize-none"
                          {...field}
                          data-testid="input-ai-prompt"
                        />
                      </FormControl>
                      <FormDescription>Leave blank to use the default prompt for this scenario type.</FormDescription>
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-rule">
                  {addMutation.isPending ? "Creating..." : "Create Rule"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {(!configs || configs.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Settings className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-configs">No scenario rules configured. Load demo data to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.map((config: any) => (
            <Card key={config.id} data-testid={`card-config-${config.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                      <h3 className="font-medium text-sm">{config.label}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {getTypeLabel(config.scenarioType)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Trigger: {config.triggerMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <ArrowUp className="h-3 w-3" />
                        Escalate: every {config.escalationMinutes} min
                      </span>
                      <span>Max escalations: {config.maxEscalations}</span>
                      {config.locations && config.locations.length > 0 && (
                        <span>Locations: {config.locations.join(", ")}</span>
                      )}
                    </div>
                    {config.residentId && (
                      <p className="text-xs text-muted-foreground">Resident-specific rule (ID: {config.residentId})</p>
                    )}
                  </div>
                  <Switch
                    checked={config.isActive}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: config.id, isActive: checked })}
                    data-testid={`switch-config-${config.id}`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
