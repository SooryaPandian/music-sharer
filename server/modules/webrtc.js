// WebRTC module - Handles peer connections and media streaming

import { iceServers } from "./config.js";
import {
  getWs,
  getLocalStream,
  setLocalStream,
  getPeerConnections,
  getRole,
  setRole,
  getRoomCode,
  setRoomCode,
  getIsPaused,
  setIsPaused,
  resetState,
  getUserName,
} from "./state.js";
import {
  showScreen,
  updateListenerCount,
  updateListenerStatus,
  setBroadcasterRoomCode,
  setListenerRoomCode,
  generateShareUrl,
  setShareUrl,
  updateBroadcastPauseUI,
} from "./ui.js";
import { initVisualizer } from "./visualizer.js";
import {
  remoteAudio,
  enableAudioBtn,
  listenerStatus,
  listenerStatusText,
  roomCodeInput,
} from "./dom.js";

/**
 * Create a room as broadcaster
 */
export async function createRoom() {
  try {
    // Request screen/tab audio capture
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required by Chrome, but we'll only use the audio
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

    // Stop the video track since we only need audio
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      stream.removeTrack(videoTrack);
    }

    setLocalStream(stream);
    setRole("broadcaster");

    // Send create room request
    getWs().send(JSON.stringify({ type: "create-room" }));

    // Initialize visualizer
    initVisualizer("visualizerBars", stream);
  } catch (error) {
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
  }
}

/**
 * Handle room created response
 * @param {Object} data - Server response data
 */
export function handleRoomCreated(data) {
  setRoomCode(data.roomCode);
  setBroadcasterRoomCode(data.roomCode);

  // Set up shareable URL
  const shareUrl = generateShareUrl(data.roomCode);
  setShareUrl(shareUrl);

  showScreen("broadcaster");
}

/**
 * Join a room as listener
 */
export function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    alert("Please enter a valid 6-character room code");
    return;
  }

  setRole("listener");
  setRoomCode(code);

  getWs().send(
    JSON.stringify({
      type: "join-room",
      roomCode: code,
      userName: getUserName(),
    })
  );
}

/**
 * Handle room joined response
 * @param {Object} data - Server response data
 */
export function handleRoomJoined(data) {
  setListenerRoomCode(data.roomCode);
  showScreen("listener");
}

/**
 * Handle new listener connection (Broadcaster side)
 * @param {Object} data - Server response data with listenerId
 */
export async function handleNewListener(data) {
  const listenerId = data.listenerId;
  console.log(`[Broadcaster] New listener connected: ${listenerId}`);

  // Create new peer connection for this listener
  const pc = new RTCPeerConnection(iceServers);
  getPeerConnections().set(listenerId, pc);

  // Add ONLY audio tracks to peer connection (mobile compatibility)
  const localStream = getLocalStream();
  localStream.getAudioTracks().forEach((track) => {
    console.log(`[Broadcaster] Adding audio track for ${listenerId}`);
    pc.addTrack(track, localStream);
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const candidate = event.candidate;
      console.log(`[Broadcaster] ICE candidate for ${listenerId}:`, {
        type: candidate.type,
        protocol: candidate.protocol,
        address: candidate.address || candidate.candidate.split(" ")[4],
        port: candidate.port,
        candidate: candidate.candidate,
      });

      getWs().send(
        JSON.stringify({
          type: "ice-candidate",
          targetId: listenerId,
          candidate: event.candidate,
        })
      );
    } else {
      console.log(`[Broadcaster] ICE gathering complete for ${listenerId}`);
    }
  };

  // Monitor connection state
  pc.onconnectionstatechange = () => {
    // Connection state changed
  };

  // Create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  getWs().send(
    JSON.stringify({
      type: "offer",
      targetId: listenerId,
      offer: offer,
    })
  );

  // Update listener count
  updateListenerCount();
}

/**
 * Handle offer from broadcaster (Listener side)
 * @param {Object} data - Server response data with offer
 */
