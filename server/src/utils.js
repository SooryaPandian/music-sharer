/**
 * Utility functions for the VibeP2P server
 */

/**
 * Generate a random 6-character room code
 * @returns {string} Room code in uppercase
 */
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Get or create a unique client ID for a WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @returns {string} Unique client ID
 */
function getClientId(ws) {
  if (!ws._clientId) {
    ws._clientId = Math.random().toString(36).substring(2, 15);
  }
  return ws._clientId;
}

module.exports = {
  generateRoomCode,
  getClientId,
};
