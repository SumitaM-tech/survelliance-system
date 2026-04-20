import React, { useEffect, useRef, useState } from 'react';
import { API } from '../App';

const crowdColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
const crowdBg = { low: '#052e16', medium: '#431407', high: '#2d0607' };

export default function LiveFeed() {
  const [src, setSrc] = useState('');
  const [crowd, setCrowd] = useState({ count: 0, level: 'low' });
  const [ts, setTs] = useState(null);
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    const poll = () => {
      fetch(`${API}/api/frame`)
        .then(r => r.json())
        .then(data => {
          if (data.frame) {
            setSrc(`data:image/jpeg;base64,${data.frame}`);
            setCrowd(data.crowd || { count: 0, level: 'low' });
            setTs(data.ts);
            setConnected(true);
          }
        })
        .catch(() => setConnected(false));
    };
    poll();
    intervalRef.current = setInterval(poll, 500);
    return () => clearInterval(intervalRef.current);
  }, []);

  const cc = crowdColor[crowd.level] || '#22c55e';
  const cbg = crowdBg[crowd.level] || '#052e16';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>Live Feed</h2>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? '#22c55e' : '#ef4444',
          boxShadow: connected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
          display: 'inline-block',
        }} />
        <span style={{ color: '#64748b', fontSize: 12 }}>
          {connected ? 'Connected' : 'Waiting for stream…'}
        </span>
        {ts && (
          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>
            Last frame: {new Date(ts * 1000).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* Video frame */}
        <div style={{
          background: '#111827',
          border: '1px solid #2d3748',
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
          aspectRatio: '4/3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {src ? (
            <img src={src} alt="live" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          ) : (
            <div style={{ textAlign: 'center', color: '#475569' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
              <div>Waiting for local stream…</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Start main.py on your machine</div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Crowd density card */}
          <div style={{
            background: cbg,
            border: `1px solid ${cc}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Crowd Density
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, color: cc, lineHeight: 1 }}>
              {crowd.count}
            </div>
            <div style={{ fontSize: 13, color: cc, marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>
              {crowd.level}
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['low', 'medium', 'high'].map(lvl => (
                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: crowd.level === lvl ? crowdColor[lvl] : '#2d3748',
                    transition: 'background 0.3s',
                  }} />
                  <span style={{ color: crowd.level === lvl ? crowdColor[lvl] : '#475569', fontSize: 12, textTransform: 'capitalize' }}>
                    {lvl} {lvl === 'low' ? '(0–2)' : lvl === 'medium' ? '(3–6)' : '(7+)'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Detection Legend
            </div>
            {[
              { color: '#22c55e', label: 'Normal person' },
              { color: '#f97316', label: 'Zone intrusion' },
              { color: '#ef4444', label: 'Fight / Anger' },
              { color: '#a855f7', label: 'Suspicious movement' },
              { color: '#facc15', label: 'Pose keypoints' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: '#94a3b8', fontSize: 12 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
