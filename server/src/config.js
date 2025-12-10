/**
 * Server Configuration
 * Centralized configuration for the music sharer server
 */

module.exports = {
  // Room persistence settings
  ROOM_PERSISTENCE_TIMEOUT: 60 * 60 * 1000, // 1 hour in milliseconds (editable)
  
  // Room cleanup settings
  ROOM_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours - clean up very old rooms
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour - how often to run cleanup
  
  // Server settings
  PORT: process.env.PORT || 3000,
  HOST: "0.0.0.0",
};
