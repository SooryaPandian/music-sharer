// UI management module

import {
  homeScreen,
  broadcasterScreen,
  listenerScreen,
  listenerStatus,
  listenerStatusText,
  listenerCount,
  broadcasterRoomCode,
  listenerRoomCode,
  shareUrlInput,
  copyUrlBtn,
  pauseBroadcastBtn,
  broadcastStatus,
  broadcastStatusText,
} from "./dom.js";
import { getPeerConnections } from "./state.js";

/**
 * Show a specific screen and hide others
 * @param {string} screen - Screen to show: 'home', 'broadcaster', or 'listener'
 */
export function showScreen(screen) {
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

/**
 * Update listener connection status display
 * @param {string} state - Connection state
 */
export function updateListenerStatus(state) {
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

/**
 * Update listener count display
 */
export function updateListenerCount() {
  listenerCount.textContent = getPeerConnections().size;
}

/**
 * Update broadcaster room code display
 * @param {string} code - Room code
 */
export function setBroadcasterRoomCode(code) {
  broadcasterRoomCode.textContent = code;
}

/**
 * Update listener room code display
 * @param {string} code - Room code
 */
export function setListenerRoomCode(code) {
  listenerRoomCode.textContent = code;
}

/**
 * Generate shareable URL for a room
 * @param {string} roomCode - Room code
 * @returns {string} - Shareable URL
 */
export function generateShareUrl(roomCode) {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?room=${roomCode}`;
}

/**
 * Set the share URL input value
 * @param {string} url - URL to display
 */
export function setShareUrl(url) {
  shareUrlInput.value = url;
}

/**
 * Copy share URL to clipboard
 */
export function copyShareUrl() {
  shareUrlInput.select();
  navigator.clipboard.writeText(shareUrlInput.value).then(() => {
    const originalText = copyUrlBtn.innerHTML;
    copyUrlBtn.innerHTML = "✓ Copied!";
    setTimeout(() => {
      copyUrlBtn.innerHTML = originalText;
    }, 2000);
  });
}

/**
 * Update broadcast control UI for pause/resume state
 * @param {boolean} isPaused - Whether broadcast is paused
 */
export function updateBroadcastPauseUI(isPaused) {
  if (isPaused) {
    pauseBroadcastBtn.innerHTML = "<span>▶️ Resume</span>";
    broadcastStatus.className = "status status-paused";
    broadcastStatusText.textContent = "Paused";
  } else {
    pauseBroadcastBtn.innerHTML = "<span>⏸️ Pause</span>";
    broadcastStatus.className = "status status-broadcasting";
    broadcastStatusText.textContent = "Broadcasting";
  }
}
