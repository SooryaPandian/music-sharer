import { useAppContext } from '../context/AppContext';

export default function Sidebar() {
    const { listeners, listenerCount, role, userName, openNameModal } = useAppContext();

    const handleEditName = () => {
        openNameModal('edit', () => {
            // Name updated
        });
    };

    return (
        <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
            {/* App Logo & Name */}
            <div className="text-center mb-4 pb-4 border-b border-white/10">
                <div className="text-4xl mb-3 animate-pulse-logo">🎵</div>
                <h1 className="text-2xl font-bold gradient-text">Music Sharer</h1>
                <p className="text-sm text-white/60 mt-2">
                    Share your music in real-time
                </p>
            </div>

            {/* User Info with Edit Button */}
            {userName && (
                <div className="mb-4 pb-4 border-b border-white/10">
                    <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">👤</span>
                            <span className="text-sm font-medium text-white">{userName}</span>
                        </div>
                        <button
                            onClick={handleEditName}
                            className="text-xs text-white/60 hover:text-white transition-colors"
                            aria-label="Edit name"
                            title="Edit name"
                        >
                            ✏️
                        </button>
                    </div>
                </div>
            )}

            {/* App Description */}
            <div className="mb-4 pb-4 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-3">
                    How It Works
                </h3>
                <ul className="space-y-2 text-sm text-white/70">
                    <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Share your desktop audio</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Listen together in real-time</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Chat with your friends</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Crystal clear audio quality</span>
                    </li>
                </ul>
            </div>

            {/* Room Members */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">
                        Room Members
                    </h3>
                    <span className="flex items-center gap-1 text-sm text-white/60">
                        <span>👥</span>
                        <span>{listenerCount + (role === 'broadcaster' ? 1 : 0)}</span>
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {/* Show broadcaster if user is listener */}
                    {role === 'listener' && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-gradient-primary rounded-lg">
                            <span className="text-lg">🎙️</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white">
                                    Broadcaster
                                </div>
                                <div className="text-xs text-white/70">
                                    Host
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Show current user if broadcaster */}
                    {role === 'broadcaster' && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-gradient-primary rounded-lg">
                            <span className="text-lg">🎙️</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white">
                                    You (Host)
                                </div>
                                <div className="text-xs text-white/70">
                                    Broadcasting
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Show listeners */}
                    {listeners && listeners.length > 0 ? (
                        listeners.map((listener) => (
                            <div
                                key={listener.id}
                                className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <span className="text-lg">🎧</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate">
                                        {listener.name}
                                    </div>
                                    <div className="text-xs text-white/50">
                                        {new Date(listener.joinedAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        role === 'broadcaster' && (
                            <div className="text-sm text-white/40 text-center py-4">
                                No listeners yet
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
