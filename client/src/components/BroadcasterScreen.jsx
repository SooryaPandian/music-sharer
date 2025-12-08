import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import { generateShareUrl, copyToClipboard } from '../utils/helpers';
import StatusBadge from './StatusBadge';
import AudioVisualizer from './AudioVisualizer';

export default function BroadcasterScreen({ onStop, onPause, onChangeSource }) {
    const { roomCode, isPaused, listenerCount, listeners, localStreamRef } = useAppContext();
    const [shareUrl, setShareUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [stream, setStream] = useState(null);

    const bars = useAudioVisualizer(stream);

    useEffect(() => {
        if (roomCode) {
            setShareUrl(generateShareUrl(roomCode));
        }
    }, [roomCode]);

    useEffect(() => {
        setStream(localStreamRef.current);
    }, [localStreamRef.current]);

    const handleCopyUrl = async () => {
        const success = await copyToClipboard(shareUrl);
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="glass-card rounded-2xl p-12 shadow-2xl animate-fade-in-up transition-all duration-300 w-full max-w-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-glow">
            <h2 className="text-2xl font-semibold mb-6 text-center">
                Broadcasting Audio
            </h2>

            {/* Room Info */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6 text-center">
                <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">
                    Share this code with listeners
                </p>
                <div className="text-4xl font-bold tracking-[0.2em] text-white my-2 room-code-text">
                    {roomCode || '------'}
                </div>

                {/* Shareable URL Section */}
                <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">
                        Or share this link
                    </p>
                    <div className="flex gap-2 mt-2">
                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none"
                        />
                        <button
                            onClick={handleCopyUrl}
                            className="px-4 py-2 border border-white/20 rounded-lg text-sm font-semibold cursor-pointer transition-all bg-white/10 text-white hover:bg-white/15 hover:border-white/30 whitespace-nowrap"
                        >
                            {copied ? '✓ Copied!' : '📋 Copy'}
                        </button>
                    </div>
                </div>

                {/* Listener Count */}
                <div className="flex items-center justify-center gap-2 mt-4 text-white/70 text-sm">
                    <span>👥</span>
                    <span>{listenerCount}</span>
                    <span>listeners</span>
                </div>

                {/* User List */}
                {listeners && listeners.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs uppercase tracking-widest text-white/70 font-semibold mb-3 text-center">
                            Connected Users
                        </p>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                            {listeners.map((listener) => (
                                <div
                                    key={listener.id}
                                    className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">🎧</span>
                                        <span className="text-sm font-medium text-white">
                                            {listener.name}
                                        </span>
                                    </div>
                                    <span className="text-xs text-white/50">
                                        {new Date(listener.joinedAt).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Status */}
            <div className="text-center">
                <StatusBadge status={isPaused ? 'paused' : 'broadcasting'} />
            </div>

            {/* Audio Visualizer */}
            <AudioVisualizer bars={bars} />

            {/* Controls */}
            <div className="flex flex-col gap-4 mt-6">
                <button
                    onClick={onPause}
                    className="w-full py-4 px-8 border-none rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider bg-amber-500 text-white shadow-[0_4px_15px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(245,158,11,0.6)] btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">
                        {isPaused ? '▶️ Resume' : '⏸️ Pause'}
                    </span>
                </button>

                <button
                    onClick={onChangeSource}
                    className="w-full py-4 px-8 border border-white/20 rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider bg-white/10 text-white hover:bg-white/15 hover:border-white/30 btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">🔄 Change Source</span>
                </button>

                <button
                    onClick={onStop}
                    className="w-full py-4 px-8 border-none rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider bg-red-500 text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(239,68,68,0.6)] btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">⏹️ Stop Sharing</span>
                </button>
            </div>
        </div>
    );
}
