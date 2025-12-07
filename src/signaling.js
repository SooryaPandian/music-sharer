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

  ws.send(
    JSON.stringify({
      type: "room-created",
      roomCode: roomCode,
    })
  );
}

/**
 * Handle join room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleJoinRoom(ws, data) {
  const { roomCode, userName } = data;
  const result = roomManager.joinRoom(ws, roomCode);

  if (!result.success) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: result.error,
      })
    );
    return;
  }

  // Notify listener they joined successfully
  ws.send(
    JSON.stringify({
      type: "room-joined",
      roomCode: roomCode,
    })
  );

  // Notify broadcaster about new listener
  result.room.broadcaster.send(
    JSON.stringify({
      type: "new-listener",
      listenerId: getClientId(ws),
      userName: userName,
    })
  );
}

/**
 * Handle WebRTC signaling (offer/answer/ICE candidate)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleSignaling(ws, data) {
  const { roomCode } = ws;
  const room = roomManager.getRoom(roomCode);

  if (!room) return;

  // Forward signaling messages between peers
  if (ws.role === "broadcaster") {
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
    }
  } else if (ws.role === "listener") {
    // Send to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
      room.broadcaster.send(
        JSON.stringify({
          type: data.type,
          senderId: getClientId(ws),
          ...data,
        })
      );
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
          break;
      }
    } catch (error) {
      // Error handling message
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
