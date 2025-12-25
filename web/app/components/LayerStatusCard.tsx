/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { StatusItem } from './DashboardComponents';

interface LayerStatusCardProps {
    layer: 'bronze' | 'silver' | 'gold';
    status: string;
    details: any;
    onResourceClick: (type: 'Topics' | 'Tables' | 'Buckets', name: string) => void;
}

export function LayerStatusCard({ layer, status, details, onResourceClick }: LayerStatusCardProps) {
    const config = {
        bronze: {
            icon: '🥉',
            title: 'Bronze Layer',
            subtitle: 'Raw telemetry ingestion',
            colorClass: 'amber',
            resources: [
                { label: 'Topic: telemetry.raw', type: 'Topics' as const, key: 'topic', name: 'manufacturing.telemetry.raw' },
                { label: 'Bucket: bronze-bucket', type: 'Buckets' as const, key: 'bucket', name: 'bronze-bucket' }
            ]
        },
        silver: {
            icon: '🥈',
            title: 'Silver Layer',
            subtitle: 'Cleansed & Enriched',
            colorClass: 'silver',
            resources: [
                { label: 'Table: telemetry.cleansed', type: 'Tables' as const, key: 'table', name: 'telemetry.cleansed' },
                { label: 'Bucket: silver-bucket', type: 'Buckets' as const, key: 'bucket', name: 'silver-bucket' }
            ]
        },
        gold: {
            icon: '🥇',
            title: 'Gold Layer',
            subtitle: 'Aggregated KPIs',
            colorClass: 'yellow',
            resources: [
                { label: 'Table: manufacturing.kpis', type: 'Tables' as const, key: 'table', name: 'manufacturing.kpis' },
                { label: 'Bucket: gold-bucket', type: 'Buckets' as const, key: 'bucket', name: 'gold-bucket' }
            ]
        }
    }[layer];

    // Determine readiness state and color
    const getReadinessColor = (status: string) => {
        switch (status) {
            case 'ready': return 'bg-emerald-500';
            case 'missing': return 'bg-red-500';
            case 'degraded': return 'bg-amber-500';
            default: return 'bg-gray-500';
        }
    };

    const readinessColor = getReadinessColor(status);
    const isReady = status === 'ready';
    const borderColor = isReady ? `border-${config.colorClass}-500/50 shadow-lg shadow-${config.colorClass}-500/5` : 'border-border';
    const titleColor = `text-${config.colorClass}-600 dark:text-${config.colorClass}-${layer === 'silver' ? '400' : '500'}`;

    return (
        <div className={`relative bg-card border ${borderColor} rounded-xl p-6 flex flex-col items-center text-center transition-all group`}>
            <div className={`w-12 h-12 rounded-full bg-${config.colorClass}-500/10 flex items-center justify-center mb-4 text-2xl border border-${config.colorClass}-500/20 group-hover:scale-110 transition-transform`}>
                {config.icon}
            </div>
            <h3 className={`text-lg font-bold ${titleColor} mb-2`}>{config.title}</h3>
            <p className="text-xs text-muted-foreground mb-4">{config.subtitle}</p>

            {/* Readiness Status Indicator */}
            <div className="flex items-center justify-center mb-4">
                <div className={`w-3 h-3 rounded-full ${readinessColor} mr-2`}></div>
                <span className="text-xs font-medium capitalize text-muted-foreground">
                    {status === 'missing' ? 'Not ready' : status}
                </span>
            </div>

            <div className="w-full space-y-2 text-left text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                {config.resources.map((res) => {
                    // Determine individual resource readiness color
                    const resourceStatus = details?.[res.key] ? 'ready' : 'missing';
                    const resourceColor = getReadinessColor(resourceStatus);

                    return (
                        <div key={res.key} className="flex items-center">
                            <div className={`w-2 h-2 rounded-full ${resourceColor} mr-2 flex-shrink-0`}></div>
                            <StatusItem
                                label={res.label}
                                active={details?.[res.key]}
                                onClick={() => onResourceClick(res.type, res.name)}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
