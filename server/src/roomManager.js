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

  // Initialize room
  rooms.set(roomCode, {
    broadcaster: ws,
    listeners: new Set(),
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
 * @returns {Object} Result object with success status and optional error message
 */
function joinRoom(ws, roomCode) {
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

  // Add listener to room
  room.listeners.add(ws);
  ws.roomCode = roomCode;
  ws.role = "listener";

  return {
    success: true,
    room,
  };
}

/**
 * Remove a user from a room
 * @param {WebSocket} ws - User's WebSocket connection
 */
function leaveRoom(ws) {
  const { roomCode, role } = ws;

  if (!roomCode) return { notifiedListeners: [] };

  const room = rooms.get(roomCode);
  if (!room) return { notifiedListeners: [] };

  const notifiedListeners = [];

  if (role === "broadcaster") {
    // Collect listeners to notify
    room.listeners.forEach((listener) => {
      notifiedListeners.push(listener);
    });
    // Delete the room
    rooms.delete(roomCode);
  } else if (role === "listener") {
    room.listeners.delete(ws);
  }

  return { notifiedListeners };
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
