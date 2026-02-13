import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ChevronRight, MapPin, Phone, Heart } from "lucide-react";

function getStatusBadge(status: string) {
  switch (status) {
    case "safe": return <Badge variant="secondary" className="text-xs">Safe</Badge>;
    case "checking": return <Badge className="text-xs">Checking</Badge>;
    case "alert": return <Badge variant="destructive" className="text-xs">Alert</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export default function Residents() {
  const { data: residents, isLoading } = useQuery<any[]>({
    queryKey: ["/api/entities/1/residents"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Residents</h1>
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
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
        {residents?.map((resident) => (
          <Link key={resident.id} href={`/residents/${resident.id}`}>
            <Card className="hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-resident-${resident.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-lg">
                      {resident.firstName[0]}{resident.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">
                        {resident.preferredName || resident.firstName} {resident.lastName}
                      </h3>
                      {getStatusBadge(resident.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Room {resident.roomNumber}
                      </span>
                      {resident.emergencyContact && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {resident.emergencyContact}
                        </span>
                      )}
                      {resident.communicationStyle && (
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> {resident.communicationStyle.slice(0, 40)}...
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
