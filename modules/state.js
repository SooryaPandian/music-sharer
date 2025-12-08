// Application state management

// Reactive state object
const state = {
  ws: null,
  localStream: null,
  peerConnections: new Map(), // Map of listener ID to RTCPeerConnection
  role: null, // 'broadcaster' or 'listener'
  roomCode: null,
  userName: null,
  isPaused: false,
};

// State getters and setters for controlled access
export const getState = () => state;

export const setWs = (ws) => { state.ws = ws; };
export const getWs = () => state.ws;

export const setLocalStream = (stream) => { state.localStream = stream; };
export const getLocalStream = () => state.localStream;

export const getPeerConnections = () => state.peerConnections;

export const setRole = (role) => { state.role = role; };
export const getRole = () => state.role;

export const setRoomCode = (code) => { state.roomCode = code; };
export const getRoomCode = () => state.roomCode;

export const setUserName = (name) => { state.userName = name; };
export const getUserName = () => state.userName;

export const setIsPaused = (paused) => { state.isPaused = paused; };
export const getIsPaused = () => state.isPaused;

// Reset state to initial values
export const resetState = () => {
  state.role = null;
  state.roomCode = null;
  state.isPaused = false;
};
