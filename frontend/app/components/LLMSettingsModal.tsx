'use client';

import { useState, useEffect } from 'react';
import { LLMConfig } from '../interfaces';

interface LLMSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: LLMConfig;
    onSave: (config: LLMConfig) => void;
}

export function LLMSettingsModal({ isOpen, onClose, config, onSave }: LLMSettingsModalProps) {
    const [baseUrl, setBaseUrl] = useState(config.baseUrl);
    const [apiToken, setApiToken] = useState(config.apiToken);
    const [model, setModel] = useState(config.model);

    useEffect(() => {
        setBaseUrl(config.baseUrl);
        setApiToken(config.apiToken);
        setModel(config.model);
    }, [config]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
                    <h2 className="text-xl font-semibold">LLM Configuration</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Base URL</label>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">API Token</label>
                        <input
                            type="password"
                            value={apiToken}
                            onChange={(e) => setApiToken(e.target.value)}
                            placeholder="sk-..."
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Model</label>
                        <input
                            type="text"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            placeholder="gpt-4o"
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="p-6 bg-muted/30 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onSave({ baseUrl, apiToken, model });
                            onClose();
                        }}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all"
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
}
