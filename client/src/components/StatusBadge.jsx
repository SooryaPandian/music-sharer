export default function StatusBadge({ status }) {
    const statusMap = {
        connected: {
            text: "Connected",
            bgClass: "bg-green-500/20",
            textClass: "text-green-500",
            borderClass: "border-green-500/30",
            dotClass: "bg-green-500 shadow-[0_0_10px_#10b981]"
        },
        connecting: {
            text: "Connecting...",
            bgClass: "bg-amber-500/20",
            textClass: "text-amber-500",
            borderClass: "border-amber-500/30",
            dotClass: "bg-amber-500 shadow-[0_0_10px_#f59e0b]"
        },
        disconnected: {
            text: "Disconnected",
            bgClass: "bg-red-500/20",
            textClass: "text-red-500",
            borderClass: "border-red-500/30",
            dotClass: "bg-red-500 shadow-[0_0_10px_#ef4444]"
        },
        failed: {
            text: "Connection Failed",
            bgClass: "bg-red-500/20",
            textClass: "text-red-500",
            borderClass: "border-red-500/30",
            dotClass: "bg-red-500 shadow-[0_0_10px_#ef4444]"
        },
        broadcasting: {
            text: "Broadcasting",
            bgClass: "bg-amber-500/20",
            textClass: "text-amber-500",
            borderClass: "border-amber-500/30",
            dotClass: "bg-amber-500 shadow-[0_0_10px_#f59e0b]"
        },
        paused: {
            text: "Paused",
            bgClass: "bg-gray-400/20",
            textClass: "text-gray-400",
            borderClass: "border-gray-400/30",
            dotClass: "bg-gray-400 shadow-[0_0_10px_#9ca3af]"
        },
    };

    const statusInfo = statusMap[status] || statusMap.disconnected;

    return (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mt-6 border ${statusInfo.bgClass} ${statusInfo.textClass} ${statusInfo.borderClass}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse-status ${statusInfo.dotClass}`}></span>
            <span>{statusInfo.text}</span>
        </div>
    );
}
