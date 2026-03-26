import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ChevronRight, MapPin, Phone, BookOpen } from "lucide-react";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import type { Memory } from "@shared/schema";

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

function topicLabel(topic: string) {
  return topic.charAt(0).toUpperCase() + topic.slice(1).replace(/_/g, " ");
}

export default function Residents() {
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();

  const { data: residents, isLoading: residentsLoading } = useQuery<any[]>({
    queryKey: [`/api/entities/${eid}/residents`],
    enabled: !!eid,
  });

  const { data: memoriesMap, isLoading: memoriesLoading } = useQuery<Record<number, Memory>>({
    queryKey: [`/api/entities/${eid}/memories`],
    enabled: !!eid,
  });

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
