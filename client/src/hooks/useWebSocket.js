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
    // Use fixed dev tunnel URL for WebSocket signaling
    // Provided URL: https://j6wt9thk-3000.inc1.devtunnels.ms/
    // Convert to secure WebSocket (wss)
    // const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // const hostname = window.location.hostname;
    // const wsUrl = `${protocol}//${hostname}:3000`;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = "j6wt9thk-3000.inc1.devtunnels.ms";
    // https://j6wt9thk-3000.inc1.devtunnels.ms/
    const wsUrl = 'wss://j6wt9thk-3000.inc1.devtunnels.ms/';
    
    console.log('[WebSocket] ====== CONNECTING ======');
    console.log('[WebSocket] URL:', wsUrl);
    console.log('[WebSocket] Protocol:', protocol);
    console.log('[WebSocket] Hostname:', hostname);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    console.log('[WebSocket] WebSocket object created, state:', ws.readyState);
    
    ws.onopen = () => {
      console.log("[WebSocket] ✓ Connected to signaling server");
      console.log('[WebSocket] State:', ws.readyState);
    };
    
    ws.onmessage = async (event) => {
      console.log('[WebSocket] ====== MESSAGE RECEIVED ======');
      console.log('[WebSocket] Raw data:', event.data);
      
      try {
        const data = JSON.parse(event.data);
        console.log('[WebSocket] Parsed message type:', data.type);
        console.log('[WebSocket] Full message:', data);
        
        // Call registered handler if exists
        const handler = handlersRef.current[data.type];
        if (handler) {
          console.log('[WebSocket] Handler found for:', data.type);
          await handler(data);
          console.log('[WebSocket] ✓ Handler completed for:', data.type);
        } else {
          console.warn('[WebSocket] ✗ No handler registered for:', data.type);
          console.log('[WebSocket] Available handlers:', Object.keys(handlersRef.current));
        }
      } catch (error) {
        console.error('[WebSocket] ✗ Error processing message:', error);
      }
      console.log('[WebSocket] ====== END MESSAGE ======');
    };
    
    ws.onclose = (event) => {
      console.log("[WebSocket] ✗ Connection closed");
      console.log('[WebSocket] Code:', event.code);
      console.log('[WebSocket] Reason:', event.reason);
      console.log('[WebSocket] Clean:', event.wasClean);
      console.log('[WebSocket] Reconnecting in 3 seconds...');
      setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
      console.error("[WebSocket] ✗ Error occurred");
      console.error("[WebSocket] Error object:", error);
      console.error('[WebSocket] State:', ws.readyState);
    };
    
    return ws;
  }, [wsRef]);
  
  // Send message
  const send = useCallback((data) => {
    console.log('[WebSocket] ====== SENDING MESSAGE ======');
    console.log('[WebSocket] Type:', data.type);
    console.log('[WebSocket] Data:', data);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data);
      console.log('[WebSocket] Serialized:', message);
      wsRef.current.send(message);
      console.log('[WebSocket] ✓ Message sent');
    } else {
      console.error('[WebSocket] ✗ Cannot send - WebSocket not open');
      if (wsRef.current) {
        console.error('[WebSocket] Current state:', wsRef.current.readyState);
      } else {
        console.error('[WebSocket] WebSocket is null');
      }
    }
    console.log('[WebSocket] ====== END SEND ======');
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
