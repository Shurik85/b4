import { useEffect } from "react";
import { wsUrl } from "@utils";

interface UseDomainsWebSocketProps {
  paused: boolean;
  onMessage: (line: string) => void;
  onError: () => void;
}

export function useDomainsWebSocket({
  paused,
  onMessage,
  onError,
}: UseDomainsWebSocketProps) {
  useEffect(() => {
    const ws = new WebSocket(wsUrl("/api/ws/logs"));

    ws.onmessage = (ev) => {
      if (!paused) {
        onMessage(String(ev.data));
      }
    };

    ws.onerror = () => {
      onError();
    };

    return () => ws.close();
  }, [paused, onMessage, onError]);
}
