/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { LayerStatusCard } from './LayerStatusCard';

interface PipelineFlowDiagramProps {
    readiness: any;
    onResourceClick: (type: 'Topics' | 'Tables' | 'Buckets', name: string) => void;
}

export function PipelineFlowDiagram({ readiness, onResourceClick }: PipelineFlowDiagramProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-border -z-10 transform -translate-y-1/2"></div>

            <LayerStatusCard
                layer="bronze"
                status={readiness.bronze?.status}
                details={readiness.bronze?.details}
                onResourceClick={onResourceClick}
            />

            <LayerStatusCard
                layer="silver"
                status={readiness.silver?.status}
                details={readiness.silver?.details}
                onResourceClick={onResourceClick}
            />

            <LayerStatusCard
                layer="gold"
                status={readiness.gold?.status}
                details={readiness.gold?.details}
                onResourceClick={onResourceClick}
            />
        </div>
    );
}
