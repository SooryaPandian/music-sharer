import { useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';

export function useWebSocket() {
  const { 
    wsRef, 
    setCurrentScreen, 
    setRoomCode, 
    setListenerCount,
    setConnectionStatus,
    peerConnectionsRef,
    localStreamRef,
    remoteAudioRef,
    role,
    resetState
  } = useAppContext();
  
  const handlersRef = useRef({});
  
  // Register message handlers
  const registerHandler = useCallback((type, handler) => {
    handlersRef.current[type] = handler;
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    const wsUrl = `${protocol}//${hostname}:3000`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("[WebSocket] Connected to signaling server");
    };
    
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      // Call registered handler if exists
      const handler = handlersRef.current[data.type];
      if (handler) {
        await handler(data);
      }
    };
    
    ws.onclose = () => {
      console.log("[WebSocket] Connection closed, reconnecting in 3 seconds...");
      setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };
    
    return ws;
  }, [wsRef]);
  
  // Send message
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, [wsRef]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [wsRef]);
  
  return {
    connect,
    send,
    registerHandler,
    ws: wsRef.current,
  };
}
