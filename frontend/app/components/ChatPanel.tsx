'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    DashboardData,
    DetailedTopicMetrics,
    TelemetryRecord,
    KpiRecord,
    LLMConfig,
    ChatMessage
} from '../interfaces';
import { LLMSettingsModal } from './LLMSettingsModal';
import { api } from '../../lib/api';

interface ChatPanelProps {
    dashboardData: DashboardData | undefined;
    detailedMetrics: DetailedTopicMetrics | undefined;
    lastProcessedRecords: TelemetryRecord[];
    lastGoldRecords: KpiRecord[];
}

const DEFAULT_CONFIG: LLMConfig = {
    baseUrl: 'https://api.openai.com/v1',
    apiToken: '',
    model: 'gpt-4o'
};

export function ChatPanel({
    dashboardData,
    detailedMetrics,
    lastProcessedRecords,
    lastGoldRecords
}: ChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const modalScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem('llm_config');
        if (saved) {
            try {
                setConfig(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse saved LLM config', e);
            }
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        if (modalScrollRef.current) {
            modalScrollRef.current.scrollTop = modalScrollRef.current.scrollHeight;
        }
    }, [messages, isExpanded]);

    const saveConfig = (newConfig: LLMConfig) => {
        setConfig(newConfig);
        localStorage.setItem('llm_config', JSON.stringify(newConfig));
    };

    const clearChat = () => {
        setMessages([]);
    };

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        setInput('');
        setIsLoading(true);

        // Prepare context
        const context = {
            dashboard: {
                topics: dashboardData?.topics?.length || 0,
                tables: dashboardData?.tables?.length || 0,
                buckets: dashboardData?.buckets?.length || 0,
                readiness: dashboardData?.readiness
            },
            bronze_layer: detailedMetrics ? {
                topic: detailedMetrics.topic,
                total_messages: detailedMetrics.total_messages,
                lag_seconds: detailedMetrics.lag_seconds,
                processing_rate: detailedMetrics.processing_rate
            } : null,
            silver_layer: {
                last_5_records: lastProcessedRecords.slice(0, 5)
            },
            gold_layer: {
                last_5_records: lastGoldRecords.slice(0, 5)
            }
        };

        const systemPrompt = `You are a data engineering assistant for a manufacturing company. 
Current system state:
${JSON.stringify(context, null, 2)}

Help the user understand the current scenario, data quality, and pipeline status.`;

        const requestBody = {
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: currentInput }
            ]
        };

        try {
            const data = await api.proxyLLMChat(config.baseUrl, config.apiToken, requestBody);

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: data.choices[0].message.content,
                debugInfo: {
                    request: requestBody,
                    response: data
                }
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${errorMessage}. Please check your configuration and API token.`
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, config, dashboardData, detailedMetrics, lastProcessedRecords, lastGoldRecords]);

    return (
        <>
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col h-[500px]">
                <div className="bg-muted/40 p-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-xs font-bold flex items-center gap-2 uppercase tracking-tight text-indigo-400">
                        💬 Data Assistant
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsExpanded(true)}
                            title="Expand Chat"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                <path fillRule="evenodd" d="M2.75 9a.75.75 0 0 1 .75.75v1.69l2.22-2.22a.75.75 0 0 1 1.06 1.06L4.56 12.5h1.69a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75v-3.5A.75.75 0 0 1 2.75 9ZM2.75 7a.75.75 0 0 0 .75-.75V4.56l2.22 2.22a.75.75 0 0 0 1.06-1.06L4.56 3.5h1.69a.75.75 0 0 0 0-1.5h-3.5a.75.75 0 0 0-.75.75v3.5c0 .414.336.75.75.75ZM13.25 9a.75.75 0 0 0-.75.75v1.69l-2.22-2.22a.75.75 0 1 0-1.06 1.06l2.22 2.22H9.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 .75-.75v-3.5a.75.75 0 0 0-.75-.75ZM13.25 7a.75.75 0 0 1-.75-.75V4.56l-2.22 2.22a.75.75 0 1 1-1.06-1.06l2.22-2.22H9.75a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-.75.75Z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button
                            onClick={clearChat}
                            title="Clear Chat"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setShowDebug(!showDebug)}
                            className={`text-[10px] rounded transition-colors ${showDebug ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'border-border text-muted-foreground hover:text-foreground'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                <path d="M11.983 1.364a.75.75 0 0 0-1.281.78c.096.158.184.321.264.489a5.48 5.48 0 0 1-.713.386A2.993 2.993 0 0 0 8 2c-.898 0-1.703.394-2.253 1.02a5.485 5.485 0 0 1-.713-.387c.08-.168.168-.33.264-.489a.75.75 0 1 0-1.28-.78c-.245.401-.45.83-.61 1.278a.75.75 0 0 0 .239.84 7 7 0 0 0 1.422.876A3.01 3.01 0 0 0 5 5c0 .126.072.24.183.3.386.205.796.37 1.227.487-.126.165-.227.35-.297.549A10.418 10.418 0 0 1 3.51 5.5a10.686 10.686 0 0 1-.008-.733.75.75 0 0 0-1.5-.033 12.222 12.222 0 0 0 .041 1.31.75.75 0 0 0 .4.6A11.922 11.922 0 0 0 6.199 7.87c.04.084.088.166.14.243l-.214.031-.027.005c-1.299.207-2.529.622-3.654 1.211a.75.75 0 0 0-.4.6 12.148 12.148 0 0 0 .197 3.443.75.75 0 0 0 1.47-.299 10.551 10.551 0 0 1-.2-2.6c.352-.167.714-.314 1.085-.441-.063.3-.096.614-.096.936 0 2.21 1.567 4 3.5 4s3.5-1.79 3.5-4c0-.322-.034-.636-.097-.937.372.128.734.275 1.085.442a10.703 10.703 0 0 1-.199 2.6.75.75 0 1 0 1.47.3 12.049 12.049 0 0 0 .197-3.443.75.75 0 0 0-.4-.6 11.921 11.921 0 0 0-3.671-1.215l-.011-.002a11.95 11.95 0 0 0-.213-.03c.052-.078.1-.16.14-.244 1.336-.202 2.6-.623 3.755-1.227a.75.75 0 0 0 .4-.6 12.178 12.178 0 0 0 .041-1.31.75.75 0 0 0-1.5.033 11.061 11.061 0 0 1-.008.733c-.815.386-1.688.67-2.602.836-.07-.2-.17-.384-.297-.55.43-.117.842-.282 1.228-.488A.34.34 0 0 0 11 5c0-.22-.024-.435-.069-.642a7 7 0 0 0 1.422-.876.75.75 0 0 0 .24-.84 6.97 6.97 0 0 0-.61-1.278Z" />
                            </svg>

                        </button>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-[10px] rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                <path fillRule="evenodd" d="M4.5 1.938a.75.75 0 0 1 1.025.274l.652 1.131c.351-.138.71-.233 1.073-.288V1.75a.75.75 0 0 1 1.5 0v1.306a5.03 5.03 0 0 1 1.072.288l.654-1.132a.75.75 0 1 1 1.298.75l-.652 1.13c.286.23.55.492.785.786l1.13-.653a.75.75 0 1 1 .75 1.3l-1.13.652c.137.351.233.71.288 1.073h1.305a.75.75 0 0 1 0 1.5h-1.306a5.032 5.032 0 0 1-.288 1.072l1.132.654a.75.75 0 0 1-.75 1.298l-1.13-.652c-.23.286-.492.55-.786.785l.652 1.13a.75.75 0 0 1-1.298.75l-.653-1.13c-.351.137-.71.233-1.073.288v1.305a.75.75 0 0 1-1.5 0v-1.306a5.032 5.032 0 0 1-1.072-.288l-.653 1.132a.75.75 0 0 1-1.3-.75l.653-1.13a4.966 4.966 0 0 1-.785-.786l-1.13.652a.75.75 0 0 1-.75-1.298l1.13-.653a4.965 4.965 0 0 1-.288-1.073H1.75a.75.75 0 0 1 0-1.5h1.306a5.03 5.03 0 0 1 .288-1.072l-1.132-.653a.75.75 0 0 1 .75-1.3l1.13.653c.23-.286.492-.55.786-.785l-.653-1.13A.75.75 0 0 1 4.5 1.937Zm1.14 3.476a3.501 3.501 0 0 0 0 5.172L7.135 8 5.641 5.414ZM8.434 8.75 6.94 11.336a3.491 3.491 0 0 0 2.81-.305 3.49 3.49 0 0 0 1.669-2.281H8.433Zm2.987-1.5H8.433L6.94 4.664a3.501 3.501 0 0 1 4.48 2.586Z" clipRule="evenodd" />
                            </svg>

                        </button>
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/20">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-50">
                            <span className="text-3xl">🤖</span>
                            <p className="text-xs italic">Ask me anything about the current data pipeline, metrics, or records.</p>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                            <div className={`inline-block max-w-[85%] p-3 rounded-2xl text-xs ${msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : 'bg-muted border border-border rounded-tl-none'
                                }`}>
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            </div>
                            {showDebug && msg.debugInfo && (
                                <div className="text-[9px] font-mono bg-black/40 p-2 rounded-lg mt-1 text-emerald-400 overflow-x-auto max-w-full text-left">
                                    <div className="font-bold mb-1 uppercase opacity-50 border-b border-white/10 pb-1">Debug Info</div>
                                    <details>
                                        <summary className="cursor-pointer hover:underline">Request (System Prompt & Body)</summary>
                                        <pre className="mt-1">{JSON.stringify(msg.debugInfo.request, null, 2)}</pre>
                                    </details>
                                    <details className="mt-1">
                                        <summary className="cursor-pointer hover:underline">Response</summary>
                                        <pre className="mt-1">{JSON.stringify(msg.debugInfo.response, null, 2)}</pre>
                                    </details>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="text-left">
                            <div className="inline-block bg-muted border border-border p-3 rounded-2xl rounded-tl-none animate-pulse">
                                <div className="flex gap-1">
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"></span>
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-muted/40">
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={config.apiToken ? "Ask about current data..." : "Configure API Token in Settings..."}
                            disabled={!config.apiToken || isLoading}
                            className="w-full bg-background border border-border rounded-xl pl-4 pr-12 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all disabled:opacity-50"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!config.apiToken || !input.trim() || isLoading}
                            className="absolute right-2 p-1.5 text-indigo-500 hover:text-indigo-400 disabled:text-muted-foreground transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                </div>

                <LLMSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    config={config}
                    onSave={saveConfig}
                />
            </div>

            {/* Expanded Modal */}
            {isExpanded && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card border border-border w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-semibold text-indigo-400">💬 Data Assistant (Expanded)</h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={clearChat}
                                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                                        </svg>

                                        Clear Chat
                                    </button>
                                    <button
                                        onClick={() => setShowDebug(!showDebug)}
                                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border transition-all ${showDebug ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
                                            <path d="M11.983 1.364a.75.75 0 0 0-1.281.78c.096.158.184.321.264.489a5.48 5.48 0 0 1-.713.386A2.993 2.993 0 0 0 8 2c-.898 0-1.703.394-2.253 1.02a5.485 5.485 0 0 1-.713-.387c.08-.168.168-.33.264-.489a.75.75 0 1 0-1.28-.78c-.245.401-.45.83-.61 1.278a.75.75 0 0 0 .239.84 7 7 0 0 0 1.422.876A3.01 3.01 0 0 0 5 5c0 .126.072.24.183.3.386.205.796.37 1.227.487-.126.165-.227.35-.297.549A10.418 10.418 0 0 1 3.51 5.5a10.686 10.686 0 0 1-.008-.733.75.75 0 0 0-1.5-.033 12.222 12.222 0 0 0 .041 1.31.75.75 0 0 0 .4.6A11.922 11.922 0 0 0 6.199 7.87c.04.084.088.166.14.243l-.214.031-.027.005c-1.299.207-2.529.622-3.654 1.211a.75.75 0 0 0-.4.6 12.148 12.148 0 0 0 .197 3.443.75.75 0 0 0 1.47-.299 10.551 10.551 0 0 1-.2-2.6c.352-.167.714-.314 1.085-.441-.063.3-.096.614-.096.936 0 2.21 1.567 4 3.5 4s3.5-1.79 3.5-4c0-.322-.034-.636-.097-.937.372.128.734.275 1.085.442a10.703 10.703 0 0 1-.199 2.6.75.75 0 1 0 1.47.3 12.049 12.049 0 0 0 .197-3.443.75.75 0 0 0-.4-.6 11.921 11.921 0 0 0-3.671-1.215l-.011-.002a11.95 11.95 0 0 0-.213-.03c.052-.078.1-.16.14-.244 1.336-.202 2.6-.623 3.755-1.227a.75.75 0 0 0 .4-.6 12.178 12.178 0 0 0 .041-1.31.75.75 0 0 0-1.5.033 11.061 11.061 0 0 1-.008.733c-.815.386-1.688.67-2.602.836-.07-.2-.17-.384-.297-.55.43-.117.842-.282 1.228-.488A.34.34 0 0 0 11 5c0-.22-.024-.435-.069-.642a7 7 0 0 0 1.422-.876.75.75 0 0 0 .24-.84 6.97 6.97 0 0 0-.61-1.278Z" />
                                        </svg>

                                        Debug View
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
                                <div ref={modalScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/20">
                                    {messages.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-50">
                                            <span className="text-3xl">🤖</span>
                                            <p className="text-xs italic">Ask me anything about the current data pipeline, metrics, or records.</p>
                                        </div>
                                    )}
                                    {messages.map((msg, idx) => (
                                        <div key={idx} className={`space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                            <div className={`inline-block max-w-[85%] p-3 rounded-2xl text-xs ${msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                                : 'bg-muted border border-border rounded-tl-none'
                                                }`}>
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                            </div>
                                            {showDebug && msg.debugInfo && (
                                                <div className="text-[9px] font-mono bg-black/40 p-2 rounded-lg mt-1 text-emerald-400 overflow-x-auto max-w-full text-left">
                                                    <div className="font-bold mb-1 uppercase opacity-50 border-b border-white/10 pb-1">Debug Info</div>
                                                    <details>
                                                        <summary className="cursor-pointer hover:underline">Request (System Prompt & Body)</summary>
                                                        <pre className="mt-1">{JSON.stringify(msg.debugInfo.request, null, 2)}</pre>
                                                    </details>
                                                    <details className="mt-1">
                                                        <summary className="cursor-pointer hover:underline">Response</summary>
                                                        <pre className="mt-1">{JSON.stringify(msg.debugInfo.response, null, 2)}</pre>
                                                    </details>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="text-left">
                                            <div className="inline-block bg-muted border border-border p-3 rounded-2xl rounded-tl-none animate-pulse">
                                                <div className="flex gap-1">
                                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"></span>
                                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-border bg-muted/40">
                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            placeholder={config.apiToken ? "Ask about current data..." : "Configure API Token in Settings..."}
                                            disabled={!config.apiToken || isLoading}
                                            className="w-full bg-background border border-border rounded-xl pl-4 pr-12 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all disabled:opacity-50"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!config.apiToken || !input.trim() || isLoading}
                                            className="absolute right-2 p-1.5 text-indigo-500 hover:text-indigo-400 disabled:text-muted-foreground transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {showDebug && (
                                <div className="w-80 bg-muted/10 p-4 overflow-y-auto hidden md:block text-left">
                                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4">Configuration</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground">Base URL</label>
                                            <div className="text-[11px] font-mono truncate">{config.baseUrl}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground">Model</label>
                                            <div className="text-[11px] font-mono">{config.model}</div>
                                        </div>
                                        <div className="pt-4 border-t border-border">
                                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Current Context Stats</h4>
                                            <div className="space-y-2 text-[11px]">
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>Silver Records</span>
                                                    <span>{lastProcessedRecords.length}</span>
                                                </div>
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>Gold Records</span>
                                                    <span>{lastGoldRecords.length}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
