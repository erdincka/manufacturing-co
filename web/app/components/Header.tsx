'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function Header() {
    const pathname = usePathname();

    const { data: dashboardData } = useQuery({
        queryKey: ['dashboardData'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/dashboard/data`);
            if (!res.ok) throw new Error('Failed to fetch dashboard data');
            return res.json();
        },
        refetchInterval: 10000,
    });

    const isConfigured = dashboardData?.configured || false;
    const readiness = dashboardData?.readiness || {
        bronze: { status: 'missing' },
        silver: { status: 'missing' },
        gold: { status: 'missing' }
    };
    const isReady = readiness.bronze?.status === 'ready' &&
        readiness.silver?.status === 'ready' &&
        readiness.gold?.status === 'ready';

    return (
        <header className="mb-10 flex justify-between items-center border-b border-border pb-6">
            <div className="flex items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                        Manufacturing Co
                    </h1>
                    <p className="text-muted-foreground mt-1">Manufacturing Co Dashboard</p>
                </div>

                <div className="h-10 w-[1px] bg-border mx-2 hidden md:block"></div>
            </div>
            <nav className="flex items-center space-x-6">
                <ul className="flex space-x-6">
                    <li>
                        <Link
                            href="/"
                            className={`text-sm font-medium transition-colors ${pathname === '/'
                                ? 'text-indigo-500 border-b-2 border-indigo-500 pb-1'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Dashboard
                        </Link>
                    </li>
                    <li>
                        <Link
                            href="/admin"
                            className={`text-sm font-medium transition-colors ${pathname === '/admin'
                                ? 'text-indigo-500 border-b-2 border-indigo-500 pb-1'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Admin
                        </Link>
                    </li>
                </ul>
                <div className="hidden md:block">
                    {!isConfigured ? (
                        <Link href="/admin" className="flex items-center space-x-2 px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider">System Offline</span>
                            <span>❌</span>
                        </Link>
                    ) : !isReady ? (
                        <div className="flex items-center space-x-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider">Resources Missing</span>
                            <span className="animate-pulse">⚠️</span>
                        </div>
                    ) : (
                        <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider">System Ready</span>
                            <span>✅</span>
                        </div>
                    )}
                </div>
                <div className="border-l border-border pl-6">
                    <ThemeToggle />
                </div>

            </nav>
        </header>
    );
}