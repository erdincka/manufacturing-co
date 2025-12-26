'use client';

export function StatusItem({ label, active, onClick }: { label: string, active?: boolean, onClick?: () => void }) {
    return (
        <div
            className={`flex items-center justify-between ${onClick && active ? 'cursor-pointer hover:bg-white/5 -mx-1 px-1 rounded transition-colors' : ''}`}
            onClick={active ? onClick : undefined}
        >
            <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </div>
    );
}


export function ResourceStat({ label, count }: { label: string, count: number }) {
    return (
        <div className="bg-card border border-border p-3 rounded-lg text-center hover:bg-accent/10 transition-colors">
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
        </div>
    );
}
