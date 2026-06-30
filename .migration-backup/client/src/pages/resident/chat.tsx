import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ResidentLayout } from "@/components/resident-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Mic, Square, Send, Keyboard, Volume2, VolumeX, Loader2 } from "lucide-react";
import {
  createConversation,
  streamResponse,
  blobToBase64,
  getStoredResident,
} from "@/lib/resident-auth";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

function speak(text: string, enabled: boolean, onEnd?: () => void): void {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.0;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  } catch {
    onEnd?.();
  }
}

export default function ResidentChatPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resident = getStoredResident();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resident) {
      setLocation("/resident/login");
      return;
    }
    createConversation()
      .then((c) => {
        setConversationId(c.id);
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            text:
              "Hi " +
              (resident.preferredName || "there") +
              "! I'm here whenever you'd like to chat. Tap the microphone or type a message.",
          },
        ]);
      })
      .catch((err) => {
        toast({
          title: "Could not start chat",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      });
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendToServer = async (
    payload: { message?: string; audioBase64?: string; audioMimeType?: string },
    optimisticUserText?: string,
  ) => {
    if (!resident || !conversationId) return;
    setProcessing(true);

    const userId = `u-${Date.now()}`;
    const aiId = `a-${Date.now()}`;
    if (optimisticUserText) {
      setMessages((m) => [
        ...m,
        { id: userId, role: "user", text: optimisticUserText },
        { id: aiId, role: "assistant", text: "", pending: true },
      ]);
    } else {
      setMessages((m) => [
        ...m,
        { id: userId, role: "user", text: "🎤 (voice message)", pending: true },
        { id: aiId, role: "assistant", text: "", pending: true },
      ]);
    }

    let aiBuffer = "";
    try {
      await streamResponse(resident.id, conversationId, payload, (event) => {
        if (event.type === "transcription" && event.text) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === userId ? { ...msg, text: event.text!, pending: false } : msg,
            ),
          );
        } else if (event.type === "chunk" && event.text) {
          aiBuffer += event.text;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiId ? { ...msg, text: aiBuffer, pending: true } : msg,
            ),
          );
        } else if (event.type === "done") {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiId ? { ...msg, pending: false } : msg,
            ),
          );
          if (aiBuffer && ttsEnabled) {
            setSpeaking(true);
            speak(aiBuffer, ttsEnabled, () => setSpeaking(false));
          }
        } else if (event.type === "error") {
          throw new Error(event.message || "Chat error");
        }
      });
    } catch (err: any) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === aiId
            ? {
                ...msg,
                text: "Sorry, I had trouble responding. Please try again.",
                pending: false,
              }
            : msg,
        ),
      );
      toast({
        title: "Chat error",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast({
        title: "Voice not available",
        description: "Your browser does not support voice recording. Use text mode instead.",
        variant: "destructive",
      });
      setTextMode(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (blob.size === 0) return;
        try {
          const base64 = await blobToBase64(blob);
          await sendToServer({ audioBase64: base64, audioMimeType: mimeType });
        } catch (err: any) {
          toast({
            title: "Could not send voice",
            description: err?.message || "Please try again.",
            variant: "destructive",
          });
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err: any) {
      toast({
        title: "Microphone blocked",
        description:
          err?.message || "Please allow microphone access or use text mode.",
        variant: "destructive",
      });
      setTextMode(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleSendText = async () => {
    const text = textInput.trim();
    if (!text || processing) return;
    setTextInput("");
    await sendToServer({ message: text }, text);
  };

  const toggleTts = () => {
    if (ttsEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    setTtsEnabled(!ttsEnabled);
  };

  return (
    <ResidentLayout active="chat">
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-9rem)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold" data-testid="text-chat-title">
            Your Companion
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTts}
              data-testid="button-toggle-tts"
              aria-label={ttsEnabled ? "Mute voice" : "Enable voice"}
            >
              {ttsEnabled ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTextMode(!textMode)}
              data-testid="button-toggle-mode"
            >
              {textMode ? (
                <>
                  <Mic className="w-5 h-5 mr-1" /> Voice
                </>
              ) : (
                <>
                  <Keyboard className="w-5 h-5 mr-1" /> Type
                </>
              )}
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-3 pr-2"
          data-testid="container-messages"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.role}-${msg.id}`}
            >
              <Card
                className={`max-w-[85%] px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-slate-800"
                }`}
              >
                <p className="text-base leading-relaxed whitespace-pre-wrap">
                  {msg.text || (msg.pending ? "…" : "")}
                </p>
              </Card>
            </div>
          ))}
          {processing && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <Card className="px-4 py-3 bg-white dark:bg-slate-800">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </Card>
            </div>
          )}
        </div>

        <div className="pt-4 pb-2">
          {textMode ? (
            <div className="flex items-center gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendText();
                }}
                placeholder="Type a message…"
                className="h-12 text-base"
                disabled={processing}
                data-testid="input-chat-text"
              />
              <Button
                size="lg"
                onClick={handleSendText}
                disabled={processing || !textInput.trim()}
                data-testid="button-send-text"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={processing && !recording}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${
                  recording
                    ? "bg-red-600 hover:bg-red-700 animate-pulse scale-110"
                    : speaking
                      ? "bg-blue-500"
                      : "bg-blue-600 hover:bg-blue-700"
                } ${processing && !recording ? "opacity-50 cursor-not-allowed" : ""}`}
                data-testid="button-mic"
                aria-label={recording ? "Stop recording" : "Start recording"}
              >
                {recording ? (
                  <Square className="w-10 h-10" />
                ) : (
                  <Mic className="w-10 h-10" />
                )}
              </button>
              <p className="text-sm text-muted-foreground" data-testid="text-mic-hint">
                {recording
                  ? "Listening… tap to stop"
                  : speaking
                    ? "Speaking…"
                    : processing
                      ? "Thinking…"
                      : "Tap the microphone to speak"}
              </p>
            </div>
          )}
        </div>
      </div>
    </ResidentLayout>
  );
}
