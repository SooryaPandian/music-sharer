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
  console.log(`[SIGNALING] handleCreateRoom called`);
  const roomCode = roomManager.createRoom(ws);
  console.log(`[SIGNALING] Room created: ${roomCode}`);
  console.log(`[SIGNALING] Broadcaster WebSocket state: ${ws.readyState}`);

  const response = {
    type: "room-created",
    roomCode: roomCode,
  };
  console.log(`[SIGNALING] Sending response:`, JSON.stringify(response));
  ws.send(JSON.stringify(response));
  console.log(`[SIGNALING] ✓ Sent room-created to broadcaster for room ${roomCode}`);
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
  console.log(`[SIGNALING] ====== JOIN ROOM REQUEST ======`);
  console.log(`[SIGNALING] Room code: ${roomCode}`);
  console.log(`[SIGNALING] User name: ${userName}`);
  console.log(`[SIGNALING] Listener WebSocket state: ${ws.readyState}`);
  
  const result = roomManager.joinRoom(ws, roomCode, userName);

  if (!result.success) {
    console.error(`[SIGNALING] ✗ Join failed for room ${roomCode}: ${result.error}`);
    ws.send(
      JSON.stringify({
        type: "error",
        message: result.error,
      })
    );
    return;
  }

  console.log(`[SIGNALING] ✓ User ${userName} joined room ${roomCode}`);
  console.log(`[SIGNALING] Listener ID: ${result.listener.id}`);
  console.log(`[SIGNALING] Current listeners in room: ${result.room.listeners.size}`);
  
  // Get updated listeners list
  const listenersList = getListenersList(result.room.listeners);
  
  // Notify listener they joined successfully with the full listeners list
  const joinedResponse = {
    type: "room-joined",
    roomCode: roomCode,
    listeners: listenersList,
  };
  console.log(`[SIGNALING] Sending to listener:`, JSON.stringify(joinedResponse));
  ws.send(JSON.stringify(joinedResponse));
  console.log(`[SIGNALING] ✓ Sent room-joined to ${userName}`);

  // Notify broadcaster about new listener with updated list
  const broadcasterNotification = {
    type: "new-listener",
    listenerId: result.listener.id,
    userName: result.listener.name,
    listeners: listenersList,
  };
  console.log(`[SIGNALING] Sending to broadcaster:`, JSON.stringify(broadcasterNotification));
  console.log(`[SIGNALING] Broadcaster WebSocket state: ${result.room.broadcaster.readyState}`);
  result.room.broadcaster.send(JSON.stringify(broadcasterNotification));
  console.log(`[SIGNALING] ✓ Notified broadcaster about new listener ${result.listener.id} (${userName})`);

  // Notify all other listeners about the new user
  console.log(`[SIGNALING] Notifying ${result.room.listeners.size - 1} other listeners`);
  for (const [listenerWs, listenerData] of result.room.listeners) {
    // Don't notify the user who just joined
    if (listenerWs !== ws && listenerWs.readyState === WebSocket.OPEN) {
      const listenerNotification = {
        type: "new-listener",
        listenerId: result.listener.id,
        userName: result.listener.name,
        listeners: listenersList,
      };
      console.log(`[SIGNALING] Notifying listener ${listenerData.id} about new user`);
      listenerWs.send(JSON.stringify(listenerNotification));
    }
  }
  console.log(`[SIGNALING] ✓ All participants notified`);
  console.log(`[SIGNALING] ====== JOIN COMPLETE ======`);
}

