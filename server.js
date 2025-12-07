const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { setupMessageHandlers } = require("./src/signaling");
const { cleanupOldRooms } = require("./src/roomManager");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// WebSocket connection handler
wss.on("connection", (ws) => {
  setupMessageHandlers(ws);
});

// Clean up old rooms (runs every hour)
setInterval(() => {
  const cleanedCount = cleanupOldRooms(24 * 60 * 60 * 1000); // 24 hours
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old room(s)`);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Listen on all network interfaces

server.listen(PORT, HOST, () => {
  console.log(`Music Sharer server running on http://${HOST}:${PORT}`);
});
 