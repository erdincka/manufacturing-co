import { IngestionModeSelector } from './components/IngestionModeSelector';
// import { DataContentModal } from './components/DataContentModal';
// import PipelineChart from './components/PipelineChart';

# -- - Batch Ingestion Endpoints-- -


# @app.post("/scenarios/generate_batch_csv")
# def generate_batch_csv():
#     """Generate a CSV file with telemetry data in the bronze S3 bucket."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code = 400, detail = "Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv
#         import random
#         import io
#         from datetime import datetime, timedelta

#         # Generate 100 sample records
#         records = []
#         devices = ["CNC-001", "CNC-002", "ROBOT-A", "ROBOT-B", "PRESS-04"]

#         for _ in range(100):
#             record = {
#                 "event_id": str(uuid4()),
#                 "device_id": random.choice(devices),
#                 "timestamp": datetime.now(timezone.utc).isoformat(),
#                 "temperature": random.uniform(60, 95),
#                 "vibration": random.uniform(0.1, 5.0),
#                 "status": random.choice(
#["OK", "OK", "OK", "OK", "OK", "OK", "WARNING"]
#),
#             }
#             records.append(record)

#         # Write CSV to string buffer
#         csv_buffer = io.StringIO()
#         writer = csv.DictWriter(csv_buffer, fieldnames = records[0].keys())
#         writer.writeheader()
#         writer.writerows(records)
#         csv_content = csv_buffer.getvalue()

#         bucket_name = "bronze-bucket"
#         object_key = "batch_ingest.csv"

#         if connector.s3.put_object(
#             bucket_name, object_key, csv_content.encode("utf-8")
#):
#             # log_demo_event(
#             #     "default",
#             #     "batch_csv_generated",
#             #     f"Generated {len(records)} records in s3://{bucket_name}/{object_key}",
#             #)
#             return {
#                 "status": "success",
#                 "message": f"Generated {len(records)} records",
#                 "bucket": bucket_name,
#                 "key": object_key,
#                 "record_count": len(records),
#                 "preview": records[: 5],  # Show first 5 records
#             }
#         else:
#             # log_demo_event(
#             #     "default",
#             #     "batch_csv_generated failed with S3 put",
#             #     f"Unknown S3 Put error for s3://{bucket_name}/{object_key}",
#             #)
#             return {
#                 "status": "error",
#                 "message": f"Failed to put csv file into s3://{bucket_name}/{object_key}",
#             }

#     except Exception as e:
#         logger.error(f"Failed to generate batch CSV: {e}")
#         return { "status": "error", "message": str(e) }


# @app.get("/scenarios/preview_batch_csv")
# def preview_batch_csv():
#     """Preview the content of the batch CSV file from S3."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code = 400, detail = "Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv

#         bucket_name = "bronze-bucket"
#         object_key = "batch_ingest.csv"
#         csv_content = connector.s3.read_object(bucket_name, object_key)
#         # Parse CSV
#         records = []
#         reader = csv.DictReader(io.StringIO(csv_content))
#         for row in reader:
#             records.append(row)

#         return {
#             "status": "success",
#             "bucket": bucket_name,
#             "key": object_key,
#             "record_count": len(records),
#             "records": records,
#         }
#     except Exception as e:
#         logger.error(f"Failed to preview CSV: {e}")
#         if "NoSuchKey" in str(e):
#             return {
#                 "status": "error",
#                 "message": "CSV file not found. Generate it first.",
#             }
#         return { "status": "error", "message": str(e) }


# @app.post("/scenarios/publish_batch")
# def publish_batch():
#     """Publish the batch CSV from S3 to Kafka topic."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code = 400, detail = "Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv

#         bucket_name = "bronze-bucket"
#         object_key = "batch_ingest.csv"
#         csv_content = connector.s3.read_object(bucket_name, object_key)

#         # Parse CSV and publish to Kafka
#         topic_name = "manufacturing.telemetry.raw"

