const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { setupMessageHandlers } = require("./src/signaling");
const { cleanupOldRooms } = require("./src/roomManager");
const config = require("./src/config");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/styles.css", (req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/help", (req, res) => {
  res.send("Help page");
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
  console.log(`[SERVER] Music Sharer server running on http://${config.HOST}:${config.PORT}`);
  console.log(`[SERVER] Room persistence timeout: ${config.ROOM_PERSISTENCE_TIMEOUT / 1000 / 60} minutes`);
});
 