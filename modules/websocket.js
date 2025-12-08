// WebSocket module - Handles signaling server connection

import { setWs, getWs } from "./state.js";
import {
  handleRoomCreated,
  handleRoomJoined,
  handleNewListener,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  handleBroadcasterLeft,
} from "./webrtc.js";
import { showScreen } from "./ui.js";

/**
 * Handle error messages from server
 * @param {Object} data - Error data from server
 */
function handleError(data) {
  alert(data.message);
  showScreen("home");
}

/**
 * Initialize WebSocket connection to signaling server
 */
export function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  const ws = new WebSocket(wsUrl);
  setWs(ws);

  ws.onopen = () => {
    // Connected to signaling server
    console.log("[WebSocket] Connected to signaling server");
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
    console.log("[WebSocket] Connection closed, reconnecting in 3 seconds...");
    setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
  };

  ws.onerror = (error) => {
    console.error("[WebSocket] Error:", error);
  };
}