/**
 * Handle WebRTC signaling (offer/answer/ICE candidate)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleSignaling(ws, data) {
  const { roomCode } = ws;
  console.log(`[SIGNALING] ====== SIGNALING MESSAGE ======`);
  console.log(`[SIGNALING] Type: ${data.type}`);
  console.log(`[SIGNALING] From role: ${ws.role}`);
  console.log(`[SIGNALING] Room code: ${roomCode}`);
  
  const room = roomManager.getRoom(roomCode);

  if (!room) {
    console.error(`[SIGNALING] ✗ Room not found for ${data.type}: ${roomCode}`);
    return;
  }

  console.log(`[SIGNALING] Room found with ${room.listeners.size} listeners`);

  // Forward signaling messages between peers
  if (ws.role === "broadcaster") {
    console.log(`[SIGNALING] Broadcaster sending ${data.type} to listener ${data.targetId}`);
    
    // Send to specific listener - iterate Map properly
    let targetListener = null;
    console.log(`[SIGNALING] Searching for listener with ID: ${data.targetId}`);
    for (const [listenerWs, listenerData] of room.listeners) {
      console.log(`[SIGNALING] Checking listener: ${listenerData.id}`);
      if (listenerData.id === data.targetId) {
        targetListener = listenerWs;
        console.log(`[SIGNALING] ✓ Found target listener`);
        break;
      }
    }
    
    if (targetListener && targetListener.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: data.type,
        ...data,
      });
      console.log(`[SIGNALING] Forwarding to listener:`, message.substring(0, 100) + '...');
      targetListener.send(message);
      console.log(`[SIGNALING] ✓ Successfully forwarded ${data.type} to listener ${data.targetId}`);
    } else {
      console.error(`[SIGNALING] ✗ Target listener ${data.targetId} not found or not ready`);
      if (targetListener) {
        console.error(`[SIGNALING] Listener state: ${targetListener.readyState}`);
      }
    }
  } else if (ws.role === "listener") {
    const senderId = getClientId(ws);
    console.log(`[SIGNALING] Listener ${senderId} sending ${data.type} to broadcaster`);
    
    // Send to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: data.type,
        senderId: senderId,
        ...data,
      });
      console.log(`[SIGNALING] Forwarding to broadcaster:`, message.substring(0, 100) + '...');
      room.broadcaster.send(message);
      console.log(`[SIGNALING] ✓ Successfully forwarded ${data.type} to broadcaster`);
    } else {
      console.error(`[SIGNALING] ✗ Broadcaster not found or not ready for room ${roomCode}`);
      if (room.broadcaster) {
        console.error(`[SIGNALING] Broadcaster state: ${room.broadcaster.readyState}`);
      }
    }
  }
  console.log(`[SIGNALING] ====== END SIGNALING ======`);
}

/**
 * Handle chat message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Message data
 */
function handleChatMessage(ws, data) {
  const { roomCode, message, userName } = data;
  const senderId = getClientId(ws);
  
  console.log(`[SIGNALING] Chat message from ${userName} (${senderId}) in room ${roomCode}`);
  
  const room = roomManager.getRoom(roomCode);
  
  if (!room) {
    console.error(`[SIGNALING] ✗ Room not found for chat message: ${roomCode}`);
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
    console.log(`[SIGNALING] Sent chat message to broadcaster`);
  }
  
  // Send to all listeners
  for (const [listenerWs, listenerData] of room.listeners) {
    if (listenerWs.readyState === WebSocket.OPEN) {
      listenerWs.send(JSON.stringify(chatMessage));
      console.log(`[SIGNALING] Sent chat message to listener ${listenerData.id}`);
    }
  }
  
  console.log(`[SIGNALING] ✓ Chat message broadcast complete`);
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
      console.log(`[SIGNALING] Notified broadcaster that listener ${result.removedListener.id} left`);
    }
    
    // Notify all other listeners that someone left
    console.log(`[SIGNALING] Notifying ${result.room.listeners.size} other listeners about departure`);
    for (const [listenerWs, listenerData] of result.room.listeners) {
      if (listenerWs.readyState === WebSocket.OPEN) {
        const listenerNotification = {
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        };
        console.log(`[SIGNALING] Notifying listener ${listenerData.id} about user departure`);
        listenerWs.send(JSON.stringify(listenerNotification));
      }
    }
    console.log(`[SIGNALING] ✓ All participants notified about departure`);
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
      console.log(`[SIGNALING] Notified broadcaster that listener ${result.removedListener.id} disconnected`);
    }
    
    // Notify all other listeners that someone disconnected
    console.log(`[SIGNALING] Notifying ${result.room.listeners.size} other listeners about disconnect`);
    for (const [listenerWs, listenerData] of result.room.listeners) {
      if (listenerWs.readyState === WebSocket.OPEN) {
        const listenerNotification = {
          type: "listener-left",
          listenerId: result.removedListener.id,
          userName: result.removedListener.name,
          listeners: listenersList,
        };
        console.log(`[SIGNALING] Notifying listener ${listenerData.id} about user disconnect`);
        listenerWs.send(JSON.stringify(listenerNotification));
      }
    }
    console.log(`[SIGNALING] ✓ All participants notified about disconnect`);
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
