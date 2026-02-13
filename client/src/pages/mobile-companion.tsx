import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMobileAuth } from "@/lib/mobile-auth";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Send,
  LogOut,
  Loader2,
  X,
  AlertTriangle,
  Megaphone,
} from "lucide-react";

interface ChatMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

interface SyncData {
  syncedAt: string;
  resident: {
    id: number;
    anonymousUsername: string;
    preferredName: string;
    status: string;
    lastActivityAt: string | null;
  };
  lastAIMessage: {
    id: number;
    content: string;
    createdAt: string;
  } | null;
  safetyStatus: {
    current: string;
    activeScenarios: number;
    hasActiveAlert: boolean;
  };
  announcements: {
    id: number;
    senderName: string;
    message: string;
    createdAt: string;
  }[];
}

export default function MobileCompanion() {
  const { token, user, logout } = useMobileAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [checkInAlert, setCheckInAlert] = useState<string | null>(null);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [unseenAnnouncements, setUnseenAnnouncements] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageIdRef = useRef<number>(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!user || !token) return;
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/chat/${user.entityId}/${user.id}/history`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setMessages(data.messages);
            if (data.messages.length > 0) {
              lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
            }
          }
        }
      } catch {}
      setIsLoadingHistory(false);
    };
    loadHistory();
  }, [user, token]);

  useEffect(() => {
    if (!user || !token) return;
    const doSync = async () => {
      try {
        const res = await fetch(`/api/mobile/sync/${user.entityId}/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: SyncData = await res.json();
          setSyncData(data);
          if (data.announcements.length > 0) {
            setUnseenAnnouncements(data.announcements.length);
          }
        }
      } catch {}
    };
    doSync();
    const interval = setInterval(doSync, 30000);
    return () => clearInterval(interval);
  }, [user, token]);

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "proactive_checkin" && msg.data?.residentId === user?.id) {
      setCheckInAlert(msg.data.message || "Are you doing okay? We noticed you've been quiet for a while.");
    }
    if (msg.type === "community_broadcast") {
      setUnseenAnnouncements((p) => p + 1);
      if (syncData) {
        setSyncData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            announcements: [msg.data, ...prev.announcements].slice(0, 5),
          };
        });
      }
    }
    if (msg.type === "scenario_triggered" && msg.data?.residentId === user?.id) {
      setCheckInAlert(msg.data.message || "Hi there! Just checking in to make sure you're alright.");
    }
  }, [user, syncData]);

  useWebSocket(handleWsMessage);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending || !user) return;

    const tempMsg: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch(`/api/chat/${user.entityId}/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: ChatMessage = {
          id: data.messageId,
          role: "assistant",
          content: data.response,
          createdAt: data.timestamp,
        };
        setMessages((prev) => [...prev, aiMsg]);
        lastMessageIdRef.current = data.messageId;
      }
    } catch {}
    setIsSending(false);
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/companion");
  };

  const safetyColor = syncData?.safetyStatus?.current === "safe"
    ? "text-green-600 dark:text-green-400"
    : syncData?.safetyStatus?.current === "alert"
    ? "text-red-500"
    : "text-amber-500 dark:text-amber-400";

  const safetyBg = syncData?.safetyStatus?.current === "safe"
    ? "bg-green-500/10 border-green-500/30"
    : syncData?.safetyStatus?.current === "alert"
    ? "bg-red-500/10 border-red-500/30"
    : "bg-amber-500/10 border-amber-500/30";

  const SafetyIcon = syncData?.safetyStatus?.current === "safe"
    ? ShieldCheck
    : syncData?.safetyStatus?.current === "alert"
    ? ShieldAlert
    : Shield;

  if (!user || !token) {
    setLocation("/companion");
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background sticky top-0 z-50">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border ${safetyBg}`}
            data-testid="badge-safety-status"
          >
            <SafetyIcon className={`w-4 h-4 ${safetyColor}`} />
            <span className={`text-sm font-semibold ${safetyColor}`}>
              {syncData?.safetyStatus?.current === "safe" ? "Secure" : syncData?.safetyStatus?.current === "alert" ? "Alert" : "Monitoring"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            data-testid="button-announcements"
            className="relative"
            onClick={() => {
              setShowAnnouncements(!showAnnouncements);
              setUnseenAnnouncements(0);
            }}
          >
            <Megaphone className="w-5 h-5" />
            {unseenAnnouncements > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
                {unseenAnnouncements}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            data-testid="button-logout"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {checkInAlert && (
        <div
          className="mx-4 mt-3 p-4 rounded-md border-2 border-amber-500 bg-amber-500/10 relative"
          data-testid="alert-checkin"
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2"
            data-testid="button-dismiss-checkin"
            onClick={() => setCheckInAlert(null)}
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-start gap-3 pr-8">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-semibold text-foreground">Check-In</p>
              <p className="text-base text-foreground mt-1">{checkInAlert}</p>
              <Button
                className="mt-3"
                size="lg"
                data-testid="button-respond-checkin"
                onClick={() => {
                  setInput("I'm doing fine, thank you for checking in!");
                  setCheckInAlert(null);
                  textareaRef.current?.focus();
                }}
              >
                I'm OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAnnouncements && syncData && syncData.announcements.length > 0 && (
        <div className="mx-4 mt-3 space-y-2" data-testid="panel-announcements">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-foreground">Announcements</p>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-close-announcements"
              onClick={() => setShowAnnouncements(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          {syncData.announcements.map((a) => (
            <div
              key={a.id}
              className="p-3 rounded-md bg-muted"
              data-testid={`announcement-${a.id}`}
            >
              <p className="text-base font-medium text-foreground">{a.message}</p>
              <p className="text-sm text-muted-foreground mt-1">
                From {a.senderName}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="chat-messages">
        {isLoadingHistory ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-12 w-2/3 ml-auto" />
            <Skeleton className="h-20 w-3/4" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 space-y-4">
            <Shield className="w-16 h-16 text-primary/30" />
            <p className="text-xl text-muted-foreground">
              Hi {user.preferredName}! Send a message to start chatting with your companion.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div
                className={`max-w-[85%] p-4 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}
              >
                <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`text-xs mt-2 ${
                    msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-muted p-4 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-base text-muted-foreground">Typing...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-background px-4 py-3 sticky bottom-0 z-40">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            data-testid="input-chat-message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border bg-muted px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px] max-h-[120px]"
            style={{ lineHeight: "1.5" }}
            disabled={isSending}
          />
          <Button
            data-testid="button-send-message"
            size="icon"
            onClick={sendMessage}
            disabled={isSending || !input.trim()}
            className="h-12 w-12 rounded-full flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
