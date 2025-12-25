import {
    DashboardData,
    DetailedTopicMetrics,
    TelemetryRecord,
    KpiRecord,
    BootstrapResult,
    ScenarioResult,
    BucketDetails,
    TopicDetails,
    TableDetails
} from '../app/interfaces';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || `API request failed with status ${res.status}`);
    }
    return res.json();
}

export const api = {
    getDashboardData: (): Promise<DashboardData> =>
        fetch(`${API_BASE}/dashboard/data`).then(handleResponse<DashboardData>),

    getDetailedTopicMetrics: (topicName: string): Promise<DetailedTopicMetrics> =>
        fetch(`${API_BASE}/topics/${topicName}/detailed-metrics`).then(handleResponse<DetailedTopicMetrics>),

    getSilverRecords: (limit = 100): Promise<{ data: TelemetryRecord[] }> =>
        fetch(`${API_BASE}/tables/telemetry.cleansed/data?limit=${limit}`).then(handleResponse<{ data: TelemetryRecord[] }>),

    getGoldRecords: (limit = 5): Promise<{ data: KpiRecord[] }> =>
        fetch(`${API_BASE}/tables/manufacturing.kpis/data?limit=${limit}`).then(handleResponse<{ data: KpiRecord[] }>),

    bootstrap: (): Promise<BootstrapResult> =>
        fetch(`${API_BASE}/profile/bootstrap`, { method: 'POST' }).then(handleResponse<BootstrapResult>),

    runScenario: (scenarioType: string): Promise<ScenarioResult> =>
        fetch(`${API_BASE}/profile/scenarios/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: 'default', scenario_type: scenarioType })
        }).then(handleResponse<ScenarioResult>),

    getResourceDetails: async (type: 'Topics' | 'Tables' | 'Buckets', name: string): Promise<TopicDetails | TableDetails | BucketDetails> => {
        let url = "";
        if (type === 'Buckets') url = `${API_BASE}/buckets/${name}/objects`;
        else if (type === 'Topics') url = `${API_BASE}/topics/${name}/metrics`;
        else if (type === 'Tables') url = `${API_BASE}/tables/${name}/data`;

        return fetch(url).then(res => handleResponse<TopicDetails | TableDetails | BucketDetails>(res));
    }
};
