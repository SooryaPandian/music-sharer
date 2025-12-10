/**
 * Room Manager - Handles room state and operations
 */

const { generateRoomCode } = require("./utils");

// Store rooms and their connections
const rooms = new Map();

/**
 * Create a new room
 * @param {WebSocket} ws - Broadcaster's WebSocket connection
 * @returns {string} Generated room code
 */
function createRoom(ws) {
  const roomCode = generateRoomCode();

  // Initialize room with listeners as Map
  rooms.set(roomCode, {
    broadcaster: ws,
    listeners: new Map(), // Changed from Set to Map
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    abandonedAt: null, // null means room is actively in use
  });

  ws.roomCode = roomCode;
  ws.role = "broadcaster";
  
  console.log(`[ROOM_MANAGER] Room created: ${roomCode}`);

  return roomCode;
}

/**
 * Add a listener to an existing room
 * @param {WebSocket} ws - Listener's WebSocket connection
 * @param {string} roomCode - Room code to join
 * @param {string} userName - Listener's display name
 * @returns {Object} Result object with success status and optional error message
 */
function joinRoom(ws, roomCode, userName) {
  const room = rooms.get(roomCode);

  if (!room) {
    return {
      success: false,
      error: "Room not found",
    };
  }

  // Allow joining even if broadcaster is temporarily disconnected
  // (they may reconnect later within the persistence timeout)
  console.log(`[ROOM_MANAGER] User ${userName} joining room ${roomCode}, broadcaster present: ${!!room.broadcaster}`);

  // Generate listener ID
  const { getClientId } = require("./utils");
  const listenerId = getClientId(ws);

  // Add listener to room with metadata
  room.listeners.set(ws, {
    id: listenerId,
    name: userName || "Anonymous",
    joinedAt: Date.now(),
  });
  
  ws.roomCode = roomCode;
  ws.role = "listener";
  
  // Update room activity
  room.lastActivityAt = Date.now();

  return {
    success: true,
    room,
    listener: {
      id: listenerId,
      name: userName || "Anonymous",
    },
  };
}

/**
 * Remove a user from a room
 * @param {WebSocket} ws - User's WebSocket connection
 * @returns {Object} Result with notified listeners and removed listener info
 */
function leaveRoom(ws) {
  const { roomCode, role } = ws;

  if (!roomCode) return { notifiedListeners: [], removedListener: null };

  const room = rooms.get(roomCode);
  if (!room) return { notifiedListeners: [], removedListener: null };

  const notifiedListeners = [];
  let removedListener = null;

  if (role === "broadcaster") {
    // Collect listeners to notify
    room.listeners.forEach((listenerData, listener) => {
      notifiedListeners.push(listener);
    });
    
    // DON'T delete the room - just clear broadcaster and mark as abandoned
    // Room will persist for ROOM_PERSISTENCE_TIMEOUT duration
    room.broadcaster = null;
    room.abandonedAt = Date.now();
    room.lastActivityAt = Date.now();
    
    console.log(`[ROOM_MANAGER] Broadcaster left room ${roomCode}, room marked as abandoned but will persist`);
  } else if (role === "listener") {
    // Get listener info before removing
    removedListener = room.listeners.get(ws);
    room.listeners.delete(ws);
    room.lastActivityAt = Date.now();
    
    // If all users have left, mark room as abandoned
    if (!room.broadcaster && room.listeners.size === 0) {
      room.abandonedAt = Date.now();
      console.log(`[ROOM_MANAGER] All users left room ${roomCode}, marked as abandoned but will persist`);
    }
  }

  return { notifiedListeners, removedListener, room };
}

/**
 * Get a room by code
 * @param {string} roomCode - Room code
 * @returns {Object|undefined} Room object or undefined
 */
function getRoom(roomCode) {
  return rooms.get(roomCode);
}

/**
 * Clean up abandoned rooms after persistence timeout
 * @param {number} persistenceTimeout - How long to keep abandoned rooms (from config)
 * @returns {number} Number of rooms cleaned up
 */
function cleanupOldRooms(persistenceTimeout) {
  const now = Date.now();
  let cleanedCount = 0;

  rooms.forEach((room, roomCode) => {
    // Delete room if it's been abandoned for longer than persistence timeout
    if (room.abandonedAt && (now - room.abandonedAt > persistenceTimeout)) {
      rooms.delete(roomCode);
      cleanedCount++;
      console.log(`[ROOM_MANAGER] Cleaned up abandoned room ${roomCode}`);
    }
  });

  return cleanedCount;
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  cleanupOldRooms,
};
