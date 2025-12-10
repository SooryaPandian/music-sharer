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
      console.warn('[WebSocket] ⚠️ Connection already in progress, skipping duplicate');
      return;
    }
    
    isConnectingRef.current = true;
    connectionAttemptRef.current++;
    
    // Use configured WebSocket server URL (see src/config.js to change)
    const wsUrl = WS_SERVER_URL;
    
    console.log('[WebSocket] ====== CONNECTING ======');
    console.log('[WebSocket] URL:', wsUrl);
    console.log('[WebSocket] Server configured in: src/config.js');
    console.log('[WebSocket] Attempt number:', connectionAttemptRef.current);
    console.log('[WebSocket] Timestamp:', new Date().toISOString());
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    console.log('[WebSocket] WebSocket object created');
    console.log('[WebSocket] Initial readyState:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
    
    ws.onopen = () => {
      console.log("[WebSocket] ✅✅✅ CONNECTION ESTABLISHED ✅✅✅");
      console.log('[WebSocket] readyState:', ws.readyState, '(OPEN)');
      console.log('[WebSocket] Timestamp:', new Date().toISOString());
      console.log('[WebSocket] 🎉 Ready to send/receive messages');
      isConnectingRef.current = false;
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
          console.log('[WebSocket] ✓ Handler found for:', data.type);
          await handler(data);
          console.log('[WebSocket] ✓ Handler completed for:', data.type);
        } else {
          console.warn('[WebSocket] ⚠️ No handler registered for:', data.type);
          console.log('[WebSocket] Available handlers:', Object.keys(handlersRef.current));
        }
      } catch (error) {
        console.error('[WebSocket] ❌ Error processing message:', error);
      }
      console.log('[WebSocket] ====== END MESSAGE ======');
    };
    
    ws.onclose = (event) => {
      isConnectingRef.current = false;
      console.error("┌─────────────────────────────────────────────────────┐");
      console.error("│ [WebSocket] ❌ CONNECTION CLOSED                    │");
      console.error("└─────────────────────────────────────────────────────┘");
      console.error('[WebSocket] Close Code:', event.code);
      console.error('[WebSocket] Close Reason:', event.reason || 'No reason provided');
      console.error('[WebSocket] Was Clean Close:', event.wasClean);
      console.error('[WebSocket] Timestamp:', new Date().toISOString());
      
      // Explain common close codes
      const closeCodeExplanations = {
        1000: 'Normal closure',
        1001: 'Going away (e.g., server shutdown or browser navigating away)',
        1006: 'Abnormal closure - NO close frame received (server unreachable/crashed)',
        1009: 'Message too big',
        1011: 'Server error',
        1015: 'TLS handshake failure'
      };
      
      const explanation = closeCodeExplanations[event.code] || 'Unknown close code';
      console.error('[WebSocket] 💡 Explanation:', explanation);
      
      if (event.code === 1006) {
        console.error('[WebSocket] 🔍 Likely causes:');
        console.error('[WebSocket]    • Server not running on port 3000');
        console.error('[WebSocket]    • Server crashed or became unreachable');
        console.error('[WebSocket]    • Network connectivity issue');
        console.error('[WebSocket]    • Firewall blocking connection');
      }
      
      console.log('[WebSocket] 🔄 Will reconnect in 3 seconds...');
      setTimeout(connect, 3000);
    };
    
    ws.onerror = (error) => {
      isConnectingRef.current = false;
      console.error("┌─────────────────────────────────────────────────────┐");
      console.error("│ [WebSocket] ❌ ERROR OCCURRED                       │");
      console.error("└─────────────────────────────────────────────────────┘");
      console.error('[WebSocket] Error Event:', error);
      console.error('[WebSocket] readyState:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
      console.error('[WebSocket] URL:', wsUrl);
      console.error('[WebSocket] Timestamp:', new Date().toISOString());
      console.error('[WebSocket] ℹ️ Note: WebSocket errors don\'t provide detailed messages.');
      console.error('[WebSocket] ℹ️ Check the onclose event above for the actual error details.');
    };
    
    return ws;
  }, [wsRef]);
  
  // Send message
  const send = useCallback((data) => {
    console.log('[WebSocket] ━━━━━━━━━━ SENDING MESSAGE ━━━━━━━━━━');
    console.log('[WebSocket] 📤 Message Type:', data.type);
    console.log('[WebSocket] 📦 Message Data:', data);
    console.log('[WebSocket] ⏱️  Timestamp:', new Date().toISOString());
    
    if (!wsRef.current) {
      console.error('[WebSocket] ❌ SEND FAILED: WebSocket is null/undefined');
      console.error('[WebSocket] 💡 Possible cause: Connection not initialized');
      console.log('[WebSocket] ━━━━━━━━━━ END SEND (FAILED) ━━━━━━━━━━');
      return;
    }
    
    const readyState = wsRef.current.readyState;
    const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    const stateName = stateNames[readyState] || 'UNKNOWN';
    
    console.log('[WebSocket] 🔍 Current State:', readyState, `(${stateName})`);
    
    if (readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify(data);
        console.log('[WebSocket] ✅ WebSocket is OPEN - Sending now...');
        console.log('[WebSocket] 📄 Serialized:', message);
        wsRef.current.send(message);
        console.log('[WebSocket] ✅ MESSAGE SENT SUCCESSFULLY');
      } catch (error) {
        console.error('[WebSocket] ❌ SEND FAILED:', error.message);
      }
    } else {
      console.error('[WebSocket] ❌ SEND FAILED: WebSocket not ready');
      console.error('[WebSocket] Current state:', stateName);
      console.error('[WebSocket] 💡 Wait for state to be OPEN (readyState = 1)');
      console.error('[WebSocket] ⚠️  THIS MESSAGE WILL BE LOST!');
      
      if (readyState === WebSocket.CONNECTING) {
        console.error('[WebSocket] 💬 Suggestion: Wait for connection to open before sending');
      } else if (readyState === WebSocket.CLOSED || readyState === WebSocket.CLOSING) {
        console.error('[WebSocket] 💬 Suggestion: Reconnection in progress, try again in a few seconds');
      }
    }
    
    console.log('[WebSocket] ━━━━━━━━━━ END SEND ━━━━━━━━━━');
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
