import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

export default function NameModal({ onSave }) {
    const { showNameModal, userName, modalContext, closeNameModal } = useAppContext();
    const [name, setName] = useState('');

    useEffect(() => {
        if (showNameModal) {
            setName(userName || '');
        }
    }, [showNameModal, userName]);

    if (!showNameModal) return null;

    const handleSave = () => {
        if (!name.trim()) {
            alert("Please enter a name");
            return;
        }
        onSave(name.trim());
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 animate-fade-in">
            <div className="glass-card rounded-2xl p-12 max-w-md w-[90%] animate-slide-up">
                <h2 className="mb-6 text-center text-2xl font-semibold">
                    Enter Your Name
                </h2>

                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Your name"
                    maxLength={20}
                    autoComplete="off"
                    autoFocus
                    className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-lg text-white text-base mb-6 outline-none transition-all focus:border-purple-500/50 focus:bg-white/[0.08] focus:shadow-[0_0_0_3px_rgba(102,126,234,0.1)] placeholder:text-white/30"
                />

                <div className="flex gap-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 py-4 px-8 border-none rounded-lg text-base font-semibold cursor-pointer transition-all uppercase tracking-wider gradient-primary text-white shadow-[0_4px_15px_rgba(102,126,234,0.4)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(102,126,234,0.6)] btn-ripple relative overflow-hidden"
                    >
                        <span className="relative z-10">Save</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
