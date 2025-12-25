'use client';

import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ChartData,
    ChartOptions
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { DetailedTopicMetrics, TelemetryRecord, KpiRecord } from '../interfaces';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const commonOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            labels: { color: '#94a3b8', font: { size: 10 } }
        },
    },
    scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
    }
};

interface BronzeTopicChartsProps {
    detailedMetrics?: DetailedTopicMetrics;
    history: {
        time: string;
        ingestion: number;
        processed: number;
        lag: number;
        queueDepth: number;
    }[];
    formatTime: (isoString?: string) => string | undefined;
}

export function BronzeTopicCharts({ detailedMetrics, history, formatTime }: BronzeTopicChartsProps) {
    const bronzeLineData: ChartData<'line'> = {
        labels: history.map(h => h.time),
        datasets: [
            {
                label: 'Ingestion (Total)',
                data: history.map(h => h.ingestion),
                borderColor: 'rgb(245, 158, 11)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                fill: true,
                tension: 0.4,
            },
            {
                label: 'Processed',
                data: history.map(h => h.processed),
                borderColor: 'rgb(16, 185, 129)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
            }
        ],
    };

    const bronzeAreaData: ChartData<'line'> = {
        labels: history.map(h => h.time),
        datasets: [
            {
                label: 'Lag (Seconds)',
                data: history.map(h => h.lag),
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                fill: true,
                tension: 0.4,
            },
            {
                label: 'Queue Depth %',
                data: history.map(h => h.queueDepth),
                borderColor: 'rgb(99, 102, 241)',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                fill: true,
                tension: 0.4,
            }
        ],
    };

    return (
        <div className="md:col-span-3 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-muted/40 p-4 border-b border-border">
                <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    Live Status (Bronze)
                </h3>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col items-center text-center transition-all group">
                        <div className="flex-1 space-y-3 w-full">
                            <div className="bg-muted/30 p-3 rounded-xl border border-border/50">
                                {detailedMetrics && (Object.keys(detailedMetrics) as Array<keyof DetailedTopicMetrics>)
                                    .filter(m => typeof detailedMetrics[m] !== 'undefined')
                                    .map(metric => {
                                        const metricStr = String(metric);
                                        return (
                                            <div key={metricStr} className="flex justify-between text-[10px] font-mono border-b border-border/30 pb-1 last:border-0">
                                                <span className="text-muted-foreground">{metricStr.replaceAll("_", " ").replace(" timestamp", "").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                                                <span className="text-foreground">
                                                    {metricStr.includes('timestamp') ? formatTime(detailedMetrics[metric] as string) : detailedMetrics[metric]}
                                                    {metricStr === 'processed' && typeof detailedMetrics.invalidated_count === 'number' && detailedMetrics.invalidated_count > 0 && (
                                                        <span className="text-amber-500 ml-1" title="Invalidated messages">
                                                            ({detailedMetrics.invalidated_count} invalid)
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ingestion vs Processing</h3>
                        <div className="h-48">
                            <Line data={bronzeLineData} options={commonOptions as ChartOptions<'line'>} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lag & Queue Depth</h3>
                        <div className="h-48">
                            <Line data={bronzeAreaData} options={commonOptions as ChartOptions<'line'>} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface SilverTelemetryPanelProps {
    lastProcessedRecords?: TelemetryRecord[];
    silverData?: TelemetryRecord[];
}

export function SilverTelemetryPanel({ lastProcessedRecords, silverData }: SilverTelemetryPanelProps) {
    const devices = useMemo(() => {
        const devMap: Record<string, TelemetryRecord[]> = {};
        silverData?.forEach(d => {
            if (!devMap[d.device_id]) devMap[d.device_id] = [];
            devMap[d.device_id].push(d);
        });
        return devMap;
    }, [silverData]);

    return (
        <div className="md:col-span-3 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-muted/40 p-4 border-b border-border">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></span>
                    Live Status (Silver)
                </h3>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col items-center text-center transition-all group">
                        <div className="flex-1 space-y-3 w-full">
                            <div className="bg-muted/30 p-3 rounded-xl border border-border/50 h-full">
                                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Cleansed Feed (Silver)</p>
                                <div className="space-y-1">
                                    {lastProcessedRecords?.slice(0, 6).map((rec, i) => (
                                        <div key={i} className="flex justify-between text-[9px] font-mono border-b border-border/30 pb-1 last:border-0">
                                            <span className="text-muted-foreground truncate max-w-[80px]">{rec.device_id}</span>
                                            <span className="text-muted-foreground truncate max-w-[109px]">{rec.timestamp}</span>
                                            <span className="text-foreground">{rec.temperature?.toFixed(1)}°C</span>
                                        </div>
                                    ))}
                                </div>
                                <code>{JSON.stringify(lastProcessedRecords?.length, null, 2)}</code>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 md:col-span-2">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Device Temperatures</h3>
                        <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                            <div className="h-64">
                                <Line
                                    data={{
                                        labels: Array.from({ length: Math.max(0, ...Object.values(devices).map(r => r.length)) }, (_, i) => i),
                                        datasets: Object.entries(devices).map(([deviceId, readings], idx) => {
                                            const colors = [
                                                'rgb(99, 102, 241)', // Indigo
                                                'rgb(16, 185, 129)', // Emerald
                                                'rgb(245, 158, 11)', // Amber
                                                'rgb(239, 68, 68)',  // Red
                                                'rgb(168, 85, 247)', // Purple
                                                'rgb(236, 72, 153)', // Pink
                                            ];
                                            return {
                                                label: deviceId,
                                                data: readings.map(r => r.temperature),
                                                borderColor: colors[idx % colors.length],
                                                backgroundColor: colors[idx % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
                                                borderWidth: 2,
                                                tension: 0.3,
                                                pointRadius: 2,
                                            };
                                        })
                                    }}
                                    options={{
                                        ...commonOptions,
                                        plugins: {
                                            ...commonOptions.plugins,
                                            legend: {
                                                display: true,
                                                position: 'top' as const,
                                                labels: { boxWidth: 10, font: { size: 9 } }
                                            }
                                        },
                                        scales: {
                                            x: { display: true, ticks: { display: false } },
                                            y: { min: 40, max: 110, ticks: { stepSize: 10, font: { size: 8 } } }
                                        }
                                    } as ChartOptions<'line'>}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface GoldKpiPanelProps {
    lastGoldRecords?: KpiRecord[];
    goldData?: KpiRecord[];
}

export function GoldKpiPanel({ lastGoldRecords, goldData }: GoldKpiPanelProps) {
    const goldChartData: ChartData<'bar' | 'line'> = {
        labels: goldData?.map((_, i) => `W${i + 1}`),
        datasets: [
            {
                type: 'bar' as const,
                label: 'Total Events',
                data: goldData?.map(d => d.total_events) || [],
                backgroundColor: 'rgba(234, 179, 8, 0.6)',
                yAxisID: 'y',
            },
            {
                type: 'line' as const,
                label: 'Avg Temp',
                data: goldData?.map(d => d.avg_temp) || [],
                borderColor: 'rgb(249, 115, 22)',
                borderWidth: 2,
                fill: false,
                yAxisID: 'y1',
            },
            {
                type: 'line' as const,
                label: 'Anomaly Count',
                data: goldData?.map(d => d.anomaly_count) || [],
                borderColor: 'rgb(220, 38, 38)',
                borderWidth: 2,
                fill: false,
                yAxisID: 'y',
            }
        ],
    };

    return (
        <div className="md:col-span-3 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-muted/40 p-4 border-b border-border">
                <h3 className="text-xs font-bold text-yellow-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                    Live Status (Gold)
                </h3>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col items-center text-center transition-all group">
                        <div className="flex-1 space-y-3 w-full">
                            <div className="bg-muted/30 p-3 rounded-xl border border-border/50 h-full">
                                <p className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2">KPI Metrics (Gold)</p>
                                <div className="space-y-1">
                                    {lastGoldRecords?.slice(0, 5).map((rec, i) => (
                                        <div key={i} className="flex justify-between text-[9px] font-mono border-b border-border/30 pb-1 last:border-0">
                                            <span className="text-muted-foreground">Events Count</span>
                                            <span className="text-foreground">{rec.total_events}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 md:col-span-2">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">KPI Windows</h3>
                        <div className="h-64">
                            <Bar
                                data={goldChartData as ChartData<'bar'>}
                                options={{
                                    ...commonOptions,
                                    scales: {
                                        ...commonOptions.scales,
                                        y1: {
                                            position: 'right' as const,
                                            grid: { drawOnChartArea: false },
                                            ticks: { color: 'rgb(249, 115, 22)', font: { size: 8 } }
                                        }
                                    }
                                } as ChartOptions<'bar'>}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
