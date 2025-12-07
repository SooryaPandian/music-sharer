// WebSocket connection
let ws = null;
let localStream = null;
let peerConnections = new Map(); // Map of listener ID to RTCPeerConnection
let role = null; // 'broadcaster' or 'listener'
let roomCode = null;

// Simple STUN configuration for desktop reliability
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// DOM Elements
const homeScreen = document.getElementById("homeScreen");
const broadcasterScreen = document.getElementById("broadcasterScreen");
const listenerScreen = document.getElementById("listenerScreen");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const stopBroadcastBtn = document.getElementById("stopBroadcastBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const roomCodeInput = document.getElementById("roomCodeInput");
const broadcasterRoomCode = document.getElementById("broadcasterRoomCode");
const listenerRoomCode = document.getElementById("listenerRoomCode");
const listenerCount = document.getElementById("listenerCount");
const listenerStatus = document.getElementById("listenerStatus");
const listenerStatusText = document.getElementById("listenerStatusText");

const remoteAudio = document.getElementById("remoteAudio");
const enableAudioBtn = document.getElementById("enableAudioBtn");

// Initialize WebSocket connection
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Connected to signaling server
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "room-created":
        handleRoomCreated(data);
        break;
      case "room-joined":
        handleRoomJoined(data);
        break;
      case "new-listener":
        handleNewListener(data);
        break;
      case "offer":
        handleOffer(data);
        break;
      case "answer":
        handleAnswer(data);
        break;
      case "ice-candidate":
        handleIceCandidate(data);
        break;
      case "broadcaster-left":
      case "broadcaster-disconnected":
        handleBroadcasterLeft();
        break;
      case "error":
        handleError(data);
        break;
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
  };

  ws.onerror = (error) => {
    // WebSocket error
  };
}

// Event Listeners
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
stopBroadcastBtn.addEventListener("click", stopBroadcast);
leaveRoomBtn.addEventListener("click", leaveRoom);

// Allow Enter key to join room
roomCodeInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

// Auto-uppercase room code input
roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});



// Create Room (Broadcaster)
async function createRoom() {

  try {
    // Request screen/tab audio capture
    // Note: Chrome requires video:true even for audio-only capture
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required by Chrome, but we'll only use the audio
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Check if audio track exists
    if (!localStream.getAudioTracks().length) {
      throw new Error(
        'No audio track found. Please ensure "Share audio" is checked.'
      );
    }

    // Stop the video track since we only need audio
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
    }

    role = "broadcaster";

    // Send create room request
    ws.send(JSON.stringify({ type: "create-room" }));

    // Initialize visualizer
    initVisualizer("visualizerBars", localStream);
  } catch (error) {

    if (error.name === "NotAllowedError") {
      alert(
        'Permission denied. Please click "Share" when the browser asks to share your screen.'
      );
    } else if (error.name === "NotFoundError") {
      alert(
        'No audio source found. Make sure you:\n1. Select a Chrome tab (not "Entire Screen")\n2. Check the "Share audio" checkbox'
      );
    } else {
      alert(
        "Failed to capture audio:\n" +
          error.message +
          '\n\nMake sure to:\n1. Select a Chrome tab\n2. Check "Share audio" in the dialog'
      );
    }
  }
}

// Handle room created response
function handleRoomCreated(data) {
  roomCode = data.roomCode;
  broadcasterRoomCode.textContent = roomCode;

  showScreen("broadcaster");
}

// Join Room (Listener)
function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    alert("Please enter a valid 6-character room code");
    return;
  }

  role = "listener";
  roomCode = code;

  ws.send(
    JSON.stringify({
      type: "join-room",
      roomCode: code,
    })
  );
}

// Handle room joined response
function handleRoomJoined(data) {
  listenerRoomCode.textContent = data.roomCode;
  showScreen("listener");
}

// Handle new listener (Broadcaster side)
async function handleNewListener(data) {
  const listenerId = data.listenerId;

  // Create new peer connection for this listener
  const pc = new RTCPeerConnection(iceServers);
  peerConnections.set(listenerId, pc);

  // Add local stream tracks to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "ice-candidate",
          targetId: listenerId,
          candidate: event.candidate,
        })
      );
    }
  };

  // Monitor connection state
  pc.onconnectionstatechange = () => {
    // Connection state changed
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(
    JSON.stringify({
      type: "offer",
      targetId: listenerId,
      offer: offer,
    })
  );

  // Update listener count
  updateListenerCount();
}

