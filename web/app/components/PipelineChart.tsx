'use client';

import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface DataFlowVisualizationProps {
    generated: number;
    published: number;
    inQueue: number;
    processed: number;
    onSegmentClick: (segment: 'generated' | 'published' | 'queued' | 'processed') => void;
}

export default function PipelineChart({
    generated, published, inQueue, processed, onSegmentClick
}: DataFlowVisualizationProps) {

    const data = {
        labels: ['Generated', 'Published', 'Queued', 'Processed'],
        datasets: [{
            label: 'Count',
            data: [generated, published, inQueue, processed],
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
            borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
            borderWidth: 1,
            barThickness: 25
        }]
    };

    const handleChartClick = (event: any, elements: any[]) => {

        if (elements.length > 0) {
            const element = elements[0];

            const segmentMap: Record<number, string> = {
                0: 'generated',
                1: 'published',
                2: 'queued',
                3: 'processed'
            };

            const segment = segmentMap[element.index];
            if (segment) {
                onSegmentClick(segment);
            }
        }
    };

    const options = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'nearest',
            intersect: false
        },
        scales: {
            x: {
                min: 0,
                ticks: { stepSize: 50, font: { size: 11 } },
                title: { display: true, text: 'Count', font: { size: 12, weight: 'bold' } }
            },
            y: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.label}: ${context.parsed.x}`
                }
            }
        },
        onClick: handleChartClick
    };

    return (
        <div style={{ height: '200px', width: '100%' }}>
            <Bar data={data} options={options} />
        </div>
    );
}
