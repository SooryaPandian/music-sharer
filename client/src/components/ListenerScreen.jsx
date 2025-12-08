import { useRef, useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import StatusBadge from './StatusBadge';
import AudioVisualizer from './AudioVisualizer';

export default function ListenerScreen({ onLeave, audioRef }) {
    const { roomCode, connectionStatus } = useAppContext();
    const [stream, setStream] = useState(null);
    const [showEnableAudio, setShowEnableAudio] = useState(false);

    const bars = useAudioVisualizer(stream);

    // Update stream when audio element gets it
    useEffect(() => {
        if (audioRef?.current?.srcObject) {
            setStream(audioRef.current.srcObject);
        }
    }, [audioRef?.current?.srcObject]);

    const handleEnableAudio = async () => {
        if (audioRef?.current) {
            try {
                await audioRef.current.play();
                setShowEnableAudio(false);
            } catch (err) {
                alert("Unable to start audio playback: " + (err?.message || err));
            }
        }
    };

    // Set up audio ready handler
    const handleAudioReady = (newStream) => {
        setStream(newStream);
        if (audioRef?.current) {
            audioRef.current.play()
                .then(() => setShowEnableAudio(false))
                .catch(() => setShowEnableAudio(true));
        }
    };

    // Expose handler for parent
    useEffect(() => {
        if (audioRef?.current) {
            const audio = audioRef.current;

            const handleLoadedMetadata = () => {
                if (audio.srcObject) {
                    setStream(audio.srcObject);
                }
            };

            const handlePlay = () => setShowEnableAudio(false);
            const handlePause = () => setShowEnableAudio(true);

            audio.addEventListener('loadedmetadata', handleLoadedMetadata);
            audio.addEventListener('play', handlePlay);

            return () => {
                audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audio.removeEventListener('play', handlePlay);
            };
        }
    }, [audioRef]);

    return (
        <div className="glass-card rounded-2xl p-12 shadow-2xl animate-fade-in-up transition-all duration-300 w-full max-w-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-glow">
            <h2 className="text-2xl font-semibold mb-6 text-center">
                Listening
            </h2>

            {/* Room Info */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6 text-center">
                <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">
                    Room Code
                </p>
                <div className="text-4xl font-bold tracking-[0.2em] text-white my-2 room-code-text">
                    {roomCode || '------'}
                </div>
            </div>

            {/* Status */}
            <div className="text-center">
                <StatusBadge status={connectionStatus} />
            </div>

            {/* Audio Visualizer */}
            <AudioVisualizer bars={bars} />

            {/* Controls */}
            <div className="flex flex-col gap-4 mt-6">
                <button
                    onClick={onLeave}
                    className="w-full py-4 px-8 border border-white/20 rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider bg-white/10 text-white hover:bg-white/15 hover:border-white/30 btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">🚪 Leave Room</span>
                </button>
            </div>

            {/* Enable Audio Button (for autoplay policy bypass) */}
            {showEnableAudio && (
                <div className="flex flex-col gap-4 mt-4">
                    <button
                        onClick={handleEnableAudio}
                        className="w-full py-4 px-8 border-none rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider gradient-primary text-white shadow-[0_4px_15px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(102,126,234,0.6)] btn-ripple relative overflow-hidden"
                    >
                        <span className="relative z-10">🔊 Enable Audio</span>
                    </button>
                </div>
            )}

            {/* Hidden audio element */}
            <audio ref={audioRef} autoPlay className="hidden" />
        </div>
    );
}
