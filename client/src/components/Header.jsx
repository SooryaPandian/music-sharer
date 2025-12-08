import { useAppContext } from '../context/AppContext';
import { useUserName } from '../hooks/useUserName';

export default function Header() {
    const { userName } = useAppContext();
    const { openNameModal } = useUserName();

    return (
        <header className="text-center py-12 pb-8 animate-fade-in-down">
            {/* Logo */}
            <div className="inline-flex items-center gap-4 mb-6">
                <span className="text-5xl drop-shadow-[0_0_20px_rgba(102,126,234,0.6)] animate-pulse-logo">
                    🎵
                </span>
            </div>

            {/* Title */}
            <h1 className="text-5xl font-bold gradient-text tracking-tight mb-2">
                Music Sharer
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-white/70 max-w-xl mx-auto">
                Share audio from your Chrome tabs in real-time. Perfect for listening to music together!
            </p>

            {/* User Info */}
            <div className="flex items-center justify-center gap-4 mt-6 p-4 bg-white/5 rounded-lg max-w-xs mx-auto">
                <span className="font-semibold text-white">
                    {userName || 'Guest'}
                </span>
                <button
                    onClick={() => openNameModal('edit')}
                    className="bg-transparent border-none text-white/70 cursor-pointer p-2 text-sm transition-colors hover:text-white"
                >
                    ✏️ Edit Name
                </button>
            </div>
        </header>
    );
}
