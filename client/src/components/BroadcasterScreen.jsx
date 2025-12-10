import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import { generateShareUrl, copyToClipboard } from '../utils/helpers';
import StatusBadge from './StatusBadge';
import AudioVisualizer from './AudioVisualizer';

export default function BroadcasterScreen({ onStop, onPause, onChangeSource }) {
    const { roomCode, isPaused, localStreamRef } = useAppContext();
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
        <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
            {/* Header with Status */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Broadcasting</h2>
                <StatusBadge status={isPaused ? 'paused' : 'broadcasting'} />
            </div>

            {/* Room Code - Compact */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                <p className="text-xs uppercase tracking-widest text-white/60 mb-2">
                    Room Code
                </p>
                <div className="text-3xl font-bold tracking-[0.2em] text-white room-code-text mb-3">
                    {roomCode || '------'}
                </div>

                {/* Share URL - More Compact */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs outline-none"
                    />
                    <button
                        onClick={handleCopyUrl}
                        className="px-3 py-2 border border-white/20 rounded-lg text-xs font-semibold cursor-pointer transition-all bg-white/10 text-white hover:bg-white/15 hover:border-white/30 whitespace-nowrap"
                    >
                        {copied ? '✓' : '📋'}
                    </button>
                </div>
            </div>

            {/* Audio Visualizer - Compact */}
            <div className="mb-4">
                <AudioVisualizer bars={bars} />
            </div>

            {/* Control Buttons - 3 Column Grid */}
            <div className="grid grid-cols-3 gap-2 mt-auto">
                <button
                    onClick={onPause}
                    className="py-2.5 px-3 border-none rounded-lg text-xs font-semibold cursor-pointer transition-all bg-amber-500 text-white shadow-[0_2px_10px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(245,158,11,0.5)] btn-ripple relative overflow-hidden"
                    title={isPaused ? 'Resume broadcast' : 'Pause broadcast'}
                >
                    <span className="relative z-10 flex flex-col items-center gap-1">
                        <span className="text-base">{isPaused ? '▶️' : '⏸️'}</span>
                        <span className="text-[10px] uppercase tracking-wider">{isPaused ? 'Resume' : 'Pause'}</span>
                    </span>
                </button>

                <button
                    onClick={onChangeSource}
                    className="py-2.5 px-3 border border-white/20 rounded-lg text-xs font-semibold cursor-pointer transition-all bg-white/10 text-white hover:bg-white/15 hover:border-white/30 btn-ripple relative overflow-hidden"
                    title="Change audio source"
                >
                    <span className="relative z-10 flex flex-col items-center gap-1">
                        <span className="text-base">🔄</span>
                        <span className="text-[10px] uppercase tracking-wider">Source</span>
                    </span>
                </button>

                <button
                    onClick={onStop}
                    className="py-2.5 px-3 border-none rounded-lg text-xs font-semibold cursor-pointer transition-all bg-red-500 text-white shadow-[0_2px_10px_rgba(239,68,68,0.3)] hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(239,68,68,0.5)] btn-ripple relative overflow-hidden"
                    title="Stop broadcasting"
                >
                    <span className="relative z-10 flex flex-col items-center gap-1">
                        <span className="text-base">⏹️</span>
                        <span className="text-[10px] uppercase tracking-wider">Stop</span>
                    </span>
                </button>
            </div>
        </div>
    );
}
