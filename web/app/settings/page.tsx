'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
    const [llmEndpoint, setLlmEndpoint] = useState('');
    const [llmApiKey, setLlmApiKey] = useState('');
    const [dbUrl, setDbUrl] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingLLM, setTestingLLM] = useState(false);
    const [testingDB, setTestingDB] = useState(false);

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetch('http://localhost:8000/settings')
            .then(res => res.json())
            .then(data => {
                if (data.llm_endpoint) setLlmEndpoint(data.llm_endpoint);
                if (data.llm_api_key) setLlmApiKey(data.llm_api_key);
                if (data.remote_db_url) setDbUrl(data.remote_db_url);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('http://localhost:8000/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    llm_endpoint: llmEndpoint,
                    llm_api_key: llmApiKey,
                    remote_db_url: dbUrl
                })
            });

            if (!res.ok) throw new Error('Failed to save settings');

            setMessage({ type: 'success', text: 'Settings saved successfully' });
        } catch (err) {
            setMessage({ type: 'error', text: 'Error saving settings' });
        } finally {
            setSaving(false);
        }
    };

    const testLLM = async () => {
        setTestingLLM(true);
        setMessage(null);
        try {
            const res = await fetch('http://localhost:8000/test/llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: llmEndpoint, api_key: llmApiKey })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Connection failed');
            setMessage({ type: 'success', text: 'LLM Connection Successful!' });
        } catch (err: any) {
            setMessage({ type: 'error', text: `LLM Error: ${err.message}` });
        } finally {
            setTestingLLM(false);
        }
    };

    const testDB = async () => {
        setTestingDB(true);
        setMessage(null);
        try {
            const res = await fetch('http://localhost:8000/test/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection_string: dbUrl })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Connection failed');
            setMessage({ type: 'success', text: 'Database Connection Successful!' });
        } catch (err: any) {
            setMessage({ type: 'error', text: `DB Error: ${err.message}` });
        } finally {
            setTestingDB(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500">Loading Settings...</div>;

    return (
        <div className="min-h-screen bg-black text-zinc-100 p-8 font-sans">
            <header className="mb-10 flex justify-between items-center border-b border-zinc-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">System Settings</h1>
                    <p className="text-zinc-500 mt-1">Configure AI Models and External Data Sources</p>
                </div>
                <Link href="/" className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm transition-colors">
                    Back to Dashboard
                </Link>
            </header>

            <div className="max-w-3xl mx-auto space-y-8">

                {message && (
                    <div className={`p-4 rounded-lg border ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                        {message.text}
                    </div>
                )}

                {/* AI Configuration */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        LLM Configuration
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Endpoint URL</label>
                            <input
                                type="text"
                                value={llmEndpoint}
                                onChange={(e) => setLlmEndpoint(e.target.value)}
                                placeholder="https://api.openai.com/v1/chat/completions"
                                className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">API Key</label>
                            <input
                                type="password"
                                value={llmApiKey}
                                onChange={(e) => setLlmApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={testLLM}
                                disabled={testingLLM || !llmEndpoint}
                                className="px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingLLM ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Database Configuration */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                        External Database
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Connection String</label>
                            <input
                                type="text"
                                value={dbUrl}
                                onChange={(e) => setDbUrl(e.target.value)}
                                placeholder="mysql://user:password@host:3306/dbname"
                                className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                            <p className="text-xs text-zinc-600 mt-1">Supported schemes: mysql://</p>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={testDB}
                                disabled={testingDB || !dbUrl}
                                className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingDB ? 'Testing...' : 'Test Connection'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t border-zinc-800">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>

            </div>
        </div>
    );
}
