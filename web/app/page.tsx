'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardData, ScenarioResult, BootstrapResult } from './interfaces';
import { StatusItem, ResourceStat } from './components/DashboardComponents';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [actionLogs, setActionLogs] = useState<string[]>([]);

    // Queries
    const { data: dashboardData, isLoading, isError } = useQuery<DashboardData>({
        queryKey: ['dashboardData'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/dashboard/data`);
            if (!res.ok) throw new Error('Failed to fetch dashboard data');
            return res.json();
        },
        refetchInterval: 10000, // Background refresh every 10s
    });

    // Mutations
    const discoverMutation = useMutation({
        mutationFn: async () => {
            await fetch(`${API_BASE}/profile/services`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
        },
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
            setActionLogs([`Starting ${label}...`]);
            const res = await fetch(`${API_BASE}/profile/scenarios/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile_id: 'default', scenario_type: type })
            });
            if (!res.ok) throw new Error('Scenario failed');
            return res.json() as Promise<ScenarioResult>;
        },
        onSuccess: (data) => {
            setActionLogs(data.logs?.length ? data.logs : [data.message]);
            queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
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

    const isConfigured = dashboardData?.configured || false;
    const readiness = dashboardData?.readiness || {
        bronze: { status: 'missing', details: {} },
        silver: { status: 'missing', details: {} },
        gold: { status: 'missing', details: {} }
    };

    const isReady = readiness.bronze.status === 'ready' &&
        readiness.silver.status === 'ready' &&
        readiness.gold.status === 'ready';

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                    Data Pipeline Dashboard
                </h2>
                <div className="flex items-center space-x-4">
                    {!isConfigured ? (
                        <Link href="/settings" className="flex items-center space-x-2 px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors shadow-sm">
                            <span className="text-xs font-bold uppercase tracking-wider">Not Configured</span>
                            <span>❌</span>
                        </Link>
                    ) : !isReady ? (
                        <button
                            onClick={() => discoverMutation.mutate()}
                            disabled={discoverMutation.isPending}
                            className="flex items-center space-x-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors shadow-sm disabled:opacity-50"
                        >
                            <span className="text-xs font-bold uppercase tracking-wider">
                                {discoverMutation.isPending ? 'Checking...' : 'Resources Missing'}
                            </span>
                            <span className={discoverMutation.isPending ? 'animate-spin' : ''}>⚠️</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => discoverMutation.mutate()}
                            disabled={discoverMutation.isPending}
                            className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors shadow-sm disabled:opacity-50"
                        >
                            <span className="text-xs font-bold uppercase tracking-wider">
                                {discoverMutation.isPending ? 'Refreshing...' : 'System Ready'}
                            </span>
                            <span className={discoverMutation.isPending ? 'animate-spin' : ''}>✅</span>
                        </button>
                    )}
                </div>
            </div>

            {!isConfigured && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-amber-400">Connection not configured.</span>
                    <Link href="/settings" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
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

            {/* Main Pipeline Visualization */}
            {isConfigured && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                    <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-border -z-10 transform -translate-y-1/2"></div>

                    {/* Bronze Layer */}
                    <div className={`relative bg-card border ${readiness.bronze.status === 'ready' ? 'border-amber-500/50 shadow-lg shadow-amber-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-amber-500/80`}>
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 text-2xl border border-amber-500/20">
                            🥉
                        </div>
                        <h3 className="text-lg font-bold text-amber-600 dark:text-amber-500 mb-2">Bronze Layer</h3>
                        <p className="text-xs text-muted-foreground mb-4">Raw telemetry ingestion</p>

                        <div className="w-full space-y-2 mb-6 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                            <StatusItem label="Volume: bronze" active={readiness.bronze.details.volume} />
                            <StatusItem label="Topic: telemetry.raw" active={readiness.bronze.details.topic} />
                            <StatusItem label="Bucket: bronze-raw" active={readiness.bronze.details.bucket} />
                        </div>

                        <div className="mt-auto w-full">
                            <button
                                onClick={() => scenarioMutation.mutate({ type: 'simulate_ingestion', label: 'Ingestion' })}
                                disabled={readiness.bronze.status !== 'ready' || scenarioMutation.isPending}
                                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {scenarioMutation.isPending && scenarioMutation.variables?.type === 'simulate_ingestion' ? 'Ingesting...' : 'Ingest Data'}
                            </button>
                        </div>
                    </div>

                    {/* Silver Layer */}
                    <div className={`relative bg-card border ${readiness.silver.status === 'ready' ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-indigo-500/80`}>
                        <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 text-2xl border border-indigo-500/20">
                            🥈
                        </div>
                        <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mb-2">Silver Layer</h3>
                        <p className="text-xs text-muted-foreground mb-4">Cleansed & Enriched</p>

                        <div className="w-full space-y-2 mb-6 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                            <StatusItem label="Volume: silver" active={readiness.silver.details.volume} />
                            <StatusItem label="Table: telemetry.cleansed" active={readiness.silver.details.table} />
                            <StatusItem label="Bucket: silver-processed" active={readiness.silver.details.bucket} />
                        </div>

                        <div className="mt-auto w-full">
                            <button
                                onClick={() => scenarioMutation.mutate({ type: 'process_data', label: 'Processing' })}
                                disabled={readiness.silver.status !== 'ready' || scenarioMutation.isPending}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {scenarioMutation.isPending && scenarioMutation.variables?.type === 'process_data' ? 'Processing...' : 'Process Data'}
                            </button>
                        </div>
                    </div>

                    {/* Gold Layer */}
                    <div className={`relative bg-card border ${readiness.gold.status === 'ready' ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/5' : 'border-border'} rounded-xl p-6 flex flex-col items-center text-center transition-all hover:border-yellow-500/80`}>
                        <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4 text-2xl border border-yellow-500/20">
                            🥇
                        </div>
                        <h3 className="text-lg font-bold text-yellow-600 dark:text-yellow-400 mb-2">Gold Layer</h3>
                        <p className="text-xs text-muted-foreground mb-4">Aggregated KPIs</p>

                        <div className="w-full space-y-2 mb-6 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                            <StatusItem label="Volume: gold" active={readiness.gold.details.volume} />
                            <StatusItem label="Table: manufacturing.kpis" active={readiness.gold.details.table} />
                            <StatusItem label="Bucket: gold-curated" active={readiness.gold.details.bucket} />
                        </div>

                        <div className="mt-auto w-full">
                            <button
                                onClick={() => scenarioMutation.mutate({ type: 'curate_data', label: 'Generating KPIs' })}
                                disabled={readiness.gold.status !== 'ready' || scenarioMutation.isPending}
                                className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {scenarioMutation.isPending && scenarioMutation.variables?.type === 'curate_data' ? 'Calculating...' : 'Generate KPIs'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Output */}
            {actionLogs.length > 0 && (
                <div className="bg-muted/50 border border-border rounded-xl p-4 font-mono text-sm max-h-64 overflow-y-auto shadow-inner">
                    <div className="flex justify-between items-center mb-3 border-b border-border pb-2">
                        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Activity Log</span>
                        <button onClick={() => setActionLogs([])} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Clear</button>
                    </div>
                    <div className="space-y-1.5">
                        {actionLogs.map((log, idx) => (
                            <div key={idx} className={`${log.includes('✕') ? 'text-red-500 dark:text-red-400' :
                                log.includes('→') ? 'text-muted-foreground' :
                                    log.includes('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/80'
                                }`}>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Underlying Resources View */}
            <div className="pt-8 border-t border-border">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">Underlying Resources</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <ResourceStat label="Volumes" count={dashboardData?.volumes?.length || 0} />
                    <ResourceStat label="Topics" count={dashboardData?.topics?.length || 0} />
                    <ResourceStat label="Tables" count={dashboardData?.tables?.length || 0} />
                    <ResourceStat label="Buckets" count={dashboardData?.buckets?.length || 0} />
                </div>
            </div>
        </div>
    );
}
