'use client';

import { useState, useEffect } from 'react';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConnectionProfile, ConnectionTestResult, ServiceDetail, ReadinessScore } from '../interfaces';

// Force relative path for production
const API_BASE = '/api';

export default function AdminPage() {
  // const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ConnectionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saveResult, setSaveResult] = useState<ConnectionTestResult | null>(null);
  const [services, setServices] = useState<ServiceDetail[]>([]);
  const [readiness, setReadiness] = useState<ReadinessScore | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Failed to fetch profile', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      if (!res.ok) throw new Error('Failed to save profile');

      await fetchProfile();
      setSaveResult({ status: 'success', message: 'Profile saved successfully' });
    } catch (err) {
      setSaveResult({ status: 'error', message: `Error saving profile ${err}` });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/profile/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (!res.ok) {
        // If we get a 400/500, try to parse the error message
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({ status: 'error', message: 'Connection test failed: ' + (error instanceof Error ? error.message : String(error)) });
    } finally {
      setTesting(false);
    }
  };

  const discoverServices = async () => {
    setDiscovering(true);
    try {
      const res = await fetch(`${API_BASE}/profile/services`);
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }

      const readinessRes = await fetch(`${API_BASE}/profile/readiness`);
      if (readinessRes.ok) {
        const readinessData = await readinessRes.json();
        setReadiness(readinessData);
      }
    } catch (error) {
      console.error('Failed to discover services', error);
    } finally {
      setDiscovering(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading Admin...</div>;
  }

  if (!profile) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Error loading profile</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* Connection Profile Form */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Connection Profile</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Cluster Host</label>
              <input
                type="text"
                required
                value={profile.cluster_host}
                onChange={(e) => {
                  setProfile({ ...profile, cluster_host: e.target.value });
                  setTestResult(null);
                }}
                placeholder="datafabric.example.com"
                className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Username</label>
              <input
                type="text"
                value={profile.username || ''}
                onChange={(e) => {
                  setProfile({ ...profile, username: e.target.value });
                  setTestResult(null);
                }}
                className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                value={profile.password || ''}
                onChange={(e) => {
                  setProfile({ ...profile, password: e.target.value });
                  setTestResult(null);
                }}
                className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={testConnection}
              disabled={testing || !profile.cluster_host}
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg disabled:opacity-50 transition-colors border border-border"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !profile.cluster_host || testResult?.status !== 'success'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {testResult && (
          <div className={`mt-4 p-4 rounded-lg border ${testResult.status === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : testResult.status === 'auth_failed'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
            <p className="font-semibold">{testResult.status ? testResult.status.toUpperCase() : 'UNKNOWN'}</p>
            <p className="text-sm mt-1">{testResult.message}</p>
          </div>
        )}
        {saveResult && (
          <div className={`mt-4 p-4 rounded-lg border ${saveResult.status === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : saveResult.status === 'auth_failed'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
            <p className="font-semibold">{saveResult.status ? saveResult.status.toUpperCase() : 'UNKNOWN'}</p>
            <p className="text-sm mt-1">{saveResult.message}</p>
          </div>
        )}
      </div>

      {/* Service Discovery */}
      {
        profile.cluster_host && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Service Discovery</h2>
              <button
                onClick={discoverServices}
                disabled={discovering}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm disabled:opacity-50 transition-all shadow-md hover:shadow-indigo-500/20"
              >
                {discovering ? (
                  <>
                    <span className="inline-block animate-spin mr-2">⟳</span>
                    Discovering...
                  </>
                ) : (
                  'Discover Services'
                )}
              </button>
            </div>

            {readiness && (
              <div className="mb-6 bg-muted/50 rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Readiness Score</span>
                  <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{readiness.score}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    style={{ width: `${readiness.score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {readiness.available_required} of {readiness.total_required} required services available
                </p>
              </div>
            )}

            {discovering && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-muted-foreground">Discovering services...</p>
              </div>
            )}

            {!discovering && services.length > 0 && (
              <div className="space-y-2">
                {services.map((service, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3 hover:bg-accent/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${service.auth_status === 'success' ? 'bg-emerald-500' :
                          service.tcp_available ? 'bg-amber-500' : 'bg-destructive'
                          } shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
                        <div>
                          <p className="font-medium">{service.description}</p>
                          <p className="text-xs text-muted-foreground">Port {service.port} ({service.protocol})</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${service.auth_status === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        service.tcp_available ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-destructive/10 text-destructive'
                        }`}>
                        {service.auth_status === 'success' ? 'Available' :
                          service.tcp_available ? 'Reachable' : 'Unavailable'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    </div >
  );
}
