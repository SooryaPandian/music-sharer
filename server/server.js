const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const { setupMessageHandlers } = require("./src/signaling");
const { cleanupOldRooms } = require("./src/roomManager");
const config = require("./src/config");

const app = express();

// Enable CORS for all origins
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    message: "Server is running",
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  console.log(`\n[SERVER] New WebSocket connection from ${clientIp}`);
  console.log(`[SERVER] User-Agent: ${userAgent}`);
  
  ws.on('close', () => {
    console.log(`[SERVER] WebSocket closed for ${clientIp}`);
  });
  
  ws.on('error', (error) => {
    console.error(`[SERVER] WebSocket error for ${clientIp}:`, error.message);
  });
  
  setupMessageHandlers(ws);
});

// Clean up abandoned rooms (runs periodically)
setInterval(() => {
  const cleanedCount = cleanupOldRooms(config.ROOM_PERSISTENCE_TIMEOUT);
  if (cleanedCount > 0) {
    console.log(`[SERVER] Cleaned up ${cleanedCount} abandoned room(s)`);
  }
}, config.CLEANUP_INTERVAL);

server.listen(config.PORT, config.HOST, () => {
  console.log(`[SERVER] VibeP2P server running on http://${config.HOST}:${config.PORT}`);
  console.log(`[SERVER] Room persistence timeout: ${config.ROOM_PERSISTENCE_TIMEOUT / 1000 / 60} minutes`);
});
 