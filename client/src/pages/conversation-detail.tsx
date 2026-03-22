import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Send } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useCompanyAuth } from "@/hooks/use-company-auth";

export default function ConversationDetail() {
  const [, params] = useRoute("/conversations/:id");
  const conversationId = Number(params?.id);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getEntityId } = useCompanyAuth();
  const eid = getEntityId();

  const { data: conversation, isLoading } = useQuery<any>({
    queryKey: ["/api/entities", eid, "conversations", conversationId],
    queryFn: () => apiRequest("GET", `/api/conversations/${conversationId}`).then(r => r.json()),
    enabled: !!eid,
    refetchInterval: 5000,
  });

  const respondMutation = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", "/api/mobile/respond", {
        residentId: conversation?.residentId,
        conversationId,
        message,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", eid, "conversations", conversationId] });
      setInputValue("");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages]);

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  }

  if (!conversation) {
    return <div className="p-6"><p className="text-muted-foreground">Conversation not found</p></div>;
  }

  const handleSend = () => {
    if (!inputValue.trim()) return;
    respondMutation.mutate(inputValue.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Link href={`/residents/${conversation.residentId}`}>
          <Button variant="ghost" size="icon" data-testid="button-back-conversation">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium truncate" data-testid="text-conversation-title">{conversation.title}</h2>
          <div className="flex items-center gap-2">
            <Badge variant={conversation.isActive ? "default" : "secondary"} className="text-xs">
              {conversation.isActive ? "Active" : "Closed"}
            </Badge>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-2xl mx-auto">
          {conversation.messages?.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-md text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p>{msg.content}</p>
                <p className={`text-xs mt-1 ${
                  msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                }`}>
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a response (simulating senior's reply)..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={respondMutation.isPending}
            data-testid="input-message"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || respondMutation.isPending}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
