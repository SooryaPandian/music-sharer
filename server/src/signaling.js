/**
 * Signaling - Handles WebSocket signaling for WebRTC
 */

const WebSocket = require("ws");
const { getClientId } = require("./utils");
const roomManager = require("./roomManager");

/**
 * Handle create room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleCreateRoom(ws, data) {
  const roomCode = roomManager.createRoom(ws);
  console.log(`[SIGNALING] Room created: ${roomCode}`);

  ws.send(
    JSON.stringify({
      type: "room-created",
      roomCode: roomCode,
    })
  );
  console.log(`[SIGNALING] Sent room-created to broadcaster for room ${roomCode}`);
}

/**
 * Handle join room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleJoinRoom(ws, data) {
  const { roomCode, userName } = data;
  console.log(`[SIGNALING] Join room request: ${roomCode} from ${userName}`);
  
  const result = roomManager.joinRoom(ws, roomCode);

  if (!result.success) {
    console.error(`[SIGNALING] Join failed for room ${roomCode}: ${result.error}`);
    ws.send(
      JSON.stringify({
        type: "error",
        message: result.error,
      })
    );
    return;
  }

  console.log(`[SIGNALING] User ${userName} joined room ${roomCode}`);
  
  // Notify listener they joined successfully
  ws.send(
    JSON.stringify({
      type: "room-joined",
      roomCode: roomCode,
    })
  );
  console.log(`[SIGNALING] Sent room-joined to ${userName}`);

  // Notify broadcaster about new listener
  const listenerId = getClientId(ws);
  result.room.broadcaster.send(
    JSON.stringify({
      type: "new-listener",
      listenerId: listenerId,
      userName: userName,
    })
  );
  console.log(`[SIGNALING] Notified broadcaster about new listener ${listenerId} (${userName})`);
}

/**
 * Handle WebRTC signaling (offer/answer/ICE candidate)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleSignaling(ws, data) {
  const { roomCode } = ws;
  const room = roomManager.getRoom(roomCode);

  if (!room) {
    console.error(`[SIGNALING] Room not found for ${data.type}: ${roomCode}`);
    return;
  }

  // Forward signaling messages between peers
  if (ws.role === "broadcaster") {
    console.log(`[SIGNALING] Broadcaster sending ${data.type} to listener ${data.targetId}`);
    
    // Send to specific listener
    const targetListener = Array.from(room.listeners).find(
      (listener) => getClientId(listener) === data.targetId
    );
    if (targetListener && targetListener.readyState === WebSocket.OPEN) {
      targetListener.send(
        JSON.stringify({
          type: data.type,
          ...data,
        })
      );
      console.log(`[SIGNALING] Successfully forwarded ${data.type} to listener ${data.targetId}`);
    } else {
      console.error(`[SIGNALING] Target listener ${data.targetId} not found or not ready`);
    }
  } else if (ws.role === "listener") {
    const senderId = getClientId(ws);
    console.log(`[SIGNALING] Listener ${senderId} sending ${data.type} to broadcaster`);
    
    // Send to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
      room.broadcaster.send(
        JSON.stringify({
          type: data.type,
          senderId: senderId,
          ...data,
        })
      );
      console.log(`[SIGNALING] Successfully forwarded ${data.type} to broadcaster`);
    } else {
      console.error(`[SIGNALING] Broadcaster not found or not ready for room ${roomCode}`);
    }
  }
}

/**
 * Handle leave room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleLeaveRoom(ws, data) {
  const result = roomManager.leaveRoom(ws);

  // Notify all listeners if broadcaster left
  if (ws.role === "broadcaster") {
    result.notifiedListeners.forEach((listener) => {
      if (listener.readyState === WebSocket.OPEN) {
        listener.send(
          JSON.stringify({
            type: "broadcaster-left",
          })
        );
      }
    });
  }
}

/**
 * Handle WebSocket disconnection
 * @param {WebSocket} ws - WebSocket connection
 */
function handleDisconnect(ws) {
  const { role } = ws;
  const result = roomManager.leaveRoom(ws);

  // Notify all listeners if broadcaster disconnected
  if (role === "broadcaster") {
    result.notifiedListeners.forEach((listener) => {
      if (listener.readyState === WebSocket.OPEN) {
        listener.send(
          JSON.stringify({
            type: "broadcaster-disconnected",
          })
        );
      }
    });
  }
}

/**
 * Setup WebSocket message handlers
 * @param {WebSocket} ws - WebSocket connection
 */
function setupMessageHandlers(ws) {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[SIGNALING] Received message type: ${data.type} from ${ws.role || 'unknown'}`);

      switch (data.type) {
        case "create-room":
          handleCreateRoom(ws, data);
          break;
        case "join-room":
          handleJoinRoom(ws, data);
          break;
        case "offer":
        case "answer":
        case "ice-candidate":
          handleSignaling(ws, data);
          break;
        case "leave-room":
          handleLeaveRoom(ws, data);
          break;
        default:
          console.warn(`[SIGNALING] Unknown message type: ${data.type}`);
          break;
      }
    } catch (error) {
      console.error(`[SIGNALING] Error handling message:`, error.message);
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });

  ws.on("error", (error) => {
    // WebSocket error
  });
}

module.exports = {
  setupMessageHandlers,
};
