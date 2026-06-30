import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Heart,
  MessageSquare,
  Activity,
  User,
} from "lucide-react";
import { Link } from "wouter";

export default function ResidentDetail() {
  const [, params] = useRoute("/residents/:id");
  const residentId = Number(params?.id);
  const { toast } = useToast();
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();

  const { data: resident, isLoading } = useQuery<any>({
    queryKey: [`/api/entities/${eid}/residents`, residentId],
    queryFn: () => apiRequest("GET", `/api/entities/${eid}/residents/${residentId}`).then(r => r.json()),
    enabled: eid !== null,
  });

  const { data: conversations } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents`, residentId, "conversations"],
    queryFn: () => apiRequest("GET", `/api/entities/${eid}/residents/${residentId}/conversations`).then(r => r.json()),
    enabled: eid !== null,
  });

  const { data: motionEvents } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents`, residentId, "motion-events"],
    queryFn: () => apiRequest("GET", `/api/entities/${eid}/residents/${residentId}/motion-events`).then(r => r.json()),
    enabled: eid !== null,
  });

  const triggerMutation = useMutation({
    mutationFn: (scenarioType: string) =>
      apiRequest("POST", "/api/trigger-scenario", { residentId, scenarioType }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/residents`, residentId] });
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${eid}/residents`, residentId, "conversations"] });
      toast({ title: "Check-in initiated", description: data.aiMessage?.slice(0, 80) });
    },
  });

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  if (!resident) {
    return <div className="p-6"><p className="text-muted-foreground">Resident not found</p></div>;
  }

  const persona = resident.digitalTwinPersona as any;
  const intake = resident.intakeInterviewData as any;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/residents">
          <Button variant="ghost" size="icon" data-testid="button-back-residents">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-resident-name">
            {resident.preferredName || resident.firstName} {resident.lastName}
          </h1>
          <p className="text-muted-foreground">Room {resident.roomNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-xl">
                  {resident.firstName[0]}{resident.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{resident.firstName} {resident.lastName}</p>
                <Badge variant={resident.status === "safe" ? "secondary" : "destructive"}>
                  {resident.status}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span>Room {resident.roomNumber}</span>
              </div>
              {resident.emergencyContact && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span>{resident.emergencyContact} - {resident.emergencyPhone}</span>
                </div>
              )}
              {resident.communicationStyle && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Heart className="h-3 w-3 flex-shrink-0" />
                  <span>{resident.communicationStyle}</span>
                </div>
              )}
            </div>

            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Quick Actions</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerMutation.mutate("inactivity_gentle")}
                  disabled={triggerMutation.isPending}
                  data-testid="button-gentle-checkin"
                >
                  Gentle Check-in
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerMutation.mutate("inactivity_urgent")}
                  disabled={triggerMutation.isPending}
                  data-testid="button-urgent-checkin"
                >
                  Urgent Check-in
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs defaultValue="persona">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="persona" data-testid="tab-persona">Digital Twin</TabsTrigger>
                <TabsTrigger value="conversations" data-testid="tab-conversations">Conversations</TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="persona" className="mt-0 space-y-4">
                {persona && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Tone</p>
                      <p className="text-sm">{persona.tone}</p>
                    </div>
                    {persona.topics && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Preferred Topics</p>
                        <div className="flex gap-2 flex-wrap">
                          {persona.topics.map((t: string) => (
                            <Badge key={t} variant="secondary">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {persona.avoidTopics && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Avoid Topics</p>
                        <div className="flex gap-2 flex-wrap">
                          {persona.avoidTopics.map((t: string) => (
                            <Badge key={t} variant="outline">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {persona.greeting && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Default Greeting</p>
                        <p className="text-sm italic">"{persona.greeting}"</p>
                      </div>
                    )}
                  </div>
                )}
                {intake && (
                  <div className="space-y-3 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Intake Interview Data</p>
                    {intake.hobbies && (
                      <div>
                        <p className="text-xs text-muted-foreground">Hobbies</p>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {intake.hobbies.map((h: string) => (
                            <Badge key={h} variant="secondary">{h}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {intake.personality && (
                      <div>
                        <p className="text-xs text-muted-foreground">Personality</p>
                        <p className="text-sm">{intake.personality}</p>
                      </div>
                    )}
                    {intake.familyNotes && (
                      <div>
                        <p className="text-xs text-muted-foreground">Family Notes</p>
                        <p className="text-sm">{intake.familyNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="conversations" className="mt-0">
                <ScrollArea className="h-[400px]">
                  {(!conversations || conversations.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-conversations">
                      No conversations yet. Trigger a check-in to start one.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {conversations.map((conv: any) => (
                        <Link key={conv.id} href={`/conversations/${conv.id}`}>
                          <div className="p-3 rounded-md bg-muted/50 hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-conversation-${conv.id}`}>
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <p className="text-sm font-medium flex-1 truncate">{conv.title}</p>
                              <Badge variant={conv.isActive ? "default" : "secondary"} className="text-xs">
                                {conv.isActive ? "Active" : "Closed"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(conv.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="activity" className="mt-0">
                <ScrollArea className="h-[400px]">
                  {(!motionEvents || motionEvents.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-activity">
                      No motion events recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {motionEvents.map((event: any) => (
                        <div key={event.id} className="flex items-center gap-3 p-2 text-sm">
                          <Activity className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">{event.eventType}</span>
                          <span>{event.location}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
