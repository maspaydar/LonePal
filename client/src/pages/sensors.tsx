import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Radio, Plus, MapPin } from "lucide-react";
import { useState } from "react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

export default function Sensors() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: sensorsList, isLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/sensors`],
    enabled: !!eid,
  });

  const form = useForm({
    defaultValues: {
      location: "",
      sensorType: "motion",
      adtDeviceId: "",
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/entities/${eid}/sensors`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/sensors`] });
      toast({ title: "Sensor added" });
      setOpen(false);
      form.reset();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Sensors</h1>
        {[1, 2, 3].map(i => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-sensors-title">Sensors</h1>
          <p className="text-muted-foreground">{sensorsList?.length || 0} sensors configured</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-sensor">
              <Plus className="h-4 w-4 mr-1" /> Add Sensor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Sensor</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. hallway_east" {...field} data-testid="input-sensor-location" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adtDeviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ADT Device ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. ADT-HALL-002" {...field} data-testid="input-sensor-adt-id" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-sensor">
                  {addMutation.isPending ? "Adding..." : "Add Sensor"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {(!sensorsList || sensorsList.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Radio className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-sensors">No sensors configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sensorsList.map((sensor: any) => (
            <Card key={sensor.id} data-testid={`card-sensor-${sensor.id}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{sensor.location}</span>
                  </div>
                  <Badge variant={sensor.isActive ? "secondary" : "outline"} className="text-xs">
                    {sensor.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Type: {sensor.sensorType}</p>
                  {sensor.adtDeviceId && <p>ADT ID: {sensor.adtDeviceId}</p>}
                  {sensor.residentId && <p>Assigned to Resident #{sensor.residentId}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