#         count = 0
#         reader = csv.DictReader(io.StringIO(csv_content))
#         if connector.kafka.push_messages(topic_name, [row for row in reader]):
#             count = len([row for row in reader])

#         # log_demo_event(
#         #     "default",
#         #     "batch_published",
#         #     f"Published {count} records from s3://{bucket_name}/{object_key} to {topic_name}",
#         #)

#         return {
#             "status": "success",
#             "message": f"Published {count} records to {topic_name}",
#             "bucket": bucket_name,
#             "key": object_key,
#             "record_count": count,
#         }
#     except Exception as e:
#         logger.error(f"Failed to publish batch: {e}")
#         if "NoSuchKey" in str(e):
#             return {
#                 "status": "error",
#                 "message": "CSV file not found. Generate it first.",
#             }
#         return { "status": "error", "message": str(e) }




// Logic/Code Modal State
const [logicModalOpen, setLogicModalOpen] = useState(false);
const [activeLogic, setActiveLogic] = useState<{ title: string, description: string, code: string } | null>(null);

import { IngestionExplanation } from './components/IngestionExplanation';
const [ingestionProgress, setIngestionProgress] = useState(0);


const { data: topicMetrics } = useQuery<TopicMetrics>({
    queryKey: ['topicMetrics'],
    queryFn: async () => {
        const res = await fetch(`${API_BASE}/topics/manufacturing.telemetry.raw/metrics`);
        if (!res.ok) throw new Error('Failed to fetch topic metrics');
        const data = await res.json();

        // Add to history if unique
        if (data.recent_message) {
            setMessageHistory(prev => {
                const exists = prev.some(m => m === data.recent_message);
                if (exists) return prev;
                return [data.recent_message, ...prev].slice(0, 5);
            });
        }
        return data;
    },
    enabled: isReady && !!readiness?.bronze?.details?.topic,
    refetchInterval: 3000, // Refresh every 3s
});

{
    messageHistory.map((msg, idx) => (
        <div key={`msg-${idx}`} className="animate-in fade-in slide-in-from-left-2 duration-300">
            <span className="text-amber-500 font-bold">[BRONZE]</span>
            <span className="text-foreground/80 lowercase">
                {typeof msg === 'string' && msg.startsWith('{')
                    ? JSON.stringify(JSON.parse(msg)).substring(0, 60) + "..."
                    : String(msg).substring(0, 60)}
            </span>
        </div>
    ))
}

// Topic Metrics state
const [messageHistory, setMessageHistory] = useState<any[]>([]);

// Multi-Layer Metrics
const { data: silverMetrics } = useQuery<TableMetrics>({
    queryKey: ['silverMetrics'],
    queryFn: async () => {
        const res = await fetch(`${API_BASE}/tables/telemetry.cleansed/metrics`);
        return res.json();
    },
    enabled: isReady,
    refetchInterval: 3000,
});

const { data: goldMetrics } = useQuery<TableMetrics>({
    queryKey: ['goldMetrics'],
    queryFn: async () => {
        const res = await fetch(`${API_BASE}/tables/manufacturing.kpis/metrics`);
        return res.json();
    },
    enabled: isReady,
    refetchInterval: 3000,
});

// // Data Content Modal State
// const [dataContentModal, setDataContentModal] = useState<{
//     isOpen: boolean;
//     title: string;
//     data: any[];
//     type: 'csv' | 'messages' | 'queue';
//     isLoading: boolean;
// }>({ isOpen: false, title: '', data: [], type: 'messages', isLoading: false });

// Ingestion UI State
const [ingestionMode, setIngestionMode] = useState<'batch' | 'realtime'>('realtime');
const [showIngestionExplanation, setShowIngestionExplanation] = useState(false);
const [batchCsvGenerated, setBatchCsvGenerated] = useState(false);
// // Data Browser Modal State
// const [dataModalOpen, setDataModalOpen] = useState(false);
// const [modalConfig, setModalConfig] = useState<{ title: string, type: 'kafka' | 'iceberg', name: string }>({ title: '', type: 'kafka', name: '' });
interface TopicMetrics {
    topic: string;
    messages_count: number;
    recent_message: any;
    delay_seconds: number;
    partitions: number;
    consumers: number;
    in_queue: number;
}

