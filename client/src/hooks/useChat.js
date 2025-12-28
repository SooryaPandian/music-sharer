import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';

export function useChat() {
    const { wsRef, roomCode, userName, addMessage } = useAppContext();

    const sendMessage = useCallback((messageText) => {
        if (!messageText || !messageText.trim()) {
            return;
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('[useChat] WebSocket not connected');
            return;
        }

        if (!roomCode) {
            console.error('[useChat] No room code available');
            return;
        }

        const message = {
            type: 'chat-message',
            roomCode: roomCode,
            userName: userName,
            message: messageText.trim(),
        };

        wsRef.current.send(JSON.stringify(message));
    }, [wsRef, roomCode, userName]);

    return {
        sendMessage,
    };
}
