'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
    const pathname = usePathname();

    return (
        <header className="mb-10 flex justify-between items-center border-b border-border pb-6">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                    Manufacturing Co
                </h1>
                <p className="text-muted-foreground mt-1">Manufacturing Co Dashboard</p>
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
                            href="/settings"
                            className={`text-sm font-medium transition-colors ${pathname === '/settings'
                                ? 'text-indigo-500 border-b-2 border-indigo-500 pb-1'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            Settings
                        </Link>
                    </li>
                </ul>
                <div className="border-l border-border pl-6">
                    <ThemeToggle />
                </div>
            </nav>
        </header>
    );
}