import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { iceServers } from '../utils/config';

export function useWebRTC() {
  const {
    wsRef,
    localStreamRef,
    remoteAudioRef,
    peerConnectionsRef,
    role,
    setRole,
    roomCode,
    setRoomCode,
    setCurrentScreen,
    setListenerCount,
    setConnectionStatus,
    isPaused,
    setIsPaused,
    userName,
    resetState,
  } = useAppContext();
  
  // Send WebSocket message
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, [wsRef]);
  
  // Create room as broadcaster
  const createRoom = useCallback(async () => {
    console.log('[WebRTC] createRoom called - starting audio capture...');
    try {
      // Request screen/tab audio capture
      console.log('[WebRTC] Requesting display media...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required by Chrome, but we'll only use the audio
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      
      console.log('[WebRTC] Display media received, stream:', stream);
      
      // Check if audio track exists
      const audioTracks = stream.getAudioTracks();
      console.log('[WebRTC] Audio tracks count:', audioTracks.length);
      
      if (!audioTracks.length) {
        throw new Error('No audio track found. Please ensure "Share audio" is checked.');
      }
      
      // Stop the video track since we only need audio
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        console.log('[WebRTC] Stopping video track...');
        videoTrack.stop();
        stream.removeTrack(videoTrack);
      }
      
      console.log('[WebRTC] Setting localStreamRef...');
      localStreamRef.current = stream;
      console.log('[WebRTC] Setting role to broadcaster...');
      setRole("broadcaster");
      
      // Send create room request
      console.log('[WebRTC] Sending create-room message to server...');
      send({ type: "create-room" });
      console.log('[WebRTC] ✓ createRoom completed successfully');
      
      return stream;
    } catch (error) {
      console.error('[WebRTC] ✗ createRoom failed:', error);
      console.error('[WebRTC] Error name:', error.name);
      console.error('[WebRTC] Error message:', error.message);
      
      if (error.name === "NotAllowedError") {
        alert('Permission denied. Please click "Share" when the browser asks to share your screen.');
      } else if (error.name === "NotFoundError") {
        alert('No audio source found. Make sure you:\n1. Select a Chrome tab (not "Entire Screen")\n2. Check the "Share audio" checkbox');
      } else {
        alert(
          "Failed to capture audio:\n" +
          error.message +
          '\n\nMake sure to:\n1. Select a Chrome tab\n2. Check "Share audio" in the dialog'
        );
      }
      throw error;
    }
  }, [setRole, send]); // Removed localStreamRef - refs are stable
  
  // Join room as listener
  const joinRoom = useCallback((code) => {
    if (code.length !== 6) {
      alert("Please enter a valid 6-character room code");
      return;
    }
    
    setRole("listener");
    setRoomCode(code);
    
    send({
      type: "join-room",
      roomCode: code,
      userName: userName,
    });
  }, [setRole, setRoomCode, send, userName]);
  
  // Handle new listener (Broadcaster side)
  const handleNewListener = useCallback(async (listenerId) => {
    console.log(`[Broadcaster] New listener connected: ${listenerId}`);
    console.log(`[Broadcaster] 🔍 STREAM DIAGNOSTIC:`, {
      'localStreamRef exists': !!localStreamRef,
      'localStreamRef.current exists': !!localStreamRef.current,
      'localStreamRef.current value': localStreamRef.current
    });
    
    try {
      // Create new peer connection for this listener
      console.log(`[Broadcaster] Creating peer connection for ${listenerId}`);
      const pc = new RTCPeerConnection(iceServers);
      peerConnectionsRef.current.set(listenerId, pc);
      console.log(`[Broadcaster] Peer connection created successfully`);
      
      //Add ONLY audio tracks to peer connection
      const localStream = localStreamRef.current;
      
      console.log(`[Broadcaster] 🔍 Local stream check:`, {
        'stream object': localStream,
        'stream is null': localStream === null,
        'stream is undefined': localStream === undefined
      });
      
      if (!localStream) {
        console.error(`[Broadcaster] ✗ No local stream available!`);
        console.error(`[Broadcaster] Cannot connect to listener ${listenerId} - no stream to share`);
        console.error(`[Broadcaster] 🔍 localStreamRef:`, localStreamRef);
        console.error(`[Broadcaster] 🔍 localStreamRef.current:`, localStreamRef.current);
        return;
      }
      
      console.log(`[Broadcaster] ✓ Local stream exists`);
      console.log(`[Broadcaster] Stream ID:`, localStream.id);
      console.log(`[Broadcaster] Stream active:`, localStream.active);
      
      const audioTracks = localStream.getAudioTracks();
      console.log(`[Broadcaster] Local stream has ${audioTracks.length} audio track(s)`);
      
      if (audioTracks.length === 0) {
        console.error(`[Broadcaster] ✗ No audio tracks in stream!`);
        console.error(`[Broadcaster] Cannot connect to listener ${listenerId} - no audio to share`);
        return;
      }
      
      audioTracks.forEach((track, index) => {
        console.log(`[Broadcaster] Audio track ${index}:`, {
          id: track.id,
          label: track.label,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });
        console.log(`[Broadcaster] Adding audio track for ${listenerId}`, track);
        pc.addTrack(track, localStream);
      });
      console.log(`[Broadcaster] ✓ All audio tracks added to peer connection`);
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[Broadcaster] Sending ICE candidate to ${listenerId}`);
          send({
            type: "ice-candidate",
            targetId: listenerId,
            candidate: event.candidate,
          });
        }
      };
      
      // Create offer
      console.log(`[Broadcaster] Creating offer for ${listenerId}...`);
      const offer = await pc.createOffer();
      console.log(`[Broadcaster] ✓ Offer created successfully`);
      
      console.log(`[Broadcaster] Setting local description...`);
      await pc.setLocalDescription(offer);
      console.log(`[Broadcaster] ✓ Local description set`);
      
      console.log(`[Broadcaster] Sending offer to ${listenerId}...`);
      send({
        type: "offer",
        targetId: listenerId,
        offer: offer,
      });
      console.log(`[Broadcaster] ✓ Offer sent successfully to ${listenerId}`);
      
      // Update listener count
      setListenerCount(peerConnectionsRef.current.size);
    } catch (error) {
      console.error(`[Broadcaster] ✗ Error handling new listener ${listenerId}:`, error);
      console.error(`[Broadcaster] Error stack:`, error.stack);
      alert(`Failed to connect to listener: ${error.message}`);
    }
  }, [send, setListenerCount]); // Removed localStreamRef and peerConnectionsRef - refs are stable and shouldn't be dependencies
  
  // Handle offer from broadcaster (Listener side)
  const handleOffer = useCallback(async (data, audioRef, onAudioReady) => {
    console.log("[Listener] Received offer from broadcaster");
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionsRef.current.set("broadcaster", pc);
    
    // Handle incoming audio stream
    pc.ontrack = (event) => {
      console.log("[Listener] Received remote audio track");
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
      }
      if (onAudioReady) {
        onAudioReady(event.streams[0]);
      }
      
      // Try to autoplay
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => {
            console.log("[Listener] Audio autoplay successful");
          })
          .catch(() => {
            console.log("[Listener] Audio autoplay blocked");
          });
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({
          type: "ice-candidate",
          candidate: event.candidate,
        });
      }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      setConnectionStatus(pc.connectionState);
    };
    
    // Set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    send({
      type: "answer",
      answer: answer,
    });
  }, [send,  ]); // Removed peerConnectionsRef - refs are stable
  
  // Handle answer from listener (Broadcaster side)
  const handleAnswer = useCallback(async (data) => {
    const pc = peerConnectionsRef.current.get(data.senderId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }, []); // Removed peerConnectionsRef - refs are stable
  
  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (data, currentRole) => {
    let pc;
    
    if (currentRole === "broadcaster") {
      pc = peerConnectionsRef.current.get(data.senderId);
    } else {
      pc = peerConnectionsRef.current.get("broadcaster");
    }
    
    if (pc && data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        console.error(`[${currentRole}] Error adding ICE candidate:`, error);
      }
    }
  }, []); // Removed peerConnectionsRef - refs are stable
  
  // Toggle pause
  const togglePause = useCallback(() => {
    const localStream = localStreamRef.current;
    if (!localStream) return;
    
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newPausedState;
    });
  }, [isPaused, setIsPaused]); // Removed localStreamRef - refs are stable
  
  // Change audio source
  const changeAudioSource = useCallback(async () => {
    try {
      // Stop current stream
      const currentStream = localStreamRef.current;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
      
      // Request new screen/tab audio capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      
      // Check if audio track exists
      if (!stream.getAudioTracks().length) {
        throw new Error('No audio track found. Please ensure "Share audio" is checked.');
      }
      
      // Stop the video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        stream.removeTrack(videoTrack);
      }
      
      localStreamRef.current = stream;
      
      // Update all peer connections with new stream
      peerConnectionsRef.current.forEach((pc) => {
        const senders = pc.getSenders();
        const audioTrack = stream.getAudioTracks()[0];
        const audioSender = senders.find((sender) => sender.track?.kind === "audio");
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack);
        }
      });
      
      // Reset pause state
      setIsPaused(false);
      
      return stream;
    } catch (error) {
      alert("Failed to change audio source: " + error.message);
      throw error;
    }
  }, [setIsPaused]); // Removed localStreamRef and peerConnectionsRef - refs are stable
  
  // Stop broadcast
  const stopBroadcast = useCallback(() => {
    // Stop local stream
    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    
    // Notify server
    send({
      type: "leave-room",
      roomCode: roomCode,
    });
    
    // Reset state
    resetState();
  }, [roomCode, send, resetState]); // Removed localStreamRef and peerConnectionsRef - refs are stable
  
  // Leave room as listener
  const leaveRoom = useCallback((audioRef) => {
    // Close peer connection
    const pc = peerConnectionsRef.current.get("broadcaster");
    if (pc) {
      pc.close();
    }
    peerConnectionsRef.current.clear();
    
    // Stop audio
    if (audioRef?.current) {
      audioRef.current.srcObject = null;
    }
    
    // Notify server
    send({
      type: "leave-room",
      roomCode: roomCode,
    });
    
    // Reset state
    resetState();
  }, [roomCode, send, resetState]); // Removed peerConnectionsRef - refs are stable
  
  return {
    createRoom,
    joinRoom,
    handleNewListener,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    togglePause,
    changeAudioSource,
    stopBroadcast,
    leaveRoom,
  };
}
