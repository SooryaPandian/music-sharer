import { useState } from 'react';
import { useAppContext } from '../context/AppContext';

export default function HomeScreen({ onCreateRoom, onJoinRoom }) {
    const { userName, openNameModal } = useAppContext();
    const [roomCodeInput, setRoomCodeInput] = useState('');

    const handleCreateClick = () => {
        if (!userName) {
            openNameModal('create', () => {
                onCreateRoom();
            });
        } else {
            onCreateRoom();
        }
    };

    const handleJoinClick = () => {
        if (!roomCodeInput.trim()) {
            alert('Please enter a room code');
            return;
        }

        // Removed the 6-character length check as per the provided edit,
        // but it might be good to re-add if the backend expects it.
        // if (roomCodeInput.trim().length !== 6) {
        //     alert("Please enter a valid 6-character room code");
        //     return;
        // }

        if (!userName) {
            openNameModal('join', () => {
                onJoinRoom(roomCodeInput.trim());
            });
        } else {
            onJoinRoom(roomCodeInput.trim());
        }
    };

    const handleRoomCodeChange = (e) => {
        setRoomCodeInput(e.target.value.toUpperCase());
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleJoinClick();
        }
    };

    return (
        <div className="glass-card rounded-2xl p-12 shadow-2xl animate-fade-in-up transition-all duration-300 w-full max-w-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-glow">
            <div className="text-center mb-8">
                <p className="text-lg text-white/70">
                    Choose an option to get started
                </p>
            </div>

            <div className="flex flex-col gap-4">
                {/* Create Room Button */}
                <button
                    onClick={handleCreateClick}
                    className="w-full py-4 px-8 border-none rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider gradient-primary text-white shadow-[0_4px_15px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(102,126,234,0.6)] btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">🎙️ Create Room & Share Audio</span>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4 my-8 text-white/70 text-sm uppercase tracking-widest">
                    <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <span>or</span>
                    <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                {/* Join Room Input */}
                <div className="mb-6">
                    <label className="block text-sm font-medium mb-2 text-white/70 uppercase tracking-wide">
                        Join Existing Room
                    </label>
                    <input
                        type="text"
                        value={roomCodeInput}
                        onChange={handleRoomCodeChange}
                        onKeyPress={handleKeyPress}
                        placeholder="Enter room code"
                        maxLength={6}
                        autoComplete="off"
                        className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-lg text-white text-base outline-none transition-all focus:border-purple-500/50 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgba(102,126,234,0.1)] placeholder:text-white/30"
                    />
                </div>

                {/* Join Room Button */}
                <button
                    onClick={handleJoinClick}
                    className="w-full py-4 px-8 border border-white/20 rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider bg-white/10 text-white hover:bg-white/15 hover:border-white/30 btn-ripple relative overflow-hidden"
                >
                    <span className="relative z-10">🎧 Join Room</span>
                </button>
            </div>
        </div>
    );
}
