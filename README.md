# VibeP2P - Real-Time Audio Sharing Platform

VibeP2P is a peer-to-peer audio sharing application that enables real-time audio broadcasting and listening over the internet. Built with WebRTC technology, it allows users to share audio from their browser tabs (YouTube, Spotify, SoundCloud, etc.) with others in private rooms.

## 🌟 Features

### Core Functionality
- **Real-Time Audio Streaming**: Share audio from any browser tab with extremely low latency using WebRTC
- **Peer-to-Peer Architecture**: Direct audio transmission between broadcaster and listeners for optimal quality
- **Room-Based System**: Create or join private rooms using unique room codes
- **Multi-Listener Support**: Multiple users can listen to the same broadcaster simultaneously
- **Broadcaster Controls**: Pause/resume broadcasting and change audio source on the fly

### Communication
- **Real-Time Chat**: Built-in chat system for communication between broadcaster and listeners
- **User Presence**: See who's in the room with live listener count
- **Connection Status**: Visual indicators for connection health and audio playback status

### Technical Features
- **STUN Server Integration**: Utilizes Google's public STUN servers for NAT traversal, enabling connections across different network configurations
- **Automatic Reconnection**: Robust WebSocket connection with automatic retry on failure
- **Room Persistence**: Rooms remain active for 1 hour even if the broadcaster temporarily disconnects
- **Server Health Check**: Client-side health monitoring with retry mechanism
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🔧 Technology Stack

### Server (Node.js)
- **Express**: HTTP server and API endpoints
- **WebSocket (ws)**: Real-time signaling for WebRTC connection establishment
- **CORS**: Cross-origin resource sharing for flexible deployment

### Client (React)
- **React 19**: Modern React with hooks for UI
- **Vite**: Fast build tool and development server
- **TailwindCSS**: Utility-first CSS framework for styling
- **WebRTC API**: Browser-native peer-to-peer audio streaming

## 📡 STUN Servers Explained

### What are STUN Servers?
STUN (Session Traversal Utilities for NAT) servers help establish peer-to-peer connections between devices that are behind NAT (Network Address Translation) or firewalls. Most home and corporate networks use NAT, which makes direct peer-to-peer connections challenging.

### How VibeP2P Uses STUN
VibeP2P uses Google's public STUN servers (`stun:stun.l.google.com:19302`) to:

1. **Discover Public IP**: Each peer discovers their public IP address and port
2. **NAT Traversal**: Enables direct connections even when both peers are behind different NATs
3. **ICE Candidate Exchange**: Facilitates the exchange of network information between broadcaster and listeners

### Configuration
STUN servers are configured in the WebRTC peer connection setup. The default configuration uses Google's public STUN servers, which are free and reliable. For production deployments, you may want to consider:
- Using your own STUN server
- Adding TURN servers for more restrictive networks
- Implementing fallback mechanisms

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- A modern web browser (Chrome, Edge, or Firefox recommended for tab audio capture)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd music-sharer
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

### Running the Application

#### Development Mode

1. **Start the server**
   ```bash
   cd server
   npm start
   ```
   The server will start on `http://localhost:3000`

2. **Start the client** (in a new terminal)
   ```bash
   cd client
   npm run dev
   ```
   The client will start on `http://localhost:5173`

3. **Access the application**
   - Open your browser and navigate to `http://localhost:5173`
   - Create a room or join an existing one

#### Production Build

1. **Build the client**
   ```bash
   cd client
   npm run build
   ```

2. **Serve the built files** using your preferred web server (nginx, Apache, etc.)

## 📖 How to Use

### As a Broadcaster

1. **Set Your Name**: Enter your name when prompted
2. **Create Room**: Click "Create Room" on the home screen
3. **Share Audio**: 
   - Click "Start Sharing" or "Change Source"
   - Select the browser tab with the audio you want to share
   - Make sure to check "Share audio" in the browser's screen sharing dialog
4. **Share Room Code**: Give the room code to your listeners
5. **Controls**:
   - Pause/Resume: Temporarily pause audio transmission
   - Change Source: Switch to a different audio source
   - Stop: End the broadcast and return to home

### As a Listener

1. **Set Your Name**: Enter your name when prompted
2. **Join Room**: 
   - Enter the room code provided by the broadcaster
   - Click "Join Room"
3. **Listen**: 
   - Click "Enable Audio" if needed (browser autoplay policy)
   - Enjoy the audio stream
4. **Chat**: Use the chat box to communicate with others
5. **Leave**: Click "Leave Room" when done

### Using Chat

- Chat is available for both broadcasters and listeners
- Messages are real-time and visible to everyone in the room
- Your name appears next to your messages

## 🗂️ Project Structure

```
music-sharer/
├── server/                 # Node.js WebSocket signaling server
│   ├── server.js          # Main server file
│   ├── src/
│   │   ├── config.js      # Server configuration
│   │   ├── signaling.js   # WebRTC signaling handlers
│   │   ├── roomManager.js # Room management logic
│   │   └── utils.js       # Utility functions
│   └── package.json
│
├── client/                 # React web application
│   ├── src/
│   │   ├── App.jsx        # Main application component
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── context/       # React context providers
│   │   └── utils/         # Utility functions
│   ├── index.html
│   └── package.json
│
└── README.md
```

## ⚙️ Configuration

### Server Configuration (`server/src/config.js`)

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `ROOM_PERSISTENCE_TIMEOUT`: How long rooms persist after broadcaster disconnects (default: 1 hour)
- `ROOM_MAX_AGE`: Maximum age of a room before cleanup (default: 24 hours)
- `CLEANUP_INTERVAL`: How often to clean up old rooms (default: 1 hour)

### Client Configuration

Edit the WebSocket server URL in the client code if deploying to a different server.

## 🔒 Security Considerations

- Room codes are randomly generated and act as access tokens
- WebRTC connections are peer-to-peer and encrypted
- No audio data passes through the server (only signaling)
- CORS is enabled for all origins (configure appropriately for production)

## 🐛 Troubleshooting

### No Audio on Broadcaster's Side
- Ensure you selected "Share audio" in the screen sharing dialog
- Check that the audio is playing in the source tab
- Try a different browser (Chrome/Edge work best)

### Listeners Can't Hear Audio
- Click "Enable Audio" button if it appears
- Check your browser's autoplay settings
- Verify the broadcaster is actually sharing audio
- Check your device's volume and speaker settings

### Connection Issues
- Ensure both server and client are running
- Check firewall settings
- Verify network connectivity
- Try refreshing the page
- For restrictive networks, consider adding TURN servers

### Room Not Found
- Verify the room code is correct
- Ensure the broadcaster created the room first
- Check that the room hasn't expired (1-hour timeout)

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🙏 Acknowledgments

- Google STUN servers for enabling peer-to-peer connections
- WebRTC community for excellent documentation and resources
