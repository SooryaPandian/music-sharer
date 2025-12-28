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
    try {
      // Request screen/tab audio capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required by Chrome, but we'll only use the audio
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2, // Stereo audio
          sampleRate: 48000, // High-quality audio (48kHz)
          latency: 0, // Minimize latency for real-time streaming
        },
      });
      
      // Check if audio track exists
      const audioTracks = stream.getAudioTracks();
      
      if (!audioTracks.length) {
        throw new Error('No audio track found. Please ensure "Share audio" is checked.');
      }
      
      // Stop the video track since we only need audio
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        stream.removeTrack(videoTrack);
      }
      
      localStreamRef.current = stream;
      setRole("broadcaster");
      
      // Send create room request
      send({ type: "create-room" });
      
      return stream;
    } catch (error) {
      console.error('[WebRTC] createRoom failed:', error);
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
  }, [setRole, send]);
  
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
    try {
      // Create new peer connection for this listener
      const pc = new RTCPeerConnection(iceServers);
      peerConnectionsRef.current.set(listenerId, pc);
      
      //Add ONLY audio tracks to peer connection
      const localStream = localStreamRef.current;
      
      if (!localStream) {
        console.error(`[Broadcaster] No local stream available - cannot connect to listener ${listenerId}`);
        return;
      }
      
      const audioTracks = localStream.getAudioTracks();
      
      if (audioTracks.length === 0) {
        console.error(`[Broadcaster] No audio tracks in stream - cannot connect to listener ${listenerId}`);
        return;
      }
      
      audioTracks.forEach((track) => {
        pc.addTrack(track, localStream);
      });
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "ice-candidate",
            targetId: listenerId,
            candidate: event.candidate,
          });
        }
      };
      
      // Create offer
      const offer = await pc.createOffer();
      
      // Modify SDP to ensure stereo audio
      const modifiedOffer = {
        ...offer,
        sdp: ensureStereoInSDP(offer.sdp)
      };
      
      await pc.setLocalDescription(modifiedOffer);
      
      send({
        type: "offer",
        targetId: listenerId,
        offer: modifiedOffer,
      });
      
      // Update listener count
      setListenerCount(peerConnectionsRef.current.size);
    } catch (error) {
      console.error(`[Broadcaster] Error handling new listener ${listenerId}:`, error);
      alert(`Failed to connect to listener: ${error.message}`);
    }
  }, [send, setListenerCount]);
  
  // Handle offer from broadcaster (Listener side)
  const handleOffer = useCallback(async (data, audioRef, onAudioReady) => {
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionsRef.current.set("broadcaster", pc);
    
    // Handle incoming audio stream
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
      }
      if (onAudioReady) {
        onAudioReady(stream);
      }
      
      // Try to autoplay
      if (audioRef.current) {
        audioRef.current.play()
          .catch(() => {
            // Autoplay blocked - user will need to enable audio
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
    
    // Modify SDP to ensure stereo audio
    const modifiedOffer = {
      ...data.offer,
      sdp: ensureStereoInSDP(data.offer.sdp)
    };
    
    // Set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription(modifiedOffer));
    const answer = await pc.createAnswer();
    
    // Also ensure stereo in answer SDP
    const modifiedAnswer = {
      ...answer,
      sdp: ensureStereoInSDP(answer.sdp)
    };
    
    await pc.setLocalDescription(modifiedAnswer);
    
    send({
      type: "answer",
      answer: modifiedAnswer,
    });
  }, [send, setConnectionStatus]);
  
  // Helper function to ensure stereo audio in SDP
  const ensureStereoInSDP = (sdp) => {
    // Find the Opus codec line and add stereo parameters
    let modifiedSDP = sdp;
    
    // Match the Opus codec payload type
    const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
    if (opusMatch) {
      const opusPayload = opusMatch[1];
      
      // Check if fmtp line exists for Opus
      const fmtpRegex = new RegExp(`a=fmtp:${opusPayload} (.+)`, 'g');
      const fmtpMatch = fmtpRegex.exec(sdp);
      
      if (fmtpMatch) {
        // Update existing fmtp line to include stereo parameters
        const existingParams = fmtpMatch[1];
        let newParams = existingParams;
        
        // Add or update stereo parameter
        if (!existingParams.includes('stereo=')) {
          newParams += ';stereo=1';
        } else {
          newParams = newParams.replace(/stereo=0/, 'stereo=1');
        }
        
        // Add or update sprop-stereo parameter
        if (!existingParams.includes('sprop-stereo=')) {
          newParams += ';sprop-stereo=1';
        } else {
          newParams = newParams.replace(/sprop-stereo=0/, 'sprop-stereo=1');
        }
        
        // Add maxaveragebitrate for better quality
        if (!existingParams.includes('maxaveragebitrate=')) {
          newParams += ';maxaveragebitrate=510000';
        }
        
        modifiedSDP = sdp.replace(
          `a=fmtp:${opusPayload} ${existingParams}`,
          `a=fmtp:${opusPayload} ${newParams}`
        );
      } else {
        // Add new fmtp line after rtpmap
        const rtpmapLine = `a=rtpmap:${opusPayload} opus/48000/2`;
        const newFmtpLine = `a=fmtp:${opusPayload} stereo=1;sprop-stereo=1;maxaveragebitrate=510000`;
        modifiedSDP = sdp.replace(
          rtpmapLine,
          `${rtpmapLine}\r\n${newFmtpLine}`
        );
      }
    }
    
    return modifiedSDP;
  };
  
  // Handle answer from listener (Broadcaster side)
  const handleAnswer = useCallback(async (data) => {
    const pc = peerConnectionsRef.current.get(data.senderId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }, []);
  
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
  }, []);
  
  // Toggle pause
  const togglePause = useCallback(() => {
    const localStream = localStreamRef.current;
    if (!localStream) return;
    
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newPausedState;
    });
  }, [isPaused, setIsPaused]);
  
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
          channelCount: 2, // Stereo audio
          sampleRate: 48000, // High-quality audio (48kHz)
          latency: 0, // Minimize latency for real-time streaming
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
  }, [setIsPaused]);
  
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
  }, [roomCode, send, resetState]);
  
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
  }, [roomCode, send, resetState]);
  
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