interface TableMetrics {
    name: string;
    record_count: number;
    snapshot_count: number;
    current_snapshot_id: string | null;
    last_updated: string | null;
}
// const { data: browserData, isPending: isBrowsing } = useQuery({
//     queryKey: ['browserData', modalConfig.name],
//     queryFn: async () => {
//         const endpoint = modalConfig.type === 'kafka'
//             ? `${API_BASE}/topics/${modalConfig.name}/messages`
//             : `${API_BASE}/tables/${modalConfig.name}/data`;
//         const res = await fetch(endpoint);
//         return res.json();
//     },
//     enabled: dataModalOpen && !!modalConfig.name,
//     refetchInterval: 3000, // Auto-refresh data in modal
// });

// Batch CSV Handlers
const handleGenerateBatchCSV = async () => {
    try {
        setActionLogs(['Generating batch CSV...']);
        const res = await fetch(`${API_BASE}/scenarios/generate_batch_csv`, {
            method: 'POST'
        });
        const data = await res.json();

        if (data.status === 'success') {
            setBatchCsvGenerated(true);
            setActionLogs([`✓ Generated ${data.record_count} records in S3 bucket: ${data.bucket}/${data.key}`]);
        } else {
            setActionLogs([`✕ Failed to generate CSV: ${data.message}`]);
        }
    } catch (error) {
        setActionLogs([`✕ Error generating batch CSV: ${error}`]);
    }
};

const handlePublishBatch = async () => {
    try {
        setActionLogs(['Publishing batch to Kafka...']);
        const res = await fetch(`${API_BASE}/scenarios/publish_batch`, {
            method: 'POST'
        });
        const data = await res.json();

        if (data.status === 'success') {
            setActionLogs([`✓ Published ${data.record_count} records to topic`]);
            setBatchCsvGenerated(false); // Reset for next batch
            queryClient.invalidateQueries({ queryKey: ['detailedTopicMetrics'] });
            queryClient.invalidateQueries({ queryKey: ['topicMetrics'] });
        } else {
            setActionLogs([`✕ Failed to publish batch: ${data.message}`]);
        }
    } catch (error) {
        setActionLogs([`✕ Error publishing batch: ${error}`]);
    }
};


