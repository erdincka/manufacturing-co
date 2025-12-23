'use client';

interface DataContentModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    data: any[];
    type: 'csv' | 'messages' | 'queue';
    isLoading?: boolean;
}

export function DataContentModal({
    isOpen,
    onClose,
    title,
    data,
    type,
    isLoading = false
}: DataContentModalProps) {
    if (!isOpen) return null;

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            );
        }

        if (!data || data.length === 0) {
            return (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-4">📭</div>
                    <div className="text-lg font-semibold">No data available</div>
                    <div className="text-sm mt-2">
                        {type === 'csv' ? 'Generate a batch CSV first' : 'No messages found'}
                    </div>
                </div>
            );
        }

        // CSV View
        if (type === 'csv') {
            const headers = data.length > 0 ? Object.keys(data[0]) : [];
            return (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                {headers.map((header) => (
                                    <th
                                        key={header}
                                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                    >
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {data.map((row, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    {headers.map((header) => (
                                        <td
                                            key={header}
                                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono"
                                        >
                                            {row[header]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Messages View (Kafka topic or queue)
        return (
            <div className="space-y-3">
                {data.map((msg, idx) => (
                    <div
                        key={idx}
                        className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                    #{idx + 1}
                                </span>
                                {msg.timestamp && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {new Date(msg.timestamp).toLocaleString()}
                                    </span>
                                )}
                            </div>
                            {msg.offset !== undefined && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Offset: {msg.offset}
                                </span>
                            )}
                        </div>
                        <pre className="text-xs bg-gray-900 dark:bg-black text-green-400 p-3 rounded overflow-x-auto">
                            {JSON.stringify(msg.value || msg, null, 2)}
                        </pre>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                    className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between rounded-t-lg">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {title}
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {data?.length || 0} {data?.length === 1 ? 'record' : 'records'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {renderContent()}
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center rounded-b-lg">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            {type === 'csv' && 'CSV Data'}
                            {type === 'messages' && 'Kafka Topic Messages'}
                            {type === 'queue' && 'Queued Messages'}
                        </div>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
