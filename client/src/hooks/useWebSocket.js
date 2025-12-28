import { useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { WS_SERVER_URL } from '../config';

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
  const isConnectingRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  
  // Register message handlers
  const registerHandler = useCallback((type, handler) => {
    handlersRef.current[type] = handler;
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (isConnectingRef.current) {
      return;
    }
    
    isConnectingRef.current = true;
    connectionAttemptRef.current++;
    
    // Use configured WebSocket server URL (see src/config.js to change)
    const wsUrl = WS_SERVER_URL;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      isConnectingRef.current = false;
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Call registered handler if exists
        const handler = handlersRef.current[data.type];
        if (handler) {
          await handler(data);
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
      }
    };
    
    ws.onclose = (event) => {
      isConnectingRef.current = false;
      console.error('[WebSocket] Connection closed');
      console.error('[WebSocket] Close code:', event.code);
      console.error('[WebSocket] Close reason:', event.reason || 'No reason provided');
      
      if (event.code === 1006) {
        console.error('[WebSocket] Server unreachable - connection abnormally closed');
      }
      
      setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
      isConnectingRef.current = false;
      console.error('[WebSocket] Error occurred:', error);
    };
    
    return ws;
  }, [wsRef]);
  
  // Send message
  const send = useCallback((data) => {
    if (!wsRef.current) {
      console.error('[WebSocket] Cannot send - WebSocket is null');
      return;
    }
    
    const readyState = wsRef.current.readyState;
    
    if (readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify(data);
        wsRef.current.send(message);
      } catch (error) {
        console.error('[WebSocket] Send failed:', error.message);
      }
    } else {
      console.error('[WebSocket] Cannot send - WebSocket not ready (state:', readyState, ')');
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
