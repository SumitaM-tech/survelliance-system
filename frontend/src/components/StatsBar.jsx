import React, { useEffect, useState } from 'react';
import { API } from '../App';

const crowdColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };

export default function StatsBar() {
  const [stats, setStats] = useState({ total: 0, by_type: {}, crowd: { count: 0, level: 'low' } });

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/api/stats`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 3000);
    return () => clearInterval(t);
  }, []);

  const { crowd, total, by_type } = stats;
  const cc = crowdColor[crowd?.level] || '#22c55e';

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
      <div style={{
        background: '#1f2937',
        border: `1px solid ${cc}`,
        borderRadius: 8,
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ color: '#64748b' }}>Crowd</span>
        <span style={{ color: cc, fontWeight: 700, textTransform: 'uppercase' }}>
          {crowd?.level} ({crowd?.count})
        </span>
      </div>
      <div style={{
        background: '#1f2937',
        border: '1px solid #2d3748',
        borderRadius: 8,
        padding: '4px 12px',
        display: 'flex',
        gap: 10,
      }}>
        <span style={{ color: '#64748b' }}>Alerts:</span>
        <span style={{ color: '#f97316' }}>I:{by_type?.intrusion || 0}</span>
        <span style={{ color: '#ef4444' }}>F:{by_type?.fight || 0}</span>
        <span style={{ color: '#a855f7' }}>S:{by_type?.suspicious || 0}</span>
      </div>
    </div>
  );
}
