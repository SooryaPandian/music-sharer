import { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useChat } from '../hooks/useChat';

export default function ChatBox() {
    const { messages, unreadCount, isChatOpen, toggleChat, userName, currentScreen } = useAppContext();
    const { sendMessage } = useChat();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current && isChatOpen) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isChatOpen]);

    // Focus input when chat opens
    useEffect(() => {
        if (isChatOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isChatOpen]);

    const handleSend = () => {
        if (inputValue.trim()) {
            sendMessage(inputValue);
            setInputValue('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    return (
        <>
            {/* Chat Toggle Button - Mobile Only (hidden on desktop in 3-column view) */}
            {(currentScreen === 'broadcaster' || currentScreen === 'listener') && (
                <button
                    onClick={toggleChat}
                    className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 gradient-primary rounded-full shadow-glow flex items-center justify-center text-white hover:shadow-glow-hover transition-all duration-300"
                    aria-label="Toggle chat"
                >
                    <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                    </svg>
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold animate-pulse-status">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Container */}
            <div
                className={`
                    glass-card rounded-2xl flex flex-col overflow-hidden h-full
                    ${isChatOpen ? 'fixed inset-4 z-40 flex md:relative md:inset-auto' : 'hidden md:flex'}
                `}
            >
                {/* Chat Header */}
                <div className="gradient-primary p-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Chat</h3>
                    <button
                        onClick={toggleChat}
                        className="md:hidden text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
                        aria-label="Close chat"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
                    {messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm text-center px-4">
                            No messages yet. Start the conversation!
                        </div>
                    ) : (
                        messages.map((msg, index) => {
                            const isOwnMessage = msg.senderName === userName;
                            return (
                                <div
                                    key={index}
                                    className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                                >
                                    <div className="flex items-baseline gap-2 mb-1">
                                        {!isOwnMessage && (
                                            <span className="text-xs font-medium gradient-text">
                                                {msg.senderName}
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                            {formatTime(msg.timestamp)}
                                        </span>
                                        {isOwnMessage && (
                                            <span className="text-xs font-medium text-gray-300">
                                                You
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={`
                                            max-w-[80%] px-4 py-2 rounded-2xl break-words
                                            ${isOwnMessage
                                                ? 'gradient-primary text-white rounded-br-sm'
                                                : 'bg-white/10 text-gray-100 rounded-bl-sm'
                                            }
                                        `}
                                    >
                                        {msg.message}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message..."
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                            maxLength={500}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                            className="gradient-primary px-4 py-2 rounded-lg text-white font-medium hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
