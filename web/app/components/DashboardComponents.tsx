'use client';

export function StatusItem({ label, active }: { label: string, active?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
            <span className={active ? 'text-emerald-500' : 'text-destructive'}>
                {active ? '●' : '○'}
            </span>
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
