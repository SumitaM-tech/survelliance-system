import React, { useEffect, useState, useCallback } from 'react';
import { API } from '../App';

const THREAT_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const THREAT_BG    = { high: '#2d0607', medium: '#431407', low: '#052e16' };

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  );
}

export default function BehaviorPanel() {
  const [predictions, setPredictions]   = useState([]);
  const [personStats, setPersonStats]   = useState([]);
  const [history, setHistory]           = useState([]);
  const [modelTrained, setModelTrained] = useState(false);
  const [tab, setTab]                   = useState('live');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API}/api/predictions`).then(r => { if (!r.ok) throw new Error(`predictions HTTP ${r.status}`); return r.json(); }),
      fetch(`${API}/api/behavior/stats`).then(r => { if (!r.ok) throw new Error(`stats HTTP ${r.status}`); return r.json(); }),
      fetch(`${API}/api/behavior/history?limit=50`).then(r => { if (!r.ok) throw new Error(`history HTTP ${r.status}`); return r.json(); }),
    ])
      .then(([pred, stats, hist]) => {
        setPredictions(Array.isArray(pred.predictions) ? pred.predictions : []);
        setPersonStats(Array.isArray(stats.persons) ? stats.persons : []);
        setModelTrained(!!stats.model_trained);
        setHistory(Array.isArray(hist) ? hist : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 2000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const highCount = predictions.filter(p => p.threat_level === 'high').length;
  const medCount  = predictions.filter(p => p.threat_level === 'medium').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>Behavior Analysis</h2>
        <span style={{
          background: modelTrained ? '#052e16' : '#1c1c1c',
          border: `1px solid ${modelTrained ? '#22c55e' : '#374151'}`,
          color: modelTrained ? '#22c55e' : '#64748b',
          borderRadius: 4, padding: '2px 8px', fontSize: 11,
        }}>
          {modelTrained ? '🧠 AI Model Active' : '📊 Z-Score Mode'}
        </span>
        {error && <span style={{ color: '#ef4444', fontSize: 11 }}>⚠ {error}</span>}
        <button onClick={fetchAll} disabled={loading} style={{
          marginLeft: 'auto', background: '#1f2937', border: '1px solid #374151',
          color: loading ? '#475569' : '#94a3b8', borderRadius: 6,
          padding: '4px 12px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12,
        }}>
          {loading ? '⟳' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Tracked',     value: personStats.length,    color: '#00d4ff' },
          { label: 'Predictions', value: predictions.length,    color: '#94a3b8' },
          { label: 'High Threat', value: highCount,             color: '#ef4444' },
          { label: 'Medium',      value: medCount,              color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #2d3748' }}>
        {[['live', 'Live Predictions'], ['persons', 'Per-Person Stats'], ['history', 'Event History']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '6px 16px', background: 'none', border: 'none',
            borderBottom: tab === key ? '2px solid #00d4ff' : '2px solid transparent',
            color: tab === key ? '#00d4ff' : '#64748b',
            fontWeight: tab === key ? 600 : 400, cursor: 'pointer', fontSize: 13,
          }}>{label}</button>
        ))}
      </div>

      {/* Live Predictions */}
      {tab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {predictions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧬</div>
              <div>No active predictions — start local/main.py to feed data</div>
            </div>
          ) : predictions.map((p, i) => {
            const tc = THREAT_COLOR[p.threat_level] || '#64748b';
            const tb = THREAT_BG[p.threat_level] || '#1e293b';
            return (
              <div key={i} style={{
                background: '#111827', border: `1px solid ${tc}44`,
                borderLeft: `3px solid ${tc}`, borderRadius: 8, padding: '12px 16px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Person #{p.person_id}</span>
                    <span style={{ background: tb, color: tc, border: `1px solid ${tc}`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                      {p.threat_level}
                    </span>
                    <span style={{ color: '#475569', fontSize: 11 }}>{p.type}</span>
                    {p.dwell_secs && <span style={{ color: '#64748b', fontSize: 11 }}>⏱ {p.dwell_secs}s dwell</span>}
                  </div>
                  {p.reasons && p.reasons.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.reasons.map((r, j) => (
                        <span key={j} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>{r}</span>
                      ))}
                    </div>
                  )}
                </div>
                {p.anomaly_score !== undefined && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: tc, fontSize: 20, fontWeight: 700 }}>
                      {(Math.min(p.anomaly_score / 3, 1) * 100).toFixed(0)}%
                    </div>
                    <div style={{ color: '#475569', fontSize: 11 }}>z={p.anomaly_score.toFixed(1)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-Person Stats */}
      {tab === 'persons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {personStats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
              <div>No tracked persons yet</div>
            </div>
          ) : personStats.map(p => {
            const tc = THREAT_COLOR[p.threat_level] || '#64748b';
            const maxDwell  = Math.max(...personStats.map(x => x.dwell_secs || 0), 1);
            const maxVisits = Math.max(...personStats.map(x => x.visit_count || 0), 1);
            return (
              <div key={p.pid} style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13 }}>Person #{p.pid}</span>
                  <span style={{ background: THREAT_BG[p.threat_level] || '#1e293b', color: tc, border: `1px solid ${tc}`, borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                    {p.threat_level || 'low'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#64748b', fontSize: 11 }}>Dwell time</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>{(p.dwell_secs || 0).toFixed(1)}s</span>
                    </div>
                    <Bar value={p.dwell_secs || 0} max={maxDwell} color={(p.dwell_secs || 0) > 60 ? '#ef4444' : '#3b82f6'} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#64748b', fontSize: 11 }}>Visit count</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.visit_count || 0}</span>
                    </div>
                    <Bar value={p.visit_count || 0} max={maxVisits} color={(p.visit_count || 0) > 3 ? '#f59e0b' : '#22c55e'} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#64748b', fontSize: 11 }}>Avg velocity</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>{(p.velocity || 0).toFixed(1)} px/s</span>
                    </div>
                    <Bar value={p.velocity || 0} max={100} color='#a855f7' />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#64748b', fontSize: 11 }}>Anomaly score (z)</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>{(p.anomaly_score || 0).toFixed(2)}</span>
                    </div>
                    <Bar value={p.anomaly_score || 0} max={3} color={(p.anomaly_score || 0) > 2 ? '#ef4444' : '#3b82f6'} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event History */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📜</div>
              <div>No behavior events stored yet</div>
            </div>
          ) : history.map(ev => {
            const tc = THREAT_COLOR[ev.threat_level] || '#64748b';
            return (
              <div key={ev.id} style={{
                background: '#111827', border: `1px solid ${tc}33`,
                borderLeft: `3px solid ${tc}`, borderRadius: 8, padding: '10px 14px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Person #{ev.person_id}</span>
                    <span style={{ background: THREAT_BG[ev.threat_level] || '#1e293b', color: tc, border: `1px solid ${tc}`, borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                      {ev.threat_level}
                    </span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{ev.event_type}</span>
                  </div>
                  {ev.reasons && ev.reasons.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ev.reasons.map((r, j) => (
                        <span key={j} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>{r}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ color: '#475569', fontSize: 11, flexShrink: 0, textAlign: 'right' }}>
                  <div>{timeAgo(ev.ts)}</div>
                  <div style={{ marginTop: 2 }}>{new Date(ev.ts * 1000).toLocaleTimeString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
