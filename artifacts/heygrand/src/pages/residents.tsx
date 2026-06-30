import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ChevronRight,
  MapPin,
  Phone,
  BookOpen,
  Heart,
  MessageSquare,
  Brain,
  Wand2,
} from "lucide-react";
import { useCompanyAuth } from "@/hooks/use-company-auth";
type Memory = { id: number; residentId: number; topic: string; content: string; dateCaptured: string; [key: string]: unknown };

function getMotionStatusBadge(status: string) {
  if (status === "safe") {
    return (
      <Badge
        className="text-xs bg-green-500 hover:bg-green-500 text-white border-0"
        data-testid="badge-status-active"
      >
        Active
      </Badge>
    );
  }
  return (
    <Badge
      className="text-xs bg-red-500 hover:bg-red-500 text-white border-0"
      data-testid="badge-status-no-motion"
    >
      No Motion Detected
    </Badge>
  );
}

function getMoodColor(score: number) {
  if (score >= 4) return "text-status-online";
  if (score === 3) return "text-muted-foreground";
  if (score >= 1) return "text-status-busy";
  return "text-muted-foreground";
}

function topicLabel(topic: string) {
  return topic.charAt(0).toUpperCase() + topic.slice(1).replace(/_/g, " ");
}

function FamilyLovedOne({ eid }: { eid: number }) {
  const { data: residents, isLoading: residentsLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents`],
    enabled: !!eid,
  });

  const { data: memoriesMap, isLoading: memoriesLoading } = useQuery<Record<number, Memory>>({
    queryKey: [`/api/entities/${eid}/memories`],
    enabled: !!eid,
  });

  const { data: insights } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/ai-insights`],
    enabled: !!eid,
    refetchInterval: 60000,
  });

  const resident = residents?.[0];

  const { data: conversations } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents/${resident?.id}/conversations`],
    enabled: !!eid && !!resident?.id,
  });

  const isLoading = residentsLoading || memoriesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-4 text-center">
        <Heart className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold" data-testid="text-no-loved-one">No loved one set up yet</h2>
        <p className="text-muted-foreground max-w-md">
          Add your loved one's profile and check-in preferences to start keeping an eye on them.
        </p>
        <Button asChild data-testid="button-setup-loved-one">
          <Link href="/welcome">
            <Wand2 className="h-4 w-4 mr-2" />
            Set up your loved one
          </Link>
        </Button>
      </div>
    );
  }

  const insight = insights?.find((i: any) => i.residentId === resident.id);
  const memory: Memory | undefined = memoriesMap?.[resident.id];
  const displayName = `${resident.preferredName || resident.firstName} ${resident.lastName}`;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-loved-one-title">Your Loved One</h1>
          <p className="text-muted-foreground">How {resident.preferredName || resident.firstName} is doing</p>
        </div>
        <Button variant="outline" asChild data-testid="button-edit-setup">
          <Link href="/welcome">
            <Wand2 className="h-4 w-4 mr-2" />
            Set up / edit check-ins
          </Link>
        </Button>
      </div>

      <Card data-testid={`card-loved-one-${resident.id}`}>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 flex-shrink-0">
              <AvatarFallback className="text-xl">
                {resident.firstName[0]}{resident.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-lg font-semibold" data-testid="text-loved-one-name">{displayName}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {getMotionStatusBadge(resident.status)}
                {insight && insight.moodScore > 0 && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-mood">
                    {insight.moodScore >= 4 ? "Good mood" : insight.moodScore >= 3 ? "Neutral mood" : "Needs attention"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {insight && insight.mood && insight.mood !== "No recent conversations" && (
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 flex items-start gap-2" data-testid="card-mood-summary">
              <Brain className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getMoodColor(insight.moodScore)}`} />
              <div className="min-w-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent mood</span>
                <p className={`text-sm mt-0.5 ${getMoodColor(insight.moodScore)}`} data-testid="text-mood-summary">{insight.mood}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {resident.roomNumber && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span data-testid="text-room">Room {resident.roomNumber}</span>
              </div>
            )}
            {resident.emergencyContact && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <span data-testid="text-emergency-contact">
                  {resident.emergencyContact}{resident.emergencyPhone ? ` · ${resident.emergencyPhone}` : ""}
                </span>
              </div>
            )}
          </div>

          {memory && (
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 flex items-start gap-2" data-testid={`card-memory-${resident.id}`}>
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Memory · {topicLabel(memory.topic)}
                </span>
                <p className="text-sm text-foreground mt-0.5">{memory.content}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Recent check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!conversations || conversations.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-checkins">
              No check-ins yet. They'll appear here once {resident.preferredName || resident.firstName} starts chatting.
            </p>
          ) : (
            <div className="space-y-2">
              {conversations.slice(0, 8).map((conv: any) => (
                <Link key={conv.id} href={`/conversations/${conv.id}`}>
                  <div className="p-3 rounded-md bg-muted/50 hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-checkin-${conv.id}`}>
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
        </CardContent>
      </Card>
    </div>
  );
}

export default function Residents() {
  const { getEntityId, getEntity } = useCompanyAuth();
  const eid = getEntityId();
  const isFamily = getEntity()?.type === "family";

  const { data: residents, isLoading: residentsLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents`],
    enabled: !!eid && !isFamily,
  });

  const { data: memoriesMap, isLoading: memoriesLoading } = useQuery<Record<number, Memory>>({
    queryKey: [`/api/entities/${eid}/memories`],
    enabled: !!eid && !isFamily,
  });

  if (isFamily && eid) {
    return <FamilyLovedOne eid={eid} />;
  }

  const isLoading = residentsLoading || memoriesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Residents</h1>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-residents-title">Residents</h1>
        <p className="text-muted-foreground">{residents?.length || 0} residents registered</p>
      </div>

      <div className="grid gap-4">
        {residents?.map((resident) => {
          const memory: Memory | undefined = memoriesMap?.[resident.id];
          return (
            <Link key={resident.id} href={`/residents/${resident.id}`}>
              <Card className="hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-resident-${resident.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarFallback className="text-lg">
                        {resident.firstName[0]}{resident.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">
                          {resident.preferredName || resident.firstName} {resident.lastName}
                        </h3>
                        {getMotionStatusBadge(resident.status)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        {resident.roomNumber && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Room {resident.roomNumber}
                          </span>
                        )}
                        {resident.emergencyContact && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {resident.emergencyContact}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>

                  {memory && (
                    <div
                      className="rounded-md bg-muted/50 border border-border px-3 py-2 flex items-start gap-2"
                      data-testid={`card-memory-${resident.id}`}
                    >
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Memory · {topicLabel(memory.topic)}
                        </span>
                        <p className="text-xs text-foreground mt-0.5 line-clamp-2">
                          {memory.content}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
