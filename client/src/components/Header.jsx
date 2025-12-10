import { useAppContext } from '../context/AppContext';

export default function Header() {
    const { userName, currentScreen } = useAppContext();

    return (
        <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🎵</span>
                    <h1 className="text-xl font-bold gradient-text">Music Sharer</h1>
                </div>

                {(currentScreen === 'broadcaster' || currentScreen === 'listener') && userName && (
                    <div className="flex items-center gap-2 text-sm text-white/70">
                        <span>👤</span>
                        <span>{userName}</span>
                    </div>
                )}
            </div>
        </header>
    );
}
