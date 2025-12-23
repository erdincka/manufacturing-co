'use client';

interface IngestionModeSelectorProps {
    mode: 'batch' | 'realtime';
    onChange: (mode: 'batch' | 'realtime') => void;
}

export function IngestionModeSelector({ mode, onChange }: IngestionModeSelectorProps) {
    return (
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
                onClick={() => onChange('batch')}
                className={`px-4 py-2 rounded-md transition-all ${mode === 'batch'
                        ? 'bg-white dark:bg-gray-700 shadow-sm font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
            >
                📦 Batch
            </button>
            <button
                onClick={() => onChange('realtime')}
                className={`px-4 py-2 rounded-md transition-all ${mode === 'realtime'
                        ? 'bg-white dark:bg-gray-700 shadow-sm font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
            >
                ⚡ Real-time
            </button>
        </div>
    );
}
