import { createContext, useContext, useState, useRef, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
    // Screen state
    const [currentScreen, setCurrentScreen] = useState('home'); // 'home', 'broadcaster', 'listener'

    // Room state
    const [roomCode, setRoomCode] = useState(null);
    const [role, setRole] = useState(null); // 'broadcaster' or 'listener'

    // User state
    const [userName, setUserName] = useState(() => {
        return localStorage.getItem('musicSharerUserName') || null;
    });

    // Broadcast state
    const [isPaused, setIsPaused] = useState(false);
    const [listenerCount, setListenerCount] = useState(0);
    const [listeners, setListeners] = useState([]); // Array of {id, name, joinedAt}
    const [connectionStatus, setConnectionStatus] = useState('disconnected');

    // Modal state
    const [showNameModal, setShowNameModal] = useState(false);
    const [modalContext, setModalContext] = useState(null); // 'create', 'join', 'edit'
    const [pendingAction, setPendingAction] = useState(null);

    // WebSocket ref
    const wsRef = useRef(null);

    // Stream refs
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Peer connections map
    const peerConnectionsRef = useRef(new Map());

    // Save user name to localStorage
    const saveUserName = useCallback((name) => {
        setUserName(name);
        localStorage.setItem('musicSharerUserName', name);
    }, []);

    // Open name modal with context
    const openNameModal = useCallback((context, onComplete) => {
        setModalContext(context);
        setPendingAction(() => onComplete);
        setShowNameModal(true);
    }, []);

    // Close name modal
    const closeNameModal = useCallback(() => {
        setShowNameModal(false);
        setModalContext(null);
        setPendingAction(null);
    }, []);

    // Reset state
    const resetState = useCallback(() => {
        setRole(null);
        setRoomCode(null);
        setIsPaused(false);
        setListenerCount(0);
        setListeners([]);
        setConnectionStatus('disconnected');
        setCurrentScreen('home');
    }, []);

    const value = {
        // Screen
        currentScreen,
        setCurrentScreen,

        // Room
        roomCode,
        setRoomCode,
        role,
        setRole,

        // User
        userName,
        setUserName: saveUserName,

        // Broadcast
        isPaused,
        setIsPaused,
        listenerCount,
        setListenerCount,
        listeners,
        setListeners,
        connectionStatus,
        setConnectionStatus,

        // Modal
        showNameModal,
        modalContext,
        pendingAction,
        openNameModal,
        closeNameModal,

        // Refs
        wsRef,
        localStreamRef,
        remoteAudioRef,
        peerConnectionsRef,

        // Actions
        resetState,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
}
