export default function AudioVisualizer({ bars }) {
    return (
        <div className="w-full h-16 bg-white/[0.03] rounded-lg mt-6 overflow-hidden relative">
            <div className="flex items-end justify-around h-full p-2 gap-0.5">
                {bars.map((height, index) => (
                    <div
                        key={index}
                        className="flex-1 visualizer-bar"
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>
        </div>
    );
}
