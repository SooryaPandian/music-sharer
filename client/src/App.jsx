import { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from './context/AppContext';
import { useWebSocket } from './hooks/useWebSocket';
import { useWebRTC } from './hooks/useWebRTC';
import { useUserName } from './hooks/useUserName';
import { getRoomFromUrl } from './utils/helpers';

import Header from './components/Header';
import HomeScreen from './components/HomeScreen';
import BroadcasterScreen from './components/BroadcasterScreen';
import ListenerScreen from './components/ListenerScreen';
import NameModal from './components/NameModal';

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

  // Initialize WebSocket and register handlers
  useEffect(() => {
    console.log('[App] Initializing WebSocket handlers...');

    // Register WebSocket message handlers
    registerHandler('room-created', (data) => {
      console.log('[App] Handler: room-created', data);
      setRoomCode(data.roomCode);
      setCurrentScreen('broadcaster');
    });

    registerHandler('room-joined', (data) => {
      console.log('[App] Handler: room-joined', data);
      setRoomCode(data.roomCode);
      setCurrentScreen('listener');
      // Update listeners list if provided
      if (data.listeners) {
        console.log('[App] Setting initial listeners list:', data.listeners);
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
    });

    registerHandler('new-listener', async (data) => {
      console.log('[App] Handler: new-listener', data);
      // Update listeners list from server
      if (data.listeners) {
        console.log('[App] Updating listeners list:', data.listeners);
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
      await handleNewListener(data.listenerId);
    });

    registerHandler('offer', async (data) => {
      console.log('[App] Handler: offer', data);
      await handleOffer(data, audioRef, (stream) => {
        // Audio ready callback
        console.log('[App] Audio stream ready');
      });
    });

    registerHandler('answer', async (data) => {
      console.log('[App] Handler: answer', data);
      await handleAnswer(data);
    });

    registerHandler('ice-candidate', async (data) => {
      console.log('[App] Handler: ice-candidate', data);
      await handleIceCandidate(data, role);
    });

    registerHandler('broadcaster-left', () => {
      console.log('[App] Handler: broadcaster-left');
      setConnectionStatus('disconnected');
    });

    registerHandler('broadcaster-disconnected', () => {
      console.log('[App] Handler: broadcaster-disconnected');
      setConnectionStatus('disconnected');
    });

    registerHandler('listener-left', (data) => {
      console.log('[App] Handler: listener-left', data);
      // Update listeners list from server
      if (data.listeners) {
        console.log('[App] Updating listeners list:', data.listeners);
        setListeners(data.listeners);
        setListenerCount(data.listeners.length);
      }
    });

    registerHandler('error', (data) => {
      console.error('[App] Handler: error', data);
      alert(data.message);
      setCurrentScreen('home');
    });

    console.log('[App] Connecting to WebSocket...');
    // Connect to signaling server
    connect();

    // Check URL for room code
    const urlRoomCode = checkUrlForRoom();
    if (urlRoomCode) {
      console.log('[App] Room code found in URL:', urlRoomCode);
      roomCodeInputRef.current = urlRoomCode;
      // Show join modal
      openNameModal('join', (context) => {
        joinRoom(urlRoomCode);
      });
    }
  }, []);

  // Update ICE candidate handler when role changes
  useEffect(() => {
    registerHandler('ice-candidate', async (data) => {
      await handleIceCandidate(data, role);
    });
  }, [role, registerHandler, handleIceCandidate]);

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

  return (
    <div className="max-w-5xl mx-auto px-8 relative z-10">
      <Header />

      <main className="flex justify-center items-start min-h-[60vh]">
        {currentScreen === 'home' && (
          <HomeScreen
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        )}

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
      </main>

      <NameModal onSave={handleSaveName} />
    </div>
  );
}
