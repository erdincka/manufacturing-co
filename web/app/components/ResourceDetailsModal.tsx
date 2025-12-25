'use client';

import {
    BucketDetails,
    TopicDetails,
    TableDetails
} from '../interfaces';

interface ResourceDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'Topics' | 'Tables' | 'Buckets' | null;
    name: string | null;
    data: BucketDetails | TopicDetails | TableDetails | null;
    isFetching: boolean;
    onBackToList?: () => void;
}

export function ResourceDetailsModal({
    isOpen,
    onClose,
    type,
    name,
    data,
    isFetching,
    onBackToList
}: ResourceDetailsModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-6 border-b border-border bg-muted/30">
                    <h3 className="text-xl font-bold">
                        {name ? `${name} (${type})` : `${type} Details`}
                    </h3>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-silver-500"></div>
                            <p className="text-muted-foreground animate-pulse text-sm font-medium">Fetching real-time data...</p>
                        </div>
                    ) : data ? (
                        <div className="space-y-6">
                            {type === 'Buckets' && 'objects' in data && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-amber-500 font-mono">{(data as BucketDetails).object_count.toLocaleString()}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Total Objects</div>
                                        </div>
                                        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-amber-500 font-mono">{((data as BucketDetails).total_size / 1024).toFixed(2)} KB</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Total Size</div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between px-2">
                                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Objects</h4>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {(data as BucketDetails).objects.map((o, i) => (
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
                                            {(data as BucketDetails).object_count === 0 && (
                                                <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border text-muted-foreground text-sm italic">
                                                    Bucket is empty
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {type === 'Topics' && 'messages_count' in data && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-emerald-500 font-mono">{(data as TopicDetails).messages_count.toLocaleString()}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Total</div>
                                        </div>
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-emerald-500 font-mono">{(data as TopicDetails).in_queue.toLocaleString()}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">In Queue</div>
                                        </div>
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-emerald-500 font-mono">{(data as TopicDetails).partitions}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Partitions</div>
                                        </div>
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-emerald-500 font-mono">{(data as TopicDetails).consumers}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Consumers</div>
                                        </div>
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-emerald-500 font-mono">{(data as TopicDetails).delay_seconds}s</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Delay</div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold px-2 uppercase tracking-wider text-muted-foreground">Most Recent Message</h4>
                                        <div className="bg-muted/80 backdrop-blur-sm border border-border rounded-xl p-5 overflow-hidden shadow-inner">
                                            {(data as TopicDetails).recent_message ? (
                                                <pre className="text-xs font-mono text-emerald-500/90 whitespace-pre-wrap break-all leading-relaxed">
                                                    {typeof (data as TopicDetails).recent_message === 'string' && (data as TopicDetails).recent_message?.toString().startsWith('{')
                                                        ? JSON.stringify(JSON.parse((data as TopicDetails).recent_message as string), null, 2)
                                                        : JSON.stringify((data as TopicDetails).recent_message, null, 2)}
                                                </pre>
                                            ) : (
                                                <div className="text-center py-4 text-muted-foreground text-sm italic">No messages processed yet</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {type === 'Tables' && 'metrics' in data && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-cyan-500 font-mono">{(data as TableDetails).metrics?.record_count?.toLocaleString() || 0}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Total Records</div>
                                        </div>
                                        <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-2xl text-center">
                                            <div className="text-xl font-bold text-cyan-500 font-mono">{(data as TableDetails).metrics?.snapshot_count || 0}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Snapshots</div>
                                        </div>
                                        <div className="bg-cyan-500/5 border border-cyan-500/20 p-4 rounded-2xl text-center col-span-2">
                                            <div className="text-[10px] font-bold text-cyan-500 font-mono truncate">
                                                {(data as TableDetails).metrics?.last_updated ? new Date((data as TableDetails).metrics.last_updated).toLocaleString() : 'Never'}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Last Updated</div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Table Sample</h4>
                                            <span className="text-[10px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded-full font-mono">{(data as TableDetails).data.length} records</span>
                                        </div>
                                        <div className="border border-border/50 rounded-xl overflow-hidden shadow-lg bg-background/50 backdrop-blur-md">
                                            {(data as TableDetails).data.length > 0 ? (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-[11px] text-left">
                                                        <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground">
                                                            <tr>
                                                                {Object.keys((data as TableDetails).data[0]).map(k => (
                                                                    <th key={k} className="px-4 py-3 font-bold uppercase tracking-tighter whitespace-nowrap">{k}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/30">
                                                            {(data as TableDetails).data.map((row, i) => (
                                                                <tr key={i} className="hover:bg-cyan-500/5 transition-colors">
                                                                    {Object.values(row).map((v, j) => (
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
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground italic">
                            No details available.
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-border bg-muted/30 flex justify-between items-center">
                    {data && onBackToList && (
                        <button
                            onClick={onBackToList}
                            className="text-xs text-indigo-500 hover:underline font-bold uppercase tracking-widest"
                        >
                            &larr; Back to List
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors border border-border font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
