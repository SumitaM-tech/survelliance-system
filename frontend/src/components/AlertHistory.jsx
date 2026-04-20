import React, { useEffect, useState, useCallback } from 'react';
import { API } from '../App';

const TYPE_META = {
  intrusion: { color: '#f97316', bg: '#431407', label: 'Intrusion', icon: '🚨' },
  fight:     { color: '#ef4444', bg: '#2d0607', label: 'Fight',     icon: '⚔️' },
  suspicious:{ color: '#a855f7', bg: '#2e1065', label: 'Suspicious', icon: '👁' },
};
const DEFAULT_META = { color: '#64748b', bg: '#1e293b', label: 'Unknown', icon: '❓' };

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export default function AlertHistory() {
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIncidents = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/api/incidents?limit=100`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setIncidents(data);
        else throw new Error('Unexpected response format');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchIncidents();
    const t = setInterval(fetchIncidents, 5000);
    return () => clearInterval(t);
  }, [fetchIncidents]);

  const filtered = filter === 'all' ? incidents : incidents.filter(i => i.type === filter);
  const counts = incidents.reduce((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>Alert History</h2>
        <span style={{ color: '#64748b', fontSize: 12 }}>Last 100 · auto-refresh 5s</span>
        {error && <span style={{ color: '#ef4444', fontSize: 11 }}>⚠ {error}</span>}
        <button
          onClick={fetchIncidents}
          disabled={loading}
          style={{
            marginLeft: 'auto', background: '#1f2937', border: '1px solid #374151',
            color: loading ? '#475569' : '#94a3b8', borderRadius: 6,
            padding: '4px 12px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12,
          }}>
          {loading ? '⟳ Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { key: 'all', label: 'Total', count: incidents.length, color: '#00d4ff', bg: '#0c1a2e' },
          ...Object.entries(TYPE_META).map(([k, v]) => ({ key: k, label: v.label, count: counts[k] || 0, color: v.color, bg: v.bg, icon: v.icon })),
        ].map(({ key, label, count, color, bg, icon }) => (
          <div key={key} onClick={() => setFilter(key)} style={{
            background: filter === key ? bg : '#111827',
            border: `1px solid ${filter === key ? color : '#2d3748'}`,
            borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s',
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>{icon} {label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
            <div>{loading ? 'Loading incidents…' : 'No incidents recorded yet.'}</div>
          </div>
        ) : filtered.map(inc => {
          const meta = TYPE_META[inc.type] || DEFAULT_META;
          return (
            <div key={inc.id} style={{
              background: '#111827', border: `1px solid ${meta.color}33`,
              borderLeft: `3px solid ${meta.color}`, borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 14,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    background: meta.bg, color: meta.color, border: `1px solid ${meta.color}`,
                    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  }}>{meta.label}</span>
                  <span style={{ color: '#475569', fontSize: 11 }}>#{inc.id}</span>
                </div>
                {inc.details && <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, wordBreak: 'break-word' }}>{inc.details}</div>}
                {inc.clip && <div style={{ color: '#475569', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>📹 {inc.clip}</div>}
              </div>
              <div style={{ color: '#475569', fontSize: 11, flexShrink: 0, textAlign: 'right' }}>
                <div>{timeAgo(inc.ts)}</div>
                <div style={{ marginTop: 2 }}>{new Date(inc.ts * 1000).toLocaleTimeString()}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
