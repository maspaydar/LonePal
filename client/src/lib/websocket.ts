import { useEffect, useRef, useCallback, useState } from "react";

type WSMessage = {
  type: string;
  data: any;
};

type WSHandler = (msg: WSMessage) => void;

export function useWebSocket(onMessage?: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef<WSHandler | undefined>(onMessage);
  handlersRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handlersRef.current?.(msg);
      } catch {
        // ignore invalid JSON
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  return { isConnected };
}