// Handle offer (Listener side)
async function handleOffer(data) {
  const pc = new RTCPeerConnection(iceServers);
  peerConnections.set("broadcaster", pc);

  // Handle incoming audio stream
  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];

    // Initialize visualizer with remote stream
    initVisualizer("listenerVisualizerBars", event.streams[0]);

    // Try to autoplay; if blocked, show a button for the user to enable audio
    remoteAudio
      .play()
      .then(() => {
        if (enableAudioBtn) enableAudioBtn.classList.add("hidden");
      })
      .catch((err) => {
        if (enableAudioBtn) enableAudioBtn.classList.remove("hidden");
      });
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
        })
      );
    }
  };

  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    updateListenerStatus(pc.connectionState);
  };

  // Set remote description and create answer
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(
    JSON.stringify({
      type: "answer",
      answer: answer,
    })
  );
}

// Handle answer (Broadcaster side)
async function handleAnswer(data) {
  const pc = peerConnections.get(data.senderId);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
}

// Handle ICE candidate
async function handleIceCandidate(data) {
  let pc;

  if (role === "broadcaster") {
    pc = peerConnections.get(data.senderId);
  } else {
    pc = peerConnections.get("broadcaster");
  }

  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      // Error adding ICE candidate
    }
  }
}

// Handle broadcaster left
function handleBroadcasterLeft() {
  updateListenerStatus("disconnected");
  listenerStatusText.textContent = "Broadcaster left";
  listenerStatus.className = "status status-disconnected";
}

// Handle errors
function handleError(data) {
  alert(data.message);
  showScreen("home");
}

// Stop broadcast
function stopBroadcast() {
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  // Close all peer connections
  peerConnections.forEach((pc) => pc.close());
  peerConnections.clear();

  // Notify server
  ws.send(
    JSON.stringify({
      type: "leave-room",
      roomCode: roomCode,
    })
  );

  // Reset UI
  showScreen("home");
  role = null;
  roomCode = null;
}

// Leave room (Listener)
function leaveRoom() {
  // Close peer connection
  const pc = peerConnections.get("broadcaster");
  if (pc) {
    pc.close();
  }
  peerConnections.clear();

  // Stop audio
  remoteAudio.srcObject = null;

  // Notify server
  ws.send(
    JSON.stringify({
      type: "leave-room",
      roomCode: roomCode,
    })
  );

  // Reset UI
  showScreen("home");
  role = null;
  roomCode = null;
  roomCodeInput.value = "";

  if (enableAudioBtn) {
    enableAudioBtn.classList.add("hidden");
  }
}

// Enable audio button handler
if (enableAudioBtn) {
  enableAudioBtn.addEventListener("click", async () => {
    try {
      await remoteAudio.play();
      enableAudioBtn.classList.add("hidden");
    } catch (err) {
      alert(
        "Unable to start audio playback: " +
          (err && err.message ? err.message : err)
      );
    }
  });
}

// Update listener count
function updateListenerCount() {
  listenerCount.textContent = peerConnections.size;
}

// Update listener status
function updateListenerStatus(state) {
  const statusMap = {
    connected: { text: "Connected", class: "status-connected" },
    connecting: { text: "Connecting...", class: "status-broadcasting" },
    disconnected: { text: "Disconnected", class: "status-disconnected" },
    failed: { text: "Connection Failed", class: "status-disconnected" },
  };

  const status = statusMap[state] || statusMap["disconnected"];
  listenerStatusText.textContent = status.text;
  listenerStatus.className = `status ${status.class}`;
}

// Show specific screen
function showScreen(screen) {
  homeScreen.classList.add("hidden");
  broadcasterScreen.classList.add("hidden");
  listenerScreen.classList.add("hidden");

  switch (screen) {
    case "home":
      homeScreen.classList.remove("hidden");
      break;
    case "broadcaster":
      broadcasterScreen.classList.remove("hidden");
      break;
    case "listener":
      listenerScreen.classList.remove("hidden");
      break;
  }
}

// Audio Visualizer
function initVisualizer(containerId, stream) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear existing bars
  container.innerHTML = "";

  // Create visualizer bars
  const barCount = 32;
  const bars = [];

  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement("div");
    bar.className = "visualizer-bar";
    container.appendChild(bar);
    bars.push(bar);
  }

  // Set up Web Audio API
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    // Animate visualizer
    function animate() {
      requestAnimationFrame(animate);
      analyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < bars.length; i++) {
        const value = dataArray[i] || 0;
        const height = (value / 255) * 100;
        bars[i].style.height = `${Math.max(height, 8)}%`;
      }
    }

    animate();
  } catch (error) {
    // Visualizer error
  }
}

// Initialize on load
connectWebSocket();
