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
    console.log("Connected to signaling server");
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("Received message:", data.type);

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
    console.log("Disconnected from signaling server");
    setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
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

// Mobile device detection and UI adaptation
function isMobileDevice() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2)
  );
}

function adaptUIForDevice() {
  const isMobile = isMobileDevice();

  if (isMobile) {
    // Hide create room button on mobile
    createRoomBtn.style.display = "none";

    // Hide the divider
    const divider = document.querySelector(".divider");
    if (divider) divider.style.display = "none";

    // Add helpful message
    const mobileMessage = document.createElement("p");
    mobileMessage.style.cssText =
      "text-align: center; color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem; line-height: 1.5;";
    mobileMessage.innerHTML =
      "📱 <strong>Mobile Device Detected</strong><br>Enter a room code to listen to audio from a desktop broadcaster.";

    const homeScreen = document.getElementById("homeScreen");
    const cardTitle = homeScreen.querySelector(".card-title");
    cardTitle.after(mobileMessage);

    // Update page title
    cardTitle.textContent = "Join a Room";

    console.log("📱 Mobile device detected - showing listener-only interface");
  } else {
    console.log("🖥️ Desktop device detected - showing full interface");
  }
}

// Run adaptation on page load
adaptUIForDevice();

// Debug logging system for mobile
const debugLog = document.getElementById("debugLog");
const debugContent = document.getElementById("debugContent");
const toggleDebugBtn = document.getElementById("toggleDebugBtn");
const clearDebugBtn = document.getElementById("clearDebugBtn");
const copyDebugBtn = document.getElementById("copyDebugBtn");

let debugVisible = false;

function addDebugEntry(message, type = "log") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `debug-entry ${type}`;
  entry.innerHTML = `<span class="debug-timestamp">${timestamp}</span>${message}`;
  debugContent.appendChild(entry);
  debugContent.scrollTop = debugContent.scrollHeight;

  // Keep only last 50 entries
  while (debugContent.children.length > 50) {
    debugContent.removeChild(debugContent.firstChild);
  }
}

toggleDebugBtn.addEventListener("click", () => {
  debugVisible = !debugVisible;
  debugLog.classList.toggle("hidden");
  toggleDebugBtn.textContent = debugVisible
    ? "Hide Debug Log"
    : "Show Debug Log";
});

clearDebugBtn.addEventListener("click", () => {
  debugContent.innerHTML = "";
  addDebugEntry("Debug log cleared", "log");
});

copyDebugBtn.addEventListener("click", async () => {
  // Get all log entries as plain text
  const entries = Array.from(debugContent.querySelectorAll(".debug-entry"));
  const logText = entries.map((entry) => entry.textContent).join("\n");

  try {
    await navigator.clipboard.writeText(logText);

    // Visual feedback
    const originalText = copyDebugBtn.textContent;
    copyDebugBtn.textContent = "✓ Copied!";
    copyDebugBtn.classList.add("copied");

    setTimeout(() => {
      copyDebugBtn.textContent = originalText;
      copyDebugBtn.classList.remove("copied");
    }, 2000);

    addDebugEntry("📋 Log copied to clipboard", "success");
  } catch (err) {
    console.error("Failed to copy:", err);
    addDebugEntry("❌ Failed to copy log", "error");

    // Fallback: show alert with text to manually copy
    alert("Copy failed. Here is the log:\n\n" + logText);
  }
});

// Override console.log and console.error to also log to debug panel
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function (...args) {
  originalConsoleLog.apply(console, args);
  addDebugEntry(args.join(" "), "log");
};

console.error = function (...args) {
  originalConsoleError.apply(console, args);
  addDebugEntry(args.join(" "), "error");
};

// Add success and warning helpers
window.debugSuccess = function (message) {
  console.log("✅ " + message);
  addDebugEntry("✅ " + message, "success");
};

window.debugWarning = function (message) {
  console.log("⚠️ " + message);
  addDebugEntry("⚠️ " + message, "warning");
};

// Auto-show debug log on all devices
debugVisible = true;
debugLog.classList.remove("hidden");
toggleDebugBtn.textContent = "Hide Debug Log";

if (isMobileDevice()) {
  addDebugEntry("📱 Mobile device detected - Debug log enabled", "success");
} else {
  addDebugEntry("🖥️ Desktop device detected - Debug log enabled", "success");
}

// Create Room (Broadcaster)
async function createRoom() {
  console.log("Create room clicked - requesting screen share...");

  try {
    console.log("Calling getDisplayMedia with video:true, audio:true");
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

    console.log("Got media stream!");
    console.log("Audio tracks:", localStream.getAudioTracks().length);
    console.log("Video tracks:", localStream.getVideoTracks().length);

    // Check if audio track exists
    if (!localStream.getAudioTracks().length) {
      throw new Error(
        'No audio track found. Please ensure "Share audio" is checked.'
      );
    }

    // Stop the video track since we only need audio
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      console.log("Stopping video track...");
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
    }

    console.log(
      "After removing video - Audio tracks:",
      localStream.getAudioTracks().length
    );

    role = "broadcaster";

    // Send create room request
    ws.send(JSON.stringify({ type: "create-room" }));

    // Initialize visualizer
    initVisualizer("visualizerBars", localStream);
  } catch (error) {
    console.error("Error creating room:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);

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
      console.log("Broadcaster: Sending ICE candidate to listener", listenerId);
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
    console.log(`Broadcaster -> Listener: ${pc.connectionState}`);
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
    console.log("Received remote track");
    remoteAudio.srcObject = event.streams[0];

    // Initialize visualizer with remote stream
    initVisualizer("listenerVisualizerBars", event.streams[0]);

    // Try to autoplay; if blocked, show a button for the user to enable audio
    remoteAudio
      .play()
      .then(() => {
        console.log("Remote audio autoplay succeeded");
        if (enableAudioBtn) enableAudioBtn.classList.add("hidden");
      })
      .catch((err) => {
        console.warn("Autoplay blocked, showing enable button", err);
        if (enableAudioBtn) enableAudioBtn.classList.remove("hidden");
      });
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Listener: Sending ICE candidate");
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
    console.log("Listener: Connection state =", pc.connectionState);
    updateListenerStatus(pc.connectionState);

    if (pc.connectionState === "connected") {
      debugSuccess("Successfully connected to broadcaster!");
    } else if (pc.connectionState === "failed") {
      console.error("Listener: Connection failed!");
    }
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
      console.error("Error adding ICE candidate:", error);
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

// Enable audio button handler (for mobile autoplay policies)
if (enableAudioBtn) {
  enableAudioBtn.addEventListener("click", async () => {
    try {
      await remoteAudio.play();
      enableAudioBtn.classList.add("hidden");
      addDebugEntry("🔊 Audio enabled by user", "success");
    } catch (err) {
      console.error("Failed to play audio after user gesture:", err);
      addDebugEntry("❌ Failed to start audio", "error");
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
    console.error("Visualizer error:", error);
  }
}

// Initialize on load
connectWebSocket();
