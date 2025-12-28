import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppContext } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { useWebRTC } from './hooks/useWebRTC';
import { useUserName } from './hooks/useUserName';
import { getRoomFromUrl } from './utils/helpers';
import { waitForServerReady } from './utils/healthCheck';

import Header from './components/Header';
import HomeScreen from './components/HomeScreen';
import BroadcasterScreen from './components/BroadcasterScreen';
import ListenerScreen from './components/ListenerScreen';
import NameModal from './components/NameModal';
import ChatBox from './components/ChatBox';
import Sidebar from './components/Sidebar';
import ServerStatus from './components/ServerStatus';

export default function App() {
  const {
    currentScreen,
    setCurrentScreen,
    setRoomCode,
    role,
    setRole,
    setListenerCount,
    setListeners,
    setConnectionStatus,
    peerConnectionsRef,
    localStreamRef,
    setUserName,
    userName,
    openNameModal,
    closeNameModal,
    pendingAction,
    modalContext,
    addMessage,
  } = useAppContext();

  const { connect, send, registerHandler } = useWebSocket();
  const {
    createRoom,
    joinRoom,
    handleNewListener,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    togglePause,
    changeAudioSource,
    stopBroadcast,
    leaveRoom,
  } = useWebRTC();
  const { checkUrlForRoom } = useUserName();

  const audioRef = useRef(null);
  const roomCodeInputRef = useRef('');

  // Server availability state
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking', 'ready', 'error'
  const [elapsedTime, setElapsedTime] = useState(0);

  // Keep track of current role in a ref for handlers to access
  const roleRef = useRef(role);

  // Update roleRef whenever role changes
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Initialize WebSocket and register handlers
  useEffect(() => {
    // Register WebSocket message handlers
    registerHandler('room-created', (data) => {
      setRoomCode(data.roomCode);
      setCurrentScreen('broadcaster');
    });

    registerHandler('room-joined', (data) => {
      setRoomCode(data.roomCode);
      setCurrentScreen('listener');
      // Update listeners list if provided
      if (data.listeners) {
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
    });

    registerHandler('new-listener', async (data) => {
      // Update listeners list from server
      if (data.listeners) {
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
      await handleNewListener(data.listenerId);
    });

    registerHandler('offer', async (data) => {
      await handleOffer(data, audioRef, (stream) => {
        // Audio ready callback
      });
    });

    registerHandler('answer', async (data) => {
      await handleAnswer(data);
    });

    registerHandler('ice-candidate', async (data) => {
      await handleIceCandidate(data, roleRef.current);
    });

    registerHandler('broadcaster-left', () => {
      setConnectionStatus('disconnected');
    });

    registerHandler('broadcaster-disconnected', () => {
      setConnectionStatus('disconnected');
    });

    registerHandler('listener-left', (data) => {
      // Update listeners list from server
      if (data.listeners) {
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
    });

    registerHandler('chat-message', (data) => {
      addMessage({
        senderId: data.senderId,
        senderName: data.senderName,
        message: data.message,
        timestamp: data.timestamp,
      });
    });

    registerHandler('error', (data) => {
      console.error('[App] Handler: error', data);
      alert(data.message);
      setCurrentScreen('home');
    });
  }, [registerHandler, handleNewListener, handleOffer, handleAnswer, handleIceCandidate, addMessage]);

  // Check server health and initialize WebSocket connection once on mount
  const initializeConnection = useCallback(async () => {
    try {
      setServerStatus('checking');

      // Wait for server to be ready
      await waitForServerReady((elapsed) => {
        setElapsedTime(elapsed);
      });

      setServerStatus('ready');

      // Connect to WebSocket
      connect();

      // Check URL for room code
      const urlRoomCode = checkUrlForRoom();
      if (urlRoomCode) {
        roomCodeInputRef.current = urlRoomCode;
        // Show join modal
        openNameModal('join', (context) => {
          joinRoom(urlRoomCode);
        });
      }
    } catch (error) {
      console.error('[App] Server health check failed:', error);
      setServerStatus('error');
    }
  }, [connect, checkUrlForRoom, openNameModal, joinRoom]);

  useEffect(() => {
    initializeConnection();
  }, []);

  // Handle retry connection
  const handleRetry = useCallback(() => {
    initializeConnection();
  }, [initializeConnection]);

  // Handle create room
  const handleCreateRoom = useCallback(async () => {
    try {
      await createRoom();
    } catch (error) {
      // Error already handled in createRoom
    }
  }, [createRoom]);

  // Handle join room
  const handleJoinRoom = useCallback((code) => {
    joinRoom(code);
  }, [joinRoom]);

  // Handle stop broadcast
  const handleStopBroadcast = useCallback(() => {
    stopBroadcast();
  }, [stopBroadcast]);

  // Handle pause toggle
  const handleTogglePause = useCallback(() => {
    togglePause();
  }, [togglePause]);

  // Handle change source
  const handleChangeSource = useCallback(async () => {
    try {
      await changeAudioSource();
    } catch (error) {
      // Error already handled
    }
  }, [changeAudioSource]);

  // Handle leave room
  const handleLeaveRoom = useCallback(() => {
    leaveRoom(audioRef);
  }, [leaveRoom]);

  // Handle name save
  const handleSaveName = useCallback((name) => {
    setUserName(name);

    // Execute pending action
    if (pendingAction) {
      pendingAction(modalContext);
    }

    closeNameModal();
  }, [setUserName, pendingAction, modalContext, closeNameModal]);

  // Show server status while checking or on error
  if (serverStatus !== 'ready') {
    return <ServerStatus status={serverStatus} onRetry={handleRetry} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      {currentScreen === 'home' ? (
        <main className="flex-1 flex justify-center items-center px-8">
          <HomeScreen
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        </main>
      ) : (
        <main className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr_320px] gap-6 px-8 pb-8 overflow-hidden">
          {/* Left Sidebar - Desktop Only */}
          <div className="hidden md:block overflow-hidden">
            <Sidebar />
          </div>

          {/* Middle Content */}
          <div className="overflow-auto custom-scrollbar">
            {currentScreen === 'broadcaster' && (
              <BroadcasterScreen
                onStop={handleStopBroadcast}
                onPause={handleTogglePause}
                onChangeSource={handleChangeSource}
              />
            )}

            {currentScreen === 'listener' && (
              <ListenerScreen
                onLeave={handleLeaveRoom}
                audioRef={audioRef}
              />
            )}
          </div>

          {/* Right Chat - Desktop, Mobile Toggle */}
          <div className="hidden md:block overflow-hidden">
            <ChatBox />
          </div>

          {/* Mobile Chat Toggle */}
          <div className="md:hidden">
            <ChatBox />
          </div>
        </main>
      )}

      <NameModal onSave={handleSaveName} />
    </div>
  );
}
