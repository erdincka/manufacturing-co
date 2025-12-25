'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    DashboardData,
    DetailedTopicMetrics,
    TelemetryRecord,
    KpiRecord,
    BucketDetails,
    TopicDetails,
    TableDetails
} from './interfaces';
import { PipelineFlowDiagram } from './components/PipelineFlowDiagram';
import { BronzeTopicCharts, SilverTelemetryPanel, GoldKpiPanel } from './components/LayerPanels';
import { ResourceDetailsModal } from './components/ResourceDetailsModal';
import { api } from '../lib/api';

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [activeScenario, setActiveScenario] = useState<'iot_processing' | 'future_scenario'>('iot_processing');
    const [actionLogs, setActionLogs] = useState<string[]>([]);
    const [isIngesting, setIsIngesting] = useState(false);

    // Simulated Time-Series State
    const [bronzeHistory, setBronzeHistory] = useState<{
        time: string;
        ingestion: number;
        processed: number;
        invalidated_count?: number;
        lag: number;
        queueDepth: number;
    }[]>([]);
    const [silverHistory, setSilverHistory] = useState<TelemetryRecord[]>([]);
    const [goldHistory, setGoldHistory] = useState<KpiRecord[]>([]);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedResourceType, setSelectedResourceType] = useState<'Topics' | 'Tables' | 'Buckets' | null>(null);
    const [resourceData, setResourceData] = useState<BucketDetails | TopicDetails | TableDetails | null>(null);
    const [fetchingData, setFetchingData] = useState(false);
    const [selectedResourceName, setSelectedResourceName] = useState<string | null>(null);

    // Queries
    const fetchResourceDetails = async (type: 'Topics' | 'Tables' | 'Buckets', name: string) => {
        setFetchingData(true);
        setSelectedResourceName(name);
        setResourceData(null);
        try {
            const data = await api.getResourceDetails(type, name);
            setResourceData(data);
        } catch (error) {
            console.error(`Failed to fetch details for ${type} ${name}`, error);
        } finally {
            setFetchingData(false);
        }
    };

    // Close modal on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setModalOpen(false);
        };
        if (modalOpen) {
            window.addEventListener('keydown', handleEscape);
        }
        return () => window.removeEventListener('keydown', handleEscape);
    }, [modalOpen]);

    const { data: dashboardData, isLoading } = useQuery<DashboardData>({
        queryKey: ['dashboardData'],
        queryFn: () => api.getDashboardData(),
        refetchInterval: 10000, // Background refresh every 10s
    });

    const readiness = dashboardData?.readiness || {
        bronze: { status: 'missing', details: {} },
        silver: { status: 'missing', details: {} },
        gold: { status: 'missing', details: {} }
    };

    const isConfigured = dashboardData?.configured || false;

    const isReady = (isConfigured &&
        readiness.bronze?.status === 'ready' &&
        readiness.silver?.status === 'ready' &&
        readiness.gold?.status === 'ready') || false;

    // Detailed Topic Metrics for visualization
    const { data: detailedMetrics } = useQuery<DetailedTopicMetrics>({
        queryKey: ['detailedTopicMetrics', 'manufacturing.telemetry.raw'],
        queryFn: () => api.getDetailedTopicMetrics('manufacturing.telemetry.raw'),
        enabled: isReady && !!readiness?.bronze?.details?.topic,
        refetchInterval: 2000, // Refresh every 2s for real-time feel
    });

    useEffect(() => {
        if (!detailedMetrics) return;

        const now = new Date().toLocaleTimeString();
        const newEntry = {
            time: now,
            ingestion: detailedMetrics.total_messages,
            processed: detailedMetrics.processed,
            invalidated_count: detailedMetrics.invalidated_count,
            lag: detailedMetrics.lag_seconds,
            queueDepth: detailedMetrics.queue_depth_percent,
        };

        setBronzeHistory(prev => {
            if (prev.length > 0 &&
                prev[prev.length - 1].ingestion === newEntry.ingestion &&
                prev[prev.length - 1].processed === newEntry.processed &&
                prev[prev.length - 1].lag === newEntry.lag) {
                return prev;
            }
            return [...prev, newEntry].slice(-30);
        });
    }, [detailedMetrics]);


    // Use an effect to merge new messages and table updates into a single feed
    const { data: silverRecordsResponse } = useQuery({
        queryKey: ['lastProcessedRecords'],
        queryFn: () => api.getSilverRecords(100),
        enabled: isReady,
        refetchInterval: 3000,
    });

    const lastProcessedRecords = silverRecordsResponse?.data || [];

    useEffect(() => {
        if (lastProcessedRecords && lastProcessedRecords.length > 0) {
            setSilverHistory(prev => {
                const latest = lastProcessedRecords[0];
                if (prev.length > 0 && prev[prev.length - 1].timestamp === latest.timestamp) {
                    return prev;
                }
                return [...prev, ...lastProcessedRecords].slice(-50);
            });
        }
    }, [lastProcessedRecords]);

    const { data: goldRecordsResponse } = useQuery({
        queryKey: ['lastGoldRecords'],
        queryFn: () => api.getGoldRecords(5),
        enabled: isReady,
        refetchInterval: 3000,
    });

    const lastGoldRecords = goldRecordsResponse?.data || [];

    useEffect(() => {
        if (lastGoldRecords && lastGoldRecords.length > 0) {
            setGoldHistory(prev => {
                const latest = lastGoldRecords[0];
                // Use a combination of fields for uniqueness if timestamp isn't available or reliable
                if (prev.length > 0 && JSON.stringify(prev[prev.length - 1]) === JSON.stringify(latest)) {
                    return prev;
                }
                return [...prev, ...lastGoldRecords].slice(-50);
            });
        }
    }, [lastGoldRecords]);

    const bootstrapMutation = useMutation({
        mutationFn: () => {
            setActionLogs(["Starting bootstrap..."]);
            return api.bootstrap();
        },
        onSuccess: (data) => {
            setActionLogs(data.logs || ["Bootstrap completed"]);
            queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
        },
        onError: () => {
            setActionLogs(prev => [...prev, "✕ Bootstrap failed"]);
        }
    });

    const scenarioMutation = useMutation({
        mutationFn: async ({ type, label }: { type: string; label: string }) => {
            if (type === 'iot_streaming') {
                setIsIngesting(true);
                try {
                    return await api.runScenario(type);
                } finally {
                    setTimeout(() => {
                        setIsIngesting(false);
                    }, 1000);
                }
            } else {
                setActionLogs([`Starting ${label}...`]);
                return api.runScenario(type);
            }
        },
        onSuccess: (data) => {
            if (data.logs?.length) {
                setActionLogs(data.logs);
            } else {
                setActionLogs([data.message]);
            }
            queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
            queryClient.invalidateQueries({ queryKey: ['topicMetrics'] });
        },
        onError: () => {
            setActionLogs(prev => [...prev, "✕ Scenario execution error"]);
        }
    });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                    <p>Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    const formatTime = (isoString?: string) => {
        // return as is if not an ISO string
        if (!isoString) return isoString;
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-UK', {
                hour12: false,
                day: '2-digit',
                month: 'short',
                // year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return 'N/A';
        }
    };


    return (
        <div className="space-y-8">
            {!isConfigured && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-amber-400">Connection not configured.</span>
                    <Link href="/admin" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                        Configure
                    </Link>
                </div>
            )}

            {isConfigured && !isReady && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 text-center">
                    <h3 className="text-xl font-semibold text-blue-500 mb-2">Demo Resources Missing</h3>
                    <p className="text-muted-foreground mb-4">
                        The demo requires specific volumes, topics, and tables to show the end-to-end flow.
                    </p>
                    <button
                        onClick={() => bootstrapMutation.mutate()}
                        disabled={bootstrapMutation.isPending}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-all shadow-lg hover:shadow-blue-500/20"
                    >
                        {bootstrapMutation.isPending ? (
                            <span className="flex items-center justify-center">
                                <span className="animate-spin mr-2">⟳</span> Bootstrapping...
                            </span>
                        ) : (
                            "Bootstrap Demo Resources"
                        )}
                    </button>
                </div>
            )}

            {isConfigured && isReady && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Left 3 Columns: Pipeline Stages */}
                        <div className="lg:col-span-3 space-y-6">
                            {/* Scenario Selector Tabs */}
                            <div className="flex border-b border-border space-x-8">
                                {[
                                    { id: 'iot_processing', label: 'IoT Processing', icon: '🏭' },
                                ].map((scenario) => (
                                    <button
                                        key={scenario.id}
                                        onClick={() => setActiveScenario(scenario.id as any)}
                                        className={`flex items-center gap-2 pb-4 text-sm font-medium transition-all relative ${activeScenario === scenario.id
                                            ? 'text-indigo-500'
                                            : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <span>{scenario.icon}</span>
                                        {scenario.label}
                                        {activeScenario === scenario.id && (
                                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 animate-in fade-in duration-300"></div>
                                        )}
                                    </button>
                                ))}
                                <div className="pb-4 text-xs text-muted-foreground/50 flex items-center italic">
                                    + More scenarios coming soon
                                </div>
                            </div>

                            {activeScenario === 'iot_processing' && (
                                <div className='space-y-6'>
                                    {/* Medallion Layers (Overview) */}
                                    {dashboardData?.readiness && (
                                        <PipelineFlowDiagram
                                            readiness={dashboardData.readiness}
                                            onResourceClick={(type, name) => {
                                                setSelectedResourceType(type);
                                                setModalOpen(true);
                                                fetchResourceDetails(type, name);
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                            <div>
                                <button
                                    onClick={() => scenarioMutation.mutate({ type: 'iot_streaming', label: 'Ingestion' })}
                                    disabled={isIngesting || scenarioMutation.isPending}
                                    className="w-full flex flex-col items-center justify-center p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:bg-amber-500/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 group"
                                >
                                    <span className="text-2xl mb-1 group-hover:animate-bounce">⚡</span>
                                    <span className="font-semibold text-sm">Start Real-time Stream</span>
                                    <span className="text-[10px] text-muted-foreground mt-1">100 msgs / batch</span>
                                </button>
                            </div>
                            {/* Layer Specific Details & Controls */}
                            <div className="space-y-6">
                                <BronzeTopicCharts
                                    detailedMetrics={detailedMetrics}
                                    history={bronzeHistory}
                                    formatTime={formatTime}
                                />
                                <SilverTelemetryPanel
                                    lastProcessedRecords={lastProcessedRecords}
                                    silverData={silverHistory}
                                />
                                <GoldKpiPanel
                                    lastGoldRecords={lastGoldRecords}
                                    goldData={goldHistory}
                                />

                            </div>
                        </div>

                        {/* Right Column: Platform Unified Feed & Discovery */}
                        <div className="space-y-6 lg:border-l lg:border-border lg:pl-6">
                            {/* Summary Widget */}
                            <div className="bg-muted/10 border border-indigo-500/10 rounded-2xl p-5 space-y-4">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                    Unified Data Fabric
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-muted-foreground">Kafka Topics</span>
                                        <span className="text-xs font-bold font-mono">{dashboardData?.readiness && dashboardData.topics.length}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-muted-foreground">S3 Buckets</span>
                                        <span className="text-xs font-bold font-mono">{dashboardData?.readiness && dashboardData.buckets.length}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className="text-[10px] text-muted-foreground">Iceberg Tables</span>
                                        <span className="text-xs font-bold font-mono">{dashboardData?.readiness && dashboardData.tables.length}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Integrated Real-time Feed */}
                            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col h-[480px]">
                                <div className="bg-muted/40 p-4 border-b border-border flex justify-between items-center">
                                    <h3 className="text-xs font-bold flex items-center gap-2 uppercase tracking-tight">
                                        📡 System Live Feed
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span className="text-[8px] font-bold text-emerald-500 uppercase">Live</span>
                                    </div>
                                </div>
                                <div className="flex-1 p-3 overflow-y-auto font-mono text-[10px] space-y-3 bg-muted/80">
                                    {actionLogs.map((log, idx) => (
                                        <div key={`act-${idx}`} className="text-muted-foreground border-l border-white/10 pl-2 py-0.5 italic">
                                            👉 {log}
                                        </div>
                                    ))}
                                    {!actionLogs.length && (
                                        <div className="h-full flex items-center justify-center opacity-30 italic text-center px-4">
                                            Waiting for activity...
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}


            <ResourceDetailsModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setResourceData(null); setSelectedResourceName(null); }}
                type={selectedResourceType}
                name={selectedResourceName}
                data={resourceData}
                isFetching={fetchingData}
                onBackToList={() => { setResourceData(null); setSelectedResourceName(null); }}
            />

        </div>
    );
}
