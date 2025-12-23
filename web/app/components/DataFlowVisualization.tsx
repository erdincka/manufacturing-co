'use client';

interface DataFlowVisualizationProps {
    generated: number;
    published: number;
    inQueue: number;
    processed: number;
    onSegmentClick: (segment: 'generated' | 'published' | 'queue' | 'processed') => void;
}

export function DataFlowVisualization({
    generated,
    published,
    inQueue,
    processed,
    onSegmentClick
}: DataFlowVisualizationProps) {
    const processedPercent = generated > 0 ? (processed / generated) * 100 : 0;
    const queuedPercent = generated > 0 ? (inQueue / generated) * 100 : 0;

    return (
        <div className="space-y-4">
            {/* Clickable Metric Summary */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => onSegmentClick('generated')}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-md cursor-pointer text-left"
                >
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Generated
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {generated.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        Click to view source data
                    </div>
                </button>

                <button
                    onClick={() => onSegmentClick('published')}
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-md cursor-pointer text-left"
                >
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Published
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {published.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        Click to view topic messages
                    </div>
                </button>
            </div>


            {/* Interactive Progress Bar with Tooltips */}
            <div className="space-y-2">
                <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex relative group">
                    {/* Processed Segment */}
                    <div
                        className="bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500 flex items-center justify-center cursor-pointer hover:brightness-110 relative"
                        style={{ width: `${processedPercent}%` }}
                        onClick={() => onSegmentClick('processed')}
                    >
                        {processedPercent > 5 && (
                            <div className="text-white text-sm font-semibold">
                                {processed.toLocaleString()}
                            </div>
                        )}
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="font-semibold">Processed Messages</div>
                            <div className="text-gray-300">{processed.toLocaleString()} messages</div>
                            <div className="text-gray-400 text-[10px] mt-1">Click to view consumed messages</div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                    </div>

                    {/* Queue Segment */}
                    <div
                        className="bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500 flex items-center justify-center cursor-pointer hover:brightness-110 relative"
                        style={{ width: `${queuedPercent}%` }}
                        onClick={() => onSegmentClick('queue')}
                    >
                        {queuedPercent > 5 && (
                            <div className="text-white text-sm font-semibold">
                                {inQueue.toLocaleString()}
                            </div>
                        )}
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="font-semibold">In Queue</div>
                            <div className="text-gray-300">{inQueue.toLocaleString()} messages</div>
                            <div className="text-gray-400 text-[10px] mt-1">Click to view queued messages</div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                    </div>
                </div>

                {/* Legend with Clickable Labels */}
                <div className="flex justify-between text-sm">
                    <button
                        onClick={() => onSegmentClick('processed')}
                        className="flex items-center gap-2 hover:underline cursor-pointer transition-colors"
                    >
                        <span className="w-3 h-3 bg-green-500 rounded"></span>
                        <span className="text-gray-700 dark:text-gray-300">
                            Processed ({processedPercent.toFixed(1)}%)
                        </span>
                    </button>
                    <button
                        onClick={() => onSegmentClick('queue')}
                        className="flex items-center gap-2 hover:underline cursor-pointer transition-colors"
                    >
                        <span className="w-3 h-3 bg-amber-400 rounded"></span>
                        <span className="text-gray-700 dark:text-gray-300">
                            Queued ({queuedPercent.toFixed(1)}%)
                        </span>
                    </button>
                </div>
            </div>

        </div>
    );
}