{
    ingestionMode === 'batch' ? (
        <>
            <button
                onClick={handleGenerateBatchCSV}
                disabled={batchCsvGenerated}
                className="flex-1 min-w-[200px] flex flex-col items-center justify-center p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:bg-amber-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
                <span className="text-2xl mb-1">📦</span>
                <span className="font-semibold text-sm">Generate Batch CSV</span>
                <span className="text-[10px] text-muted-foreground mt-1">100 records → S3</span>
            </button>
            <button
                onClick={handlePublishBatch}
                disabled={!batchCsvGenerated}
                className="flex-1 min-w-[200px] flex flex-col items-center justify-center p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:bg-amber-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
                <span className="text-2xl mb-1">📤</span>
                <span className="font-semibold text-sm">Publish to Stream</span>
                <span className="text-[10px] text-muted-foreground mt-1">CSV → Kafka</span>
            </button>
        </>
    ) : (
                                )
}
{/* Ingestion Progress (for real-time mode) */ }
{
    ingestionMode === 'realtime' && (isIngesting || ingestionProgress > 0) && (
        <div className="mt-4 space-y-2 px-1">
            <div className="flex justify-between text-[10px] font-bold">
                <span className="text-amber-500 italic">Ingesting...</span>
                <span>{ingestionProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${ingestionProgress}%` }}></div>
            </div>
        </div>
    )
}

{/* Explanation Modal */ }
<IngestionExplanation
    mode={ingestionMode}
    isOpen={showIngestionExplanation}
    onClose={() => setShowIngestionExplanation(false)}
/>
                        </div >


    {/* Recent Activity Log (Simplified) */ }
    < div className = "bg-card border border-border rounded-2xl overflow-hidden shadow-sm" >
    <div className="bg-muted/40 p-4 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-tight">📜 Cluster Activity</h3>
    </div>
    <div className="p-4 max-h-40 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-thin">
        {actionLogs.length > 0 ? actionLogs.map((log, idx) => (
            <div key={idx} className={`${log.includes('✕') ? 'text-red-500' :
                log.includes('→') ? 'text-muted-foreground' :
                    log.includes('✓') ? 'text-emerald-500' : 'text-foreground/70'
                }`}>
                {log}
            </div>
        )) : (
            <div className="text-muted-foreground italic opacity-40">No cluster events</div>
        )}
    </div>
</div >


    {/* Data Content Modal (Segments) */ }
{/* <DataContentModal
                isOpen={dataContentModal.isOpen}
                onClose={() => setDataContentModal(prev => ({ ...prev, isOpen: false }))}
                title={dataContentModal.title}
                data={dataContentModal.data}
                type={dataContentModal.type}
                isLoading={dataContentModal.isLoading}
            /> */}

{/* Data Browser Modal */ }
{
    dataModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={() => setDataModalOpen(false)}
            ></div>
            <div className="relative bg-[#0a0a0c] border border-border rounded-2xl w-full max-w-5xl max-h-[85vh] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            <span className="text-2xl">{modalConfig.type === 'kafka' ? '📡' : '🧊'}</span>
                            {modalConfig.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-muted-foreground">{modalConfig.name}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                {(isBrowsing || !browserData) && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                                Last 50 records • Auto-refreshing
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setDataModalOpen(false)}
                        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                    >
                        <span className="text-2xl text-muted-foreground">×</span>
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-auto p-0 relative min-h-[300px]">
                    {(isBrowsing || !browserData) ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-[#0a0a0c]/80 z-10 transition-opacity duration-300">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Fetching live from Data Fabric...</span>
                        </div>
                    ) : null}

                    {browserData && browserData.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="text-4xl mb-4 opacity-20">📭</div>
                            <p className="text-muted-foreground italic">No data found in this source.</p>
                        </div>
                    ) : (
                        <div className="min-w-full inline-block align-middle">
                            <table className="min-w-full divide-y divide-border/50 text-xs">
                                <thead className="bg-[#121214] sticky top-0 z-20">
                                    <tr>
                                        {modalConfig.type === 'kafka' ? (
                                            <>
                                                <th className="px-4 py-3 text-left font-bold text-muted-foreground uppercase tracking-wider w-12">Part</th>
                                                <th className="px-4 py-3 text-left font-bold text-muted-foreground uppercase tracking-wider w-20">Offset</th>
                                                <th className="px-4 py-3 text-left font-bold text-muted-foreground uppercase tracking-wider w-32">Time</th>
                                                <th className="px-4 py-3 text-left font-bold text-muted-foreground uppercase tracking-wider">Payload</th>
                                            </>
                                        ) : (
                                            <>
                                                {browserData && browserData.length > 0 && Object.keys(browserData[0]).map(key => (
                                                    <th key={key} className="px-4 py-3 text-left font-bold text-muted-foreground uppercase tracking-wider">
                                                        {key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ')}
                                                    </th>
                                                ))}
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 bg-[#0a0a0c]">
                                    {browserData?.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors border-l-2 border-l-transparent hover:border-l-indigo-500">
                                            {modalConfig.type === 'kafka' ? (
                                                <>
                                                    <td className="px-4 py-3 font-mono text-indigo-400">{row.partition}</td>
                                                    <td className="px-4 py-3 font-mono text-muted-foreground">{row.offset}</td>
                                                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                                        {row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '-'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-mono text-emerald-400/90 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                                            {typeof row.value === 'object' ? JSON.stringify(row.value, null, 2) : row.value}
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    {Object.entries(row).map(([key, val], j) => (
                                                        <td key={j} className="px-4 py-3">
                                                            <div className={`
                                                                        ${typeof val === 'number' ? 'font-mono text-indigo-400' : ''}
                                                                        ${key === 'status' && val === 'WARNING' ? 'text-amber-500 font-bold' : ''}
                                                                        ${key === 'status' && val === 'OK' ? 'text-emerald-500' : ''}
                                                                        ${!['number', 'string'].includes(typeof val) ? 'italic opacity-50' : 'text-foreground/90'}
                                                                    `}>
                                                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                            </div>
                                                        </td>
                                                    ))}
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-[#121214] border-t border-border flex justify-between items-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                        Live Connection Stable
                    </div>
                    <button
                        onClick={() => setDataModalOpen(false)}
                        className="px-5 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-all border border-white/5"
                    >
                        Close Browser
                    </button>
                </div>
            </div>
        </div>
    )
}


// const handleSegmentClick = async (segment: 'generated' | 'published' | 'queued' | 'processed') => {
//     setDataContentModal(prev => ({
//         ...prev,
//         isOpen: true,
//         isLoading: true,
//         title: `Viewing ${segment.charAt(0).toUpperCase() + segment.slice(1)} Data`,
//         type: segment === 'processed' ? 'csv' : 'messages',
//         data: []
//     }));

//     try {
//         let data: any[] = [];
//         let type: 'csv' | 'messages' | 'queue' = 'messages';

//         if (segment === 'generated') {
//             // capture in-memory (if streaming) or csv (if batch) message content
//             if (ingestionMode === "batch") {
//                 const res = await fetch(`${API_BASE}/scenarios/preview_batch_csv`);
//                 const record_status = await res.json();
//                 if (res.ok && record_status["status"] === "success") data = record_status["records"];
//                 type = 'csv';
//             } else {
//                 const res = await fetch(`${API_BASE}/topics/manufacturing.telemetry.raw/messages`);
//                 if (res.ok) data = await res.json();
//                 type = 'messages'
//             }
//         } else if (segment === 'published') {
//             const res = await fetch(`${API_BASE}/topics/manufacturing.telemetry.raw/messages`);
//             if (res.ok) data = await res.json();
//             type = 'messages';
//         } else if (segment === 'queue') {
//             const res = await fetch(`${API_BASE}/topics/manufacturing.telemetry.raw/queue`);
//             if (res.ok) data = await res.json();
//             type = 'queue';
//         } else if (segment === 'processed') {
//             const res = await fetch(`${API_BASE}/tables/telemetry.cleansed/data?limit=50`);
//             if (res.ok) data = await res.json();
//             type = 'csv';
//         }

//         setDataContentModal(prev => ({
//             ...prev,
//             isLoading: false,
//             data,
//             type
//         }));

//     } catch (e) {
//         console.error("Error fetching segment details", e);
//         setDataContentModal(prev => ({ ...prev, isLoading: false, data: [{ error: "Failed to fetch data" }] }));
//     }
// };

// // Keyboard listener for ESC key
// useEffect(() => {
//     const handleKeyDown = (e: KeyboardEvent) => {
//         if (e.key === 'Escape') {
//             setDataModalOpen(false);
//             setLogicModalOpen(false);
//         }
//     };
//     window.addEventListener('keydown', handleKeyDown);
//     return () => window.removeEventListener('keydown', handleKeyDown);
// }, []);

// const openBrowser = (type: 'kafka' | 'iceberg', name: string, title: string) => {
//     setModalConfig({ type, name, title });
//     setDataModalOpen(true);
// };

const showLogic = (type: string) => {
    const logicMap: Record<string, { title: string, description: string, code: string }> = {
        ingestion: {
            title: "Bronze Layer Ingestion Logic",
            description: "Publishes raw IoT sensor data to a Kafka topic stored as an HPE Data Fabric Event Stream.",
            code: `# Ingesting into Bronze Layer (Streams)
def iot_streaming():
    producer = KafkaProducer(
        bootstrap_servers=BROKER_URL,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    for _ in range(BATCH_SIZE):
        msg = generate_telemetry()
        producer.send('manufacturing.telemetry.raw', msg)
    producer.flush()`
        },
        processing: {
            title: "Silver Layer Processing Logic",
            description: "Consumes raw Kafka messages, validates schema, and appends to an Iceberg table on Data Fabric Object Store.",
            code: `# Processing Bronze to Silver (Streams -> Iceberg)
def process_data():
    consumer = KafkaConsumer('manufacturing.telemetry.raw')
    records = []
    for msg in consumer.poll(timeout=1000):
        if validate_schema(msg.value):
            records.append(transform(msg.value))
    
    # Write to Iceberg via PyIceberg
    table = catalog.load_table("telemetry.cleansed")
    table.append(pa.Table.from_pandas(pd.DataFrame(records)))`
        },
        curation: {
            title: "Gold Layer Curation Logic",
            description: "Aggregates Silver records into high-level business KPIs, stored in Iceberg tables for dashboard consumption.",
            code: `# Curating Silver to Gold (Iceberg -> Iceberg)
def curate_data():
    # Load Silver Data
    silver_table = catalog.load_table("telemetry.cleansed")
    df = silver_table.scan().to_pandas()
    
    # Aggregate KPIs
    kpis = df.groupby(pd.Grouper(key='timestamp', freq='1H')).agg({
        'temperature': 'mean',
        'event_id': 'count'
    })
    
    # Save to Gold Table
    gold_table = catalog.load_table("manufacturing.kpis")
    gold_table.append(pa.Table.from_pandas(kpis))`
        }
    };
    setActiveLogic(logicMap[type]);
    setLogicModalOpen(true);
};


                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold flex items-center gap-3 mb-2">
                                        <span className="text-2xl">🟤</span> Bronze Layer - Raw Data Ingestion
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {ingestionMode === 'batch'
                                            ? 'File-based batch ingestion via S3 bucket'
                                            : 'Real-time IoT telemetry streaming to Kafka'}
                                    </p>
                                </div>
                                <IngestionModeSelector
                                    mode={ingestionMode}
                                    onChange={setIngestionMode}
                                />
                            </div>

{/* Data Flow Visualization */ }
{/* <div className="mb-6">
                                <PipelineChart
                                    generated={detailedMetrics?.total_messages || 0}
                                    published={detailedMetrics?.total_messages || 0}
                                    inQueue={detailedMetrics?.in_queue || 0}
                                    processed={detailedMetrics?.processed || 0}
                                    onSegmentClick={handleSegmentClick}
                                />
                                </div> */}


<button
    onClick={() => setShowIngestionExplanation(true)}
    className="px-6 py-4 bg-muted/50 border border-border rounded-xl hover:bg-muted transition-all hover:scale-[1.01] active:scale-[0.99]"
>
    <span className="text-sm font-medium flex items-center gap-2">
        <span>ℹ️</span>
        How it Works
    </span>
</button>

{/* 2. SILVER LAYER */ }
<div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative group">
    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
    <div className="flex justify-between items-start mb-6">
        <div>
            <h3 className="text-xl font-bold flex items-center gap-3">
                <span className="text-2xl">⚙️</span> Silver Layer: Processing
                <button
                    onClick={() => showLogic('processing')}
                    className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full hover:bg-white/10 transition-colors font-medium text-muted-foreground uppercase tracking-widest"
                >
                    How it works?
                </button>
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Validated and schema-matched storage using Apache Iceberg</p>
        </div>
        <div className="bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Object Store (Iceberg)</div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Actions */}
        <div className="md:col-span-4 space-y-4">
            <button
                onClick={() => scenarioMutation.mutate({ type: 'process_data', label: 'Processing' })}
                disabled={scenarioMutation.isPending}
                className="w-full flex flex-col items-center justify-center p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl hover:bg-indigo-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 group"
            >
                <span className="text-3xl mb-2 group-hover:animate-spin">⚙️</span>
                <span className="font-bold">Run Silver Process</span>
                <span className="text-[10px] text-muted-foreground mt-1 uppercase">Bronze → Silver</span>
            </button>
        </div>

        {/* Metrics */}
        <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 cursor-pointer" onClick={() => openBrowser('iceberg', 'telemetry.cleansed', 'Silver Layer: Cleansed Data')}>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Iceberg Records</div>
                <div className="text-xl font-bold font-mono text-indigo-500">{silverMetrics?.record_count?.toLocaleString() || '0'}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Snapshots</div>
                <div className="text-xl font-bold font-mono text-indigo-500">{silverMetrics?.snapshot_count || 0}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Data Health</div>
                <div className="text-xl font-bold font-mono text-emerald-500">100%</div>
            </div>
        </div>
    </div>
</div>

{/* 3. GOLD LAYER */ }
<div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden relative group">
    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
    <div className="flex justify-between items-start mb-6">
        <div>
            <h3 className="text-xl font-bold flex items-center gap-3">
                <span className="text-2xl">🏆</span> Gold Layer: Curation
                <button
                    onClick={() => showLogic('curation')}
                    className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full hover:bg-white/10 transition-colors font-medium text-muted-foreground uppercase tracking-widest"
                >
                    How it works?
                </button>
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Aggregated KPIs and business insights for analytics</p>
        </div>
        <div className="bg-yellow-500/10 text-yellow-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Business Intelligence</div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Actions */}
        <div className="md:col-span-4 space-y-4">
            <button
                onClick={() => scenarioMutation.mutate({ type: 'curate_data', label: 'Generating KPIs' })}
                disabled={scenarioMutation.isPending}
                className="w-full flex flex-col items-center justify-center p-6 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl hover:bg-yellow-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 group"
            >
                <span className="text-3xl mb-2 group-hover:rotate-12 transition-transform">🏆</span>
                <span className="font-bold">Generate Gold KPIs</span>
                <span className="text-[10px] text-muted-foreground mt-1 uppercase">Silver → Gold</span>
            </button>
        </div>

        {/* Metrics */}
        <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50 cursor-pointer" onClick={() => openBrowser('iceberg', 'manufacturing.kpis', 'Gold Layer: Business KPIs')}>
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">KPI Records</div>
                <div className="text-xl font-bold font-mono text-yellow-500">{goldMetrics?.record_count?.toLocaleString() || '0'}</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Avg Temp</div>
                <div className="text-xl font-bold font-mono text-yellow-500">72.4°</div>
            </div>
            <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Window Updates</div>
                <div className="text-xl font-bold font-mono text-yellow-500">{goldMetrics?.snapshot_count || 0}</div>
            </div>
        </div>
    </div>
</div>

{/* Logic/Code Explanation Modal */ }
{
    logicModalOpen && activeLogic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={() => setLogicModalOpen(false)}
            ></div>
            <div className="relative bg-[#0a0a0c] border border-border rounded-2xl w-full max-w-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border bg-muted/20">
                    <h3 className="text-xl font-bold text-white mb-2">{activeLogic.title}</h3>
                    <p className="text-sm text-muted-foreground">{activeLogic.description}</p>
                </div>
                <div className="p-6 bg-black overflow-auto max-h-[60vh]">
                    <pre className="text-sm font-mono text-indigo-400 leading-relaxed">
                        {activeLogic.code}
                    </pre>
                </div>
                <div className="p-4 bg-[#121214] border-t border-border flex justify-end">
                    <button
                        onClick={() => setLogicModalOpen(false)}
                        className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/10"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    )
}
