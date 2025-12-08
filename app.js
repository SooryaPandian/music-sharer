// Main Application Entry Point
// This file imports and initializes all modules

// Import modules
import { connectWebSocket } from "./modules/websocket.js";
import { loadUserName, showNameModal, saveName, checkUrlForRoom } from "./modules/user.js";
import {
  createRoom,
  joinRoom,
  stopBroadcast,
  leaveRoom,
  togglePauseBroadcast,
  changeAudioSource,
} from "./modules/webrtc.js";
import { copyShareUrl } from "./modules/ui.js";
import {
  createRoomBtn,
  joinRoomBtn,
  stopBroadcastBtn,
  leaveRoomBtn,
  pauseBroadcastBtn,
  changeSourceBtn,
  copyUrlBtn,
  editNameBtn,
  saveNameBtn,
  roomCodeInput,
  nameInput,
  enableAudioBtn,
  remoteAudio,
} from "./modules/dom.js";

// ============================================
// Event Listeners Setup
// ============================================

// Room action buttons
createRoomBtn.addEventListener("click", () => {
  showNameModal("create", handleNameSaved);
});

joinRoomBtn.addEventListener("click", () => {
  showNameModal("join", handleNameSaved);
});

stopBroadcastBtn.addEventListener("click", stopBroadcast);
leaveRoomBtn.addEventListener("click", leaveRoom);
pauseBroadcastBtn.addEventListener("click", togglePauseBroadcast);
changeSourceBtn.addEventListener("click", changeAudioSource);
copyUrlBtn.addEventListener("click", copyShareUrl);

// Name management
editNameBtn.addEventListener("click", () => {
  showNameModal("edit", handleNameSaved);
});
saveNameBtn.addEventListener("click", saveName);

// Input handlers
roomCodeInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

nameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    saveName();
  }
});

// Enable audio button handler (for autoplay policy bypass)
if (enableAudioBtn) {
  enableAudioBtn.addEventListener("click", async () => {
    try {
      await remoteAudio.play();
      enableAudioBtn.classList.add("hidden");
    } catch (err) {
      alert("Unable to start audio playback: " + (err && err.message ? err.message : err));
    }
  });
}

// ============================================
// Helper Functions
// ============================================

/**
 * Handle name saved callback - routes to appropriate action
 * @param {string} context - The context: 'create', 'join', or 'edit'
 */
function handleNameSaved(context) {
  if (context === "create") {
    createRoom();
  } else if (context === "join") {
    joinRoom();
  }
  // 'edit' context doesn't need any action
}

// ============================================
// Application Initialization
// ============================================

function init() {
  // Load saved user name
  loadUserName();

  // Connect to signaling server
  connectWebSocket();

  // Check URL for room code and auto-show join modal
  if (checkUrlForRoom()) {
    showNameModal("join", handleNameSaved);
  }
}

// Initialize application on load
init();
