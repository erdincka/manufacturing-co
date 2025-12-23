'use client';

interface IngestionExplanationProps {
    mode: 'batch' | 'realtime';
    isOpen: boolean;
    onClose: () => void;
}

export function IngestionExplanation({ mode, isOpen, onClose }: IngestionExplanationProps) {
    if (!isOpen) return null;

    const explanations = {
        batch: {
            title: "📦 Batch Ingestion Process",
            description: "File-based data ingestion for bulk processing",
            steps: [
                {
                    phase: "1. Data Capture",
                    description: "Generate 100 fictional sensor readings with realistic timestamps, temperatures, vibration levels, and status indicators",
                    tech: "Python CSV generation with randomized data",
                    icon: "📊"
                },
                {
                    phase: "2. Data Storage",
                    description: "Write CSV file to S3 bronze bucket (bronze-raw/batch_ingest.csv) for persistent storage and auditability",
                    tech: "S3 PutObject API with boto3",
                    icon: "💾"
                },
                {
                    phase: "3. Data Publishing",
                    description: "Read CSV from S3, parse each row, and publish as individual JSON messages to Kafka topic for stream processing",
                    tech: "Kafka Producer with CSV parsing",
                    icon: "📤"
                },
                {
                    phase: "4. Downstream Processing",
                    description: "Silver layer consumes messages from Kafka, cleanses and validates data, then writes to Iceberg table for analytics",
                    tech: "Kafka Consumer → Data validation → PyIceberg",
                    icon: "✨"
                }
            ],
            useCase: "Ideal for: Historical data loads, scheduled ETL jobs, data migrations, bulk imports"
        },
        realtime: {
            title: "⚡ Real-time Stream Ingestion",
            description: "Continuous data streaming for immediate processing",
            steps: [
                {
                    phase: "1. Data Generation",
                    description: "Continuously generate sensor readings in memory, simulating IoT devices sending telemetry data in real-time",
                    tech: "Python in-memory data generation",
                    icon: "🔄"
                },
                {
                    phase: "2. Direct Publishing",
                    description: "Immediately publish each reading to Kafka topic without intermediate storage, minimizing latency",
                    tech: "Kafka Producer with in-memory serialization",
                    icon: "⚡"
                },
                {
                    phase: "3. Stream Processing",
                    description: "Silver layer consumes messages in real-time as they arrive, processing data with sub-second latency",
                    tech: "Kafka Consumer with auto-commit",
                    icon: "🌊"
                },
                {
                    phase: "4. Low Latency",
                    description: "End-to-end latency typically <1 second from data generation to availability in analytics layer",
                    tech: "Streaming architecture with Kafka",
                    icon: "🚀"
                }
            ],
            useCase: "Ideal for: IoT sensors, real-time monitoring, live dashboards, event-driven systems"
        }
    };

    const content = explanations[mode];

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
                    className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {content.title}
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {content.description}
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
                    <div className="p-6 space-y-6">
                        {content.steps.map((step, i) => (
                            <div
                                key={i}
                                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="text-4xl">{step.icon}</div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                            {step.phase}
                                        </h3>
                                        <p className="text-gray-700 dark:text-gray-300 mb-3">
                                            {step.description}
                                        </p>
                                        <div className="bg-gray-900 dark:bg-gray-950 rounded px-3 py-2">
                                            <code className="text-sm text-green-400 font-mono">
                                                {step.tech}
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Use Case */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">💡</span>
                                <div>
                                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                        When to Use
                                    </h4>
                                    <p className="text-sm text-blue-800 dark:text-blue-200">
                                        {content.useCase}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                        >
                            Got it!
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
