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

  const response = {
    type: "room-created",
    roomCode: roomCode,
  };
  ws.send(JSON.stringify(response));
}

/**
 * Get list of listeners with their info
 * @param {Map} listeners - Map of listener WebSockets to their data
 * @returns {Array} Array of listener objects
 */
function getListenersList(listeners) {
  const list = [];
  listeners.forEach((data, ws) => {
    list.push({
      id: data.id,
      name: data.name,
      joinedAt: data.joinedAt,
    });
  });
  return list;
}

/**
 * Handle join room request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleJoinRoom(ws, data) {
  const { roomCode, userName } = data;
  
  const result = roomManager.joinRoom(ws, roomCode, userName);

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
  
  // Get updated listeners list
  const listenersList = getListenersList(result.room.listeners);
  
  // Notify listener they joined successfully with the full listeners list
  const joinedResponse = {
    type: "room-joined",
    roomCode: roomCode,
    listeners: listenersList,
  };
  ws.send(JSON.stringify(joinedResponse));

  // Notify broadcaster about new listener with updated list
  const broadcasterNotification = {
    type: "new-listener",
    listenerId: result.listener.id,
    userName: result.listener.name,
    listeners: listenersList,
  };
  result.room.broadcaster.send(JSON.stringify(broadcasterNotification));

  // Notify all other listeners about the new user
  for (const [listenerWs, listenerData] of result.room.listeners) {
    // Don't notify the user who just joined
    if (listenerWs !== ws && listenerWs.readyState === WebSocket.OPEN) {
      const listenerNotification = {
        type: "new-listener",
        listenerId: result.listener.id,
        userName: result.listener.name,
        listeners: listenersList,
      };
      listenerWs.send(JSON.stringify(listenerNotification));
    }
  }
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
    // Send to specific listener - iterate Map properly
    let targetListener = null;
    for (const [listenerWs, listenerData] of room.listeners) {
      if (listenerData.id === data.targetId) {
        targetListener = listenerWs;
        break;
      }
    }
    
    if (targetListener && targetListener.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: data.type,
        ...data,
      });
      targetListener.send(message);
    } else {
      console.error(`[SIGNALING] Target listener ${data.targetId} not found or not ready`);
      if (targetListener) {
        console.error(`[SIGNALING] Listener state: ${targetListener.readyState}`);
      }
    }
  } else if (ws.role === "listener") {
    const senderId = getClientId(ws);
    
    // Send to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: data.type,
        senderId: senderId,
        ...data,
      });
      room.broadcaster.send(message);
    } else {
      console.error(`[SIGNALING] Broadcaster not found or not ready for room ${roomCode}`);
      if (room.broadcaster) {
        console.error(`[SIGNALING] Broadcaster state: ${room.broadcaster.readyState}`);
      }
    }
  }
}

/**
 * Handle chat message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleChatMessage(ws, data) {
  const { roomCode, message, userName } = data;
  const senderId = getClientId(ws);
  
  const room = roomManager.getRoom(roomCode);
  
  if (!room) {
    console.error(`[SIGNALING] Room not found for chat message: ${roomCode}`);
    return;
  }
  
  const chatMessage = {
    type: "chat-message",
    senderId: senderId,
    senderName: userName,
    message: message,
    timestamp: Date.now(),
  };
  
  // Send to broadcaster
  if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
    room.broadcaster.send(JSON.stringify(chatMessage));
  }
  
  // Send to all listeners
  for (const [listenerWs, listenerData] of room.listeners) {
    if (listenerWs.readyState === WebSocket.OPEN) {
      listenerWs.send(JSON.stringify(chatMessage));
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
  } else if (ws.role === "listener" && result.removedListener && result.room) {
    // Get updated listeners list
    const listenersList = getListenersList(result.room.listeners);
    
    // Notify broadcaster that listener left
    if (result.room.broadcaster && result.room.broadcaster.readyState === WebSocket.OPEN) {
      result.room.broadcaster.send(
        JSON.stringify({
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        })
      );
    }
    
    // Notify all other listeners that someone left
    for (const [listenerWs, listenerData] of result.room.listeners) {
      if (listenerWs.readyState === WebSocket.OPEN) {
        const listenerNotification = {
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        };
        listenerWs.send(JSON.stringify(listenerNotification));
      }
    }
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
  } else if (role === "listener" && result.removedListener && result.room) {
    // Get updated listeners list
    const listenersList = getListenersList(result.room.listeners);
    
    // Notify broadcaster that listener disconnected
    if (result.room.broadcaster && result.room.broadcaster.readyState === WebSocket.OPEN) {
      result.room.broadcaster.send(
        JSON.stringify({
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        })
      );
    }
    
    // Notify all other listeners that someone disconnected
    for (const [listenerWs, listenerData] of result.room.listeners) {
      if (listenerWs.readyState === WebSocket.OPEN) {
        const listenerNotification = {
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        };
        listenerWs.send(JSON.stringify(listenerNotification));
      }
    }
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
        case "chat-message":
          handleChatMessage(ws, data);
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
