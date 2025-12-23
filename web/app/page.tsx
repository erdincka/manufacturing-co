'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardData, ScenarioResult, BootstrapResult } from './interfaces';
import { StatusItem } from './components/DashboardComponents';

import { ProcessingStatus } from './components/ProcessingStatus';

interface DetailedTopicMetrics {
    topic: string;
    total_messages: number;
    in_queue: number;
    processed: number;
    latest_message_timestamp?: string;
    last_processed_timestamp?: string;
    lag_seconds: number;
    processing_rate: number;
    queue_depth_percent: number;
}


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [activeScenario, setActiveScenario] = useState<'iot_processing' | 'future_scenario'>('iot_processing');
    const [actionLogs, setActionLogs] = useState<string[]>([]);
    const [isIngesting, setIsIngesting] = useState(false);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedResourceType, setSelectedResourceType] = useState<'Topics' | 'Tables' | 'Buckets' | null>(null);
    const [resourceData, setResourceData] = useState<any>(null);
    const [fetchingData, setFetchingData] = useState(false);
    const [selectedResourceName, setSelectedResourceName] = useState<string | null>(null);

    // Queries
    const fetchResourceDetails = async (type: string, name: string) => {
        setFetchingData(true);
        setSelectedResourceName(name);
        setResourceData(null);
        try {
            let url = "";
            if (type === 'Buckets') url = `${API_BASE}/buckets/${name}/objects`;
            else if (type === 'Topics') url = `${API_BASE}/topics/${name}/metrics`;
            else if (type === 'Tables') url = `${API_BASE}/tables/${name}/data`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setResourceData(data);
            }
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

    const { data: dashboardData, isLoading, isError } = useQuery<DashboardData>({
        queryKey: ['dashboardData'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/dashboard/data`);
            if (!res.ok) throw new Error(`Failed to fetch dashboard data: ${isError}`);
            return res.json();
        },
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
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/topics/manufacturing.telemetry.raw/detailed-metrics`);
            if (!res.ok) throw new Error('Failed to fetch detailed metrics');
            return res.json();
        },
        enabled: isReady && !!readiness?.bronze?.details?.topic,
        refetchInterval: 2000, // Refresh every 2s for real-time feel
    });


    // Use an effect to merge new messages and table updates into a single feed
    const { data: lastProcessedRecords } = useQuery({
        queryKey: ['lastProcessedRecords'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/tables/telemetry.cleansed/data?limit=5`);
            return res.json();
        },
        enabled: isReady,
        refetchInterval: 3000,
    });

    const { data: lastGoldRecords } = useQuery({
        queryKey: ['lastGoldRecords'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/tables/manufacturing.kpis/data?limit=5`);
            return res.json();
        },
        enabled: isReady,
        refetchInterval: 3000,
    });

    const bootstrapMutation = useMutation({
        mutationFn: async () => {
            setActionLogs(["Starting bootstrap..."]);
            const res = await fetch(`${API_BASE}/profile/bootstrap`, { method: 'POST' });
            if (!res.ok) throw new Error('Bootstrap failed');
            return res.json() as Promise<BootstrapResult>;
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
        mutationFn: async ({ type, label }: { type: string, label: string }) => {
            if (type === 'iot_streaming') {
                setIsIngesting(true);
                try {
                    const res = await fetch(`${API_BASE}/profile/scenarios/run`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profile_id: 'default', scenario_type: type })
                    });
                    if (!res.ok) throw new Error('Scenario failed');
                    return res.json() as Promise<ScenarioResult>;
                } catch (e) {
                    throw e;
                } finally {
                    setTimeout(() => {
                        setIsIngesting(false);
                    }, 1000);
                }
            } else {
                setActionLogs([`Starting ${label}...`]);
                const res = await fetch(`${API_BASE}/profile/scenarios/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile_id: 'default', scenario_type: type })
                });
                if (!res.ok) throw new Error('Scenario failed');
                return res.json() as Promise<ScenarioResult>;
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
                <div className="space-y-6">
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
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {/* Left 3 Columns: Pipeline Stages */}
                            <div className="lg:col-span-3 space-y-8">
                                {/* Medallion Layers (Overview) */}
                                {dashboardData?.readiness && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                                        <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-border -z-10 transform -translate-y-1/2"></div>

                                        {/* Bronze Layer */}
                                        <div className={`relative bg-card border ${dashboardData.readiness.bronze?.status === 'ready' ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-amber-500/80 group`}>
                                            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 text-2xl border border-amber-500/20 group-hover:scale-110 transition-transform">
                                                🥉
                                            </div>
                                            <h3 className="text-lg font-bold text-amber-600 dark:text-amber-500 mb-2">Bronze Layer</h3>
                                            <p className="text-xs text-muted-foreground mb-4">Raw telemetry ingestion</p>
                                            <div className="w-full space-y-2 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                                                <StatusItem label="Topic: telemetry.raw" active={dashboardData.readiness.bronze?.details?.topic} onClick={() => { setSelectedResourceType('Topics'); setModalOpen(true); fetchResourceDetails('Topics', 'manufacturing.telemetry.raw'); }} />
                                                <StatusItem label="Bucket: bronze-raw" active={dashboardData.readiness.bronze?.details?.bucket} onClick={() => { setSelectedResourceType('Buckets'); setModalOpen(true); fetchResourceDetails('Buckets', 'bronze-raw'); }} />
                                            </div>
                                        </div>

                                        {/* Silver Layer */}
                                        <div className={`relative bg-card border ${dashboardData.readiness.silver?.status === 'ready' ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-indigo-500/80 group`}>
                                            <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 text-2xl border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                                🥈
                                            </div>
                                            <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-2">Silver Layer</h3>
                                            <p className="text-xs text-muted-foreground mb-4">Cleansed & Enriched</p>
                                            <div className="w-full space-y-2 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                                                <StatusItem label="Table: telemetry.cleansed" active={dashboardData.readiness.silver?.details?.table} onClick={() => { setSelectedResourceType('Tables'); setModalOpen(true); fetchResourceDetails('Tables', 'telemetry.cleansed'); }} />
                                                <StatusItem label="Bucket: silver-processed" active={dashboardData.readiness.silver?.details?.bucket} onClick={() => { setSelectedResourceType('Buckets'); setModalOpen(true); fetchResourceDetails('Buckets', 'silver-processed'); }} />
                                            </div>
                                        </div>

                                        {/* Gold Layer */}
                                        <div className={`relative bg-card border ${dashboardData.readiness.gold?.status === 'ready' ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-yellow-500/80 group`}>
                                            <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4 text-2xl border border-yellow-500/20 group-hover:scale-110 transition-transform">
                                                🥇
                                            </div>
                                            <h3 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-2">Gold Layer</h3>
                                            <p className="text-xs text-muted-foreground mb-4">Aggregated KPIs</p>
                                            <div className="w-full space-y-2 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                                                <StatusItem label="Table: manufacturing.kpis" active={dashboardData?.readiness?.gold?.details?.table} onClick={() => { setSelectedResourceType('Tables'); setModalOpen(true); fetchResourceDetails('Tables', 'manufacturing.kpis'); }} />
                                                <StatusItem label="Bucket: gold-curated" active={dashboardData?.readiness?.gold?.details?.bucket} onClick={() => { setSelectedResourceType('Buckets'); setModalOpen(true); fetchResourceDetails('Buckets', 'gold-curated'); }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Layer Specific Details & Controls */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* BRONZE CONTROLS */}
                                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col">
                                        <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                            Bronze Ingestion
                                        </h4>
                                        <div className="mb-6">
                                            <ProcessingStatus
                                                latestMessageTime={detailedMetrics?.latest_message_timestamp}
                                                lastProcessedTime={detailedMetrics?.last_processed_timestamp}
                                                lagSeconds={detailedMetrics?.lag_seconds || 0}
                                            />
                                        </div>
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

                                    {/* SILVER & GOLD PREVIEW */}
                                    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col">
                                        <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                            Live Pipeline Preview
                                        </h4>
                                        <div className="flex-1 space-y-3">
                                            <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                                                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Cleansed Feed (Silver)</p>
                                                <div className="space-y-1">
                                                    {lastProcessedRecords?.slice(0, 3).map((rec: any, i: number) => (
                                                        <div key={i} className="flex justify-between text-[9px] font-mono border-b border-border/30 pb-1 last:border-0">
                                                            <span className="text-muted-foreground truncate max-w-[80px]">{rec.device_id}</span>
                                                            <span className="text-foreground">{rec.temperature?.toFixed(1)}°C</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                                                <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider mb-2">KPI Metrics (Gold)</p>
                                                <div className="space-y-1">
                                                    {lastGoldRecords?.slice(0, 2).map((rec: any, i: number) => (
                                                        <div key={i} className="flex justify-between text-[9px] font-mono border-b border-border/30 pb-1 last:border-0">
                                                            <span className="text-muted-foreground">Events Count</span>
                                                            <span className="text-foreground">{rec.total_events}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
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
                                            <span className="text-[10px] text-muted-foreground">Active Topics</span>
                                            <span className="text-xs font-bold font-mono">1</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] text-muted-foreground">Iceberg Catalogs</span>
                                            <span className="text-xs font-bold font-mono">1</span>
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
                                    <div className="flex-1 p-3 overflow-y-auto font-mono text-[10px] space-y-3 bg-[#050505]">
                                        {actionLogs.map((log, idx) => (
                                            <div key={`act-${idx}`} className="text-muted-foreground border-l border-white/10 pl-2 py-0.5 italic">
                                                👉 {log}
                                            </div>
                                        ))}
                                        {!actionLogs.length && (
                                            <div className="h-full flex items-center justify-center opacity-30 italic text-center px-4">
                                                Waiting for platform activity...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Resource Details Modal */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setModalOpen(false)}
                >
                    <div
                        className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-6 border-b border-border bg-muted/30">
                            <h3 className="text-xl font-bold">
                                {selectedResourceName ? `${selectedResourceName} (${selectedResourceType})` : `${selectedResourceType} Details`}
                            </h3>
                            <button
                                onClick={() => { setModalOpen(false); setResourceData(null); setSelectedResourceName(null); }}
                                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            {fetchingData ? (
                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                                    <p className="text-muted-foreground animate-pulse text-sm font-medium">Fetching real-time data...</p>
                                </div>
                            ) : resourceData ? (
                                <div className="space-y-6">
                                    {selectedResourceType === 'Buckets' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between px-2">
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Objects</h4>
                                                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-mono">{resourceData.length} items</span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {resourceData.map((o: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3 bg-muted/40 border border-border/50 rounded-xl hover:bg-muted/60 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xl">📦</span>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-sm">{o.key}</span>
                                                                <span className="text-[10px] text-muted-foreground">{new Date(o.last_modified).toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-xs font-mono text-muted-foreground">{(o.size / 1024).toFixed(2)} KB</span>
                                                    </div>
                                                ))}
                                                {resourceData.length === 0 && (
                                                    <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border text-muted-foreground text-sm italic">
                                                        Bucket is empty
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {selectedResourceType === 'Topics' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                                    <div className="text-xl font-bold text-emerald-500 font-mono">{resourceData.messages_count.toLocaleString()}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Total</div>
                                                </div>
                                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                                    <div className="text-xl font-bold text-emerald-500 font-mono">{resourceData.in_queue.toLocaleString()}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">In Queue</div>
                                                </div>
                                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                                    <div className="text-xl font-bold text-emerald-500 font-mono">{resourceData.partitions}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Partitions</div>
                                                </div>
                                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                                    <div className="text-xl font-bold text-emerald-500 font-mono">{resourceData.consumers}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Consumers</div>
                                                </div>
                                                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                                    <div className="text-xl font-bold text-emerald-500 font-mono">{resourceData.delay_seconds}s</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Delay</div>
                                                </div>
                                            </div>



                                            <div className="space-y-3">
                                                <h4 className="text-sm font-semibold px-2 uppercase tracking-wider text-muted-foreground">Most Recent Message</h4>
                                                <div className="bg-muted/80 backdrop-blur-sm border border-border rounded-xl p-5 overflow-hidden shadow-inner">
                                                    {resourceData.recent_message ? (
                                                        <pre className="text-xs font-mono text-emerald-500/90 whitespace-pre-wrap break-all leading-relaxed">
                                                            {typeof resourceData.recent_message === 'string' && resourceData.recent_message.startsWith('{')
                                                                ? JSON.stringify(JSON.parse(resourceData.recent_message), null, 2)
                                                                : resourceData.recent_message}
                                                        </pre>
                                                    ) : (
                                                        <div className="text-center py-4 text-muted-foreground text-sm italic">No messages processed yet</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {selectedResourceType === 'Tables' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between px-2">
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Table Sample</h4>
                                                <span className="text-[10px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded-full font-mono">{resourceData.length} records</span>
                                            </div>
                                            <div className="border border-border/50 rounded-xl overflow-hidden shadow-lg bg-background/50 backdrop-blur-md">
                                                {resourceData.length > 0 ? (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[11px] text-left">
                                                            <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground">
                                                                <tr>
                                                                    {Object.keys(resourceData[0]).map(k => (
                                                                        <th key={k} className="px-4 py-3 font-bold uppercase tracking-tighter whitespace-nowrap">{k}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-border/30">
                                                                {resourceData.map((row: any, i: number) => (
                                                                    <tr key={i} className="hover:bg-cyan-500/5 transition-colors">
                                                                        {Object.values(row).map((v: any, j: number) => (
                                                                            <td key={j} className="px-4 py-2.5 font-mono text-foreground/80 whitespace-nowrap">
                                                                                {v?.toString() || 'null'}
                                                                            </td>
                                                                        ))}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-20 bg-muted/20 text-muted-foreground text-sm italic font-medium">
                                                        Table contains no data
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {selectedResourceType === 'Topics' && dashboardData?.topics?.map((t: any, i: number) => (
                                        <div key={i} className="bg-muted/50 border border-border rounded-xl p-4 hover:border-emerald-500/40 transition-all group cursor-pointer" onClick={() => fetchResourceDetails('Topics', t.name)}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-emerald-500 text-lg group-hover:underline">{t.name}</span>
                                                <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full">{t.partitions} Partitions</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border/50">
                                                Replication Factor: {t.replication || 'Unknown'}
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border/30 flex justify-end">
                                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider group-hover:animate-pulse">View Real-time Metrics &rarr;</span>
                                            </div>
                                        </div>
                                    ))}

                                    {selectedResourceType === 'Tables' && dashboardData?.tables?.map((t: any, i: number) => (
                                        <div key={i} className="bg-muted/50 border border-border rounded-xl p-4 hover:border-cyan-500/40 transition-all group cursor-pointer" onClick={() => fetchResourceDetails('Tables', t.name)}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-cyan-500 text-lg group-hover:underline">{t.name}</span>
                                                <span className="text-xs px-2 py-1 bg-cyan-500/10 text-cyan-500 rounded-full font-mono">{t.namespace}</span>
                                            </div>
                                            <div className="space-y-2 mt-3">
                                                <div className="text-xs">
                                                    <span className="text-muted-foreground block mb-1 uppercase tracking-wider font-semibold">Schema</span>
                                                    <div className="bg-background/50 p-2 rounded border border-border/50 font-mono text-[10px] break-all">
                                                        {t.schema || 'No schema info available'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border/30 flex justify-end">
                                                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider group-hover:animate-pulse">Sample Data &rarr;</span>
                                            </div>
                                        </div>
                                    ))}

                                    {selectedResourceType === 'Buckets' && dashboardData?.buckets?.map((b: any, i: number) => (
                                        <div key={i} className="bg-muted/50 border border-border rounded-xl p-4 flex justify-between items-center hover:border-amber-500/40 transition-all group cursor-pointer" onClick={() => fetchResourceDetails('Buckets', b.name)}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center text-amber-500">🪣</div>
                                                <span className="font-bold text-amber-500 group-hover:underline">{b.name}</span>
                                            </div>
                                            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider group-hover:animate-pulse">Browse Objects &rarr;</span>
                                        </div>
                                    ))}

                                    {(!dashboardData?.[selectedResourceType?.toLowerCase() as keyof DashboardData] || (dashboardData?.[selectedResourceType?.toLowerCase() as keyof DashboardData] as any[]).length === 0) && (
                                        <div className="text-center py-12 text-muted-foreground italic">
                                            No {selectedResourceType?.toLowerCase()} found.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-border bg-muted/30 flex justify-between items-center">
                            {resourceData && (
                                <button
                                    onClick={() => { setResourceData(null); setSelectedResourceName(null); }}
                                    className="text-xs text-indigo-500 hover:underline font-bold uppercase tracking-widest"
                                >
                                    &larr; Back to List
                                </button>
                            )}
                            <button
                                onClick={() => { setModalOpen(false); setResourceData(null); setSelectedResourceName(null); }}
                                className="px-6 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors border border-border font-medium"
                            >
                                Close
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}
