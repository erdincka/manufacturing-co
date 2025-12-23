'use client';

interface ProcessingStatusProps {
    latestMessageTime?: string;
    lastProcessedTime?: string;
    lagSeconds: number;
}

export function ProcessingStatus({
    latestMessageTime,
    lastProcessedTime,
    lagSeconds
}: ProcessingStatusProps) {
    const getLagStatus = (lag: number) => {
        if (lag < 5) return {
            icon: '✅',
            color: 'text-green-600 dark:text-green-400',
            bgColor: 'bg-green-50 dark:bg-green-900/20',
            borderColor: 'border-green-200 dark:border-green-800',
            label: 'Real-time'
        };
        if (lag < 30) return {
            icon: '⚠️',
            color: 'text-amber-600 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
            borderColor: 'border-amber-200 dark:border-amber-800',
            label: 'Minor delay'
        };
        return {
            icon: '🔴',
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-50 dark:bg-red-900/20',
            borderColor: 'border-red-200 dark:border-red-800',
            label: 'Significant lag'
        };
    };

    const status = getLagStatus(lagSeconds);

    const formatTime = (isoString?: string) => {
        if (!isoString) return 'N/A';
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return 'N/A';
        }
    };

    return (
        <div className={`p-4 rounded-lg border ${status.bgColor} ${status.borderColor} space-y-3`}>
            <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                Processing Status
            </h3>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                        Latest Message
                    </div>
                    <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {formatTime(latestMessageTime)}
                    </div>
                </div>
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                        Last Processed
                    </div>
                    <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {formatTime(lastProcessedTime)}
                    </div>
                </div>
            </div>

            <div className={`pt-3 border-t ${status.borderColor}`}>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Processing Lag:
                    </span>
                    <span className={`flex items-center gap-2 ${status.color}`}>
                        <span className="text-xl">{status.icon}</span>
                        <span className="font-bold text-lg">{lagSeconds}s</span>
                        <span className="text-xs opacity-75">({status.label})</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
