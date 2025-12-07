const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const path = require("path");

const app = express();

// Support optional HTTPS/WSS for LAN/mobile testing.
// If `SSL_KEY_PATH` and `SSL_CERT_PATH` environment variables are set
// and point to PEM files, the server will create an HTTPS server
// and a secure WebSocket (WSS) endpoint. Otherwise it falls back to HTTP/WS.
let server;
let usingHttps = false;
if (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
  try {
    const key = fs.readFileSync(process.env.SSL_KEY_PATH);
    const cert = fs.readFileSync(process.env.SSL_CERT_PATH);
    server = https.createServer({ key, cert }, app);
    usingHttps = true;
  } catch (err) {
    console.error(
      "Failed to read SSL key/cert, falling back to HTTP:",
      err.message
    );
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store rooms and their connections
const rooms = new Map();

// Helper function to generate room codes
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received:", data.type);

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
        case "leave-room":
          handleLeaveRoom(ws, data);
          break;
        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    handleDisconnect(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

function handleCreateRoom(ws, data) {
  const roomCode = generateRoomCode();

  // Initialize room
  rooms.set(roomCode, {
    broadcaster: ws,
    listeners: new Set(),
    createdAt: Date.now(),
  });

  ws.roomCode = roomCode;
  ws.role = "broadcaster";

  ws.send(
    JSON.stringify({
      type: "room-created",
      roomCode: roomCode,
    })
  );

  console.log(`Room created: ${roomCode}`);
}

function handleJoinRoom(ws, data) {
  const { roomCode } = data;
  const room = rooms.get(roomCode);

  if (!room) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Room not found",
      })
    );
    return;
  }

  if (!room.broadcaster) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "No broadcaster in this room",
      })
    );
    return;
  }

  // Add listener to room
  room.listeners.add(ws);
  ws.roomCode = roomCode;
  ws.role = "listener";

  // Notify listener they joined successfully
  ws.send(
    JSON.stringify({
      type: "room-joined",
      roomCode: roomCode,
    })
  );

  // Notify broadcaster about new listener
  room.broadcaster.send(
    JSON.stringify({
      type: "new-listener",
      listenerId: getClientId(ws),
    })
  );

  console.log(`Listener joined room: ${roomCode}`);
}

function handleSignaling(ws, data) {
  const { roomCode } = ws;
  const room = rooms.get(roomCode);

  if (!room) return;

  // Forward signaling messages between peers
  if (ws.role === "broadcaster") {
    // Send to specific listener
    const targetListener = Array.from(room.listeners).find(
      (listener) => getClientId(listener) === data.targetId
    );
    if (targetListener && targetListener.readyState === WebSocket.OPEN) {
      targetListener.send(
        JSON.stringify({
          type: data.type,
          ...data,
        })
      );
    }
  } else if (ws.role === "listener") {
    // Send to broadcaster
    if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
      room.broadcaster.send(
        JSON.stringify({
          type: data.type,
          senderId: getClientId(ws),
          ...data,
        })
      );
    }
  }
}

function handleLeaveRoom(ws, data) {
  const { roomCode } = ws;
  const room = rooms.get(roomCode);

  if (!room) return;

  if (ws.role === "broadcaster") {
    // Notify all listeners that broadcaster left
    room.listeners.forEach((listener) => {
      if (listener.readyState === WebSocket.OPEN) {
        listener.send(
          JSON.stringify({
            type: "broadcaster-left",
          })
        );
      }
    });
    // Delete the room
    rooms.delete(roomCode);
    console.log(`Room deleted: ${roomCode}`);
  } else if (ws.role === "listener") {
    room.listeners.delete(ws);
    console.log(`Listener left room: ${roomCode}`);
  }
}

function handleDisconnect(ws) {
  const { roomCode, role } = ws;

  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  if (role === "broadcaster") {
    // Notify all listeners
    room.listeners.forEach((listener) => {
      if (listener.readyState === WebSocket.OPEN) {
        listener.send(
          JSON.stringify({
            type: "broadcaster-disconnected",
          })
        );
      }
    });
    rooms.delete(roomCode);
    console.log(`Broadcaster disconnected, room deleted: ${roomCode}`);
  } else if (role === "listener") {
    room.listeners.delete(ws);
  }
}

function getClientId(ws) {
  if (!ws._clientId) {
    ws._clientId = Math.random().toString(36).substring(2, 15);
  }
  return ws._clientId;
}

// Clean up old rooms (optional, runs every hour)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  rooms.forEach((room, roomCode) => {
    if (now - room.createdAt > maxAge) {
      rooms.delete(roomCode);
      console.log(`Cleaned up old room: ${roomCode}`);
    }
  });
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // Listen on all network interfaces

server.listen(PORT, HOST, () => {
  console.log(`🎵 Music Sharer server running on:`);

  const protocol = usingHttps ? "https" : "http";
  console.log(`   Local:   ${protocol}://localhost:${PORT}`);

  // Get and display network IP addresses
  const os = require("os");
  const networkInterfaces = os.networkInterfaces();

  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`   Network: ${protocol}://${iface.address}:${PORT}`);
      }
    });
  });

  if (usingHttps) {
    console.log("\n🔒 HTTPS/WSS enabled. Browsers will use secure context.");
  } else {
    console.log("\n📱 Access from other devices using the Network URL above!");
    console.log(
      "   Note: Some mobile browsers require HTTPS for certain WebRTC features."
    );
  }
});
