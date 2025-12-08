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
  });

  ws.roomCode = roomCode;
  ws.role = "broadcaster";

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

  if (!room.broadcaster) {
    return {
      success: false,
      error: "No broadcaster in this room",
    };
  }

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
    // Delete the room
    rooms.delete(roomCode);
  } else if (role === "listener") {
    // Get listener info before removing
    removedListener = room.listeners.get(ws);
    room.listeners.delete(ws);
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
 * Clean up old rooms
 * @param {number} maxAge - Maximum age in milliseconds
 * @returns {number} Number of rooms cleaned up
 */
function cleanupOldRooms(maxAge = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  let cleanedCount = 0;

  rooms.forEach((room, roomCode) => {
    if (now - room.createdAt > maxAge) {
      rooms.delete(roomCode);
      cleanedCount++;
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