export async function handleOffer(data) {
  console.log("[Listener] Received offer from broadcaster");
  const pc = new RTCPeerConnection(iceServers);
  getPeerConnections().set("broadcaster", pc);

  // Handle incoming audio stream
  pc.ontrack = (event) => {
    console.log("[Listener] Received remote audio track");
    remoteAudio.srcObject = event.streams[0];

    // Initialize visualizer with remote stream
    initVisualizer("listenerVisualizerBars", event.streams[0]);

    // Try to autoplay; if blocked, show a button for the user to enable audio
    remoteAudio
      .play()
      .then(() => {
        console.log("[Listener] Audio autoplay successful");
        if (enableAudioBtn) enableAudioBtn.classList.add("hidden");
      })
      .catch((err) => {
        console.log("[Listener] Audio autoplay blocked, showing enable button");
        if (enableAudioBtn) enableAudioBtn.classList.remove("hidden");
      });
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      getWs().send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        })
      );
    }
  };

  // Monitor connection state
  pc.oniceconnectionstatechange = () => {
    // ICE connection state changed
  };

  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    updateListenerStatus(pc.connectionState);
  };

  // Set remote description and create answer
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  getWs().send(
    JSON.stringify({
      type: "answer",
      answer: answer,
    })
  );
}

/**
 * Handle answer from listener (Broadcaster side)
 * @param {Object} data - Server response data with answer
 */
export async function handleAnswer(data) {
  const pc = getPeerConnections().get(data.senderId);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
}

/**
 * Handle ICE candidate
 * @param {Object} data - Server response data with candidate
 */
export async function handleIceCandidate(data) {
  let pc;
  const role = getRole();

  if (role === "broadcaster") {
    pc = getPeerConnections().get(data.senderId);
  } else {
    pc = getPeerConnections().get("broadcaster");
  }

  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      console.log(`[${role}] Added ICE candidate:`, data.candidate.type);
    } catch (error) {
      console.error(`[${role}] Error adding ICE candidate:`, error);
    }
  } else if (!pc) {
    console.warn(`[${role}] Peer connection not found for ICE candidate`);
  }
}

/**
 * Handle broadcaster leaving
 */
export function handleBroadcasterLeft() {
  updateListenerStatus("disconnected");
  listenerStatusText.textContent = "Broadcaster left";
  listenerStatus.className = "status status-disconnected";
}

/**
 * Toggle pause/resume broadcast
 */
export function togglePauseBroadcast() {
  const localStream = getLocalStream();
  if (!localStream) return;

  const newPausedState = !getIsPaused();
  setIsPaused(newPausedState);

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !newPausedState;
  });

  updateBroadcastPauseUI(newPausedState);
}

/**
 * Change audio source
 */
export async function changeAudioSource() {
  try {
    // Stop current stream
    const currentStream = getLocalStream();
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

    setLocalStream(stream);

    // Update all peer connections with new stream
    getPeerConnections().forEach((pc) => {
      const senders = pc.getSenders();
      const audioTrack = stream.getAudioTracks()[0];
      const audioSender = senders.find((sender) => sender.track?.kind === "audio");
      if (audioSender && audioTrack) {
        audioSender.replaceTrack(audioTrack);
      }
    });

    // Reinitialize visualizer
    initVisualizer("visualizerBars", stream);

    // Reset pause state
    setIsPaused(false);
    updateBroadcastPauseUI(false);
  } catch (error) {
    alert("Failed to change audio source: " + error.message);
  }
}

/**
 * Stop broadcast and clean up
 */
export function stopBroadcast() {
  // Stop local stream
  const localStream = getLocalStream();
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
  }

  // Close all peer connections
  getPeerConnections().forEach((pc) => pc.close());
  getPeerConnections().clear();

  // Notify server
  getWs().send(
    JSON.stringify({
      type: "leave-room",
      roomCode: getRoomCode(),
    })
  );

  // Reset UI
  showScreen("home");
  resetState();
}

/**
 * Leave room as listener
 */
export function leaveRoom() {
  // Close peer connection
  const pc = getPeerConnections().get("broadcaster");
  if (pc) {
    pc.close();
  }
  getPeerConnections().clear();

  // Stop audio
  remoteAudio.srcObject = null;

  // Notify server
  getWs().send(
    JSON.stringify({
      type: "leave-room",
      roomCode: getRoomCode(),
    })
  );

  // Reset UI
  showScreen("home");
  roomCodeInput.value = "";
  resetState();

  if (enableAudioBtn) {
    enableAudioBtn.classList.add("hidden");
  }
}
