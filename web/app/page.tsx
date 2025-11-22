'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Machine, ProductionLog, DashboardStats, InventoryItem } from './interfaces';

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const colors = {
    running: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    idle: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    maintenance: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    error: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status as keyof typeof colors] || 'bg-gray-500/10 text-gray-500'}`}>
      {status.toUpperCase()}
    </span>
  );
};

const HealthBar = ({ score }: { score: number }) => {
  let color = 'bg-emerald-500';
  if (score < 70) color = 'bg-amber-500';
  if (score < 40) color = 'bg-rose-500';

  return (
    <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }}></div>
    </div>
  );
};

const MachineCard = ({ machine }: { machine: Machine }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-zinc-100 font-semibold text-lg">{machine.name}</h3>
        <p className="text-zinc-400 text-sm">{machine.type}</p>
      </div>
      <StatusBadge status={machine.status} />
    </div>

    <div className="grid grid-cols-2 gap-4 mb-4">
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wider">Temp</p>
        <p className="text-zinc-200 font-mono">{machine.temperature.toFixed(1)}°C</p>
      </div>
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wider">Vibration</p>
        <p className="text-zinc-200 font-mono">{machine.vibration.toFixed(3)}g</p>
      </div>
    </div>

    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">Health Score</span>
        <span className="text-zinc-300">{machine.health_score}%</span>
      </div>
      <HealthBar score={machine.health_score} />
    </div>
  </div>
);

const StatCard = ({ title, value, subtext, trend }: { title: string, value: string, subtext?: string, trend?: 'up' | 'down' | 'neutral' }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
    <p className="text-zinc-500 text-sm font-medium uppercase tracking-wide mb-1">{title}</p>
    <h2 className="text-3xl font-bold text-white mb-1">{value}</h2>
    {subtext && <p className="text-zinc-400 text-sm">{subtext}</p>}
  </div>
);

const InventoryRow = ({ item }: { item: InventoryItem }) => (
  <tr className="hover:bg-zinc-800/50 transition-colors border-b border-zinc-800 last:border-0">
    <td className="px-4 py-3">
      <div className="font-medium text-zinc-200">{item.product_name}</div>
      <div className="text-xs text-zinc-500">{item.sku}</div>
    </td>
    <td className="px-4 py-3 text-zinc-400">{item.warehouse_location}</td>
    <td className="px-4 py-3 text-right">
      <span className={`font-mono ${item.quantity < 100 ? 'text-amber-500 font-bold' : 'text-zinc-300'}`}>
        {item.quantity}
      </span>
    </td>
    <td className="px-4 py-3 text-right">
      <div className={`w-2 h-2 rounded-full inline-block ${item.quantity < 100 ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
    </td>
  </tr>
);

// --- Main Page ---

export default function Dashboard() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [recentLogs, setRecentLogs] = useState<ProductionLog[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [machinesRes, logsRes, statsRes, inventoryRes] = await Promise.all([
        fetch('http://localhost:8000/machines'),
        fetch('http://localhost:8000/production/recent'),
        fetch('http://localhost:8000/dashboard/stats'),
        fetch('http://localhost:8000/inventory')
      ]);

      if (machinesRes.ok) setMachines(await machinesRes.json());
      if (logsRes.ok) setRecentLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (inventoryRes.ok) setInventory(await inventoryRes.json());
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading Portal...</div>;
  }

  // Calculate derived stats
  const activeMachines = machines.filter(m => m.status === 'running').length;
  const totalMachines = machines.length;
  const utilization = totalMachines > 0 ? Math.round((activeMachines / totalMachines) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-8 font-sans">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Manufacturing Company
          </h1>
          <p className="text-zinc-500 mt-1">Plant Operations Center • Zone A</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Settings
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-medium text-zinc-400">System Online</span>
          </div>
        </div>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Plant Utilization"
          value={`${utilization}%`}
          subtext={`${activeMachines} / ${totalMachines} Machines Active`}
        />
        <StatCard
          title="24h Production"
          value={stats?.production_24h?.total_produced?.toLocaleString() || '0'}
          subtext="Units Produced"
        />
        <StatCard
          title="Defect Rate"
          value={`${stats?.production_24h?.total_produced ? ((stats.production_24h.total_defects / stats.production_24h.total_produced) * 100).toFixed(2) : 0}%`}
          subtext={`${stats?.production_24h?.total_defects || 0} Defects Detected`}
        />
        <StatCard
          title="Inventory Alerts"
          value={stats?.low_stock_count?.toString() || '0'}
          subtext="Items Low Stock"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Machines */}
        <div className="lg:col-span-2 space-y-8">
          {/* Machines Grid */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Machine Status</h2>
              <button className="text-sm text-indigo-400 hover:text-indigo-300">View All</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {machines.map(machine => (
                <MachineCard key={machine.id} machine={machine} />
              ))}
            </div>
          </div>

          {/* Inventory Section */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-white">Warehouse Inventory</h2>
              <button className="text-sm text-indigo-400 hover:text-indigo-300">Manage Stock</button>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50 border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {inventory.slice(0, 5).map(item => (
                      <InventoryRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Recent Production</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Machine</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {recentLogs.map(log => (
                    <tr key={log.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3 text-zinc-400">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-200">
                        {log.machine_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {log.quantity_produced}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
