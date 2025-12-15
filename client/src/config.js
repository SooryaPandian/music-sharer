// WebSocket Server Configuration
// Change this URL to match your WebSocket server location

// For local development (localhost)
// export const WS_SERVER_URL = 'ws://localhost:3000';

// For network access (replace with your local IP)
// export const WS_SERVER_URL = 'ws://10.1.71.45:3000';

// For dev tunnel (default)
// 'wss://music-sharer.onrender.com'
export const WS_SERVER_URL = 'ws://10.1.34.214:3000';
// 'wss://j6wt9thk-3000.inc1.devtunnels.ms/'
// Auto-detect based on environment (alternative approach)
// export const WS_SERVER_URL = import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:3000';

// HTTP Server URL for health checks (derived from WebSocket URL)
export const HTTP_SERVER_URL = WS_SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://');
