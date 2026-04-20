import React, { useEffect, useRef, useState, useCallback } from 'react';
import { API } from '../App';

const CANVAS_W = 640;
const CANVAS_H = 480;

export default function ZoneEditor() {
  const canvasRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [currentPts, setCurrentPts] = useState([]);
  const [zoneName, setZoneName] = useState('Zone 1');
  const [bgSrc, setBgSrc] = useState('');
  const [status, setStatus] = useState('');

  // Fetch latest frame for background
  useEffect(() => {
    fetch(`${API}/api/frame`)
      .then(r => r.json())
      .then(d => { if (d.frame) setBgSrc(`data:image/jpeg;base64,${d.frame}`); })
      .catch(() => {});
  }, []);

  const fetchZones = useCallback(() => {
    fetch(`${API}/api/zones`)
      .then(r => r.json())
      .then(setZones)
      .catch(() => {});
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw background
    if (bgSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        drawOverlay(ctx);
      };
      img.src = bgSrc;
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#475569';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No live frame — start main.py', CANVAS_W / 2, CANVAS_H / 2);
      drawOverlay(ctx);
    }

    function drawOverlay(ctx) {
      // Saved zones
      zones.forEach((zone, i) => {
        const pts = zone.points;
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,212,255,0.12)';
        ctx.fill();
        ctx.fillStyle = '#00d4ff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(zone.name, pts[0][0] + 4, pts[0][1] - 6);
      });

      // Active drawing
      if (currentPts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(currentPts[0][0], currentPts[0][1]);
        currentPts.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        currentPts.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#f97316';
          ctx.fill();
        });
      }
    }
  }, [zones, currentPts, bgSrc]);

  const handleCanvasClick = (e) => {
    if (!drawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    setCurrentPts(prev => [...prev, [x, y]]);
  };

  const saveZone = async () => {
    if (currentPts.length < 3) {
      setStatus('Need at least 3 points to save a zone.');
      return;
    }
    try {
      const res = await fetch(`${API}/api/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zoneName, points: currentPts }),
      });
      if (res.ok) {
        setCurrentPts([]);
        setDrawing(false);
        setStatus(`Zone "${zoneName}" saved.`);
        fetchZones();
        setZoneName(`Zone ${zones.length + 2}`);
      }
    } catch {
      setStatus('Failed to save zone.');
    }
  };

  const deleteZone = async (id) => {
    await fetch(`${API}/api/zones/${id}`, { method: 'DELETE' });
    setStatus('Zone deleted.');
    fetchZones();
  };

  const cancelDraw = () => {
    setCurrentPts([]);
    setDrawing(false);
    setStatus('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Zone Editor</h2>
        <span style={{ color: '#64748b', fontSize: 12 }}>Draw restricted zones on the live frame</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Canvas */}
        <div>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            onClick={handleCanvasClick}
            style={{
              width: '100%',
              border: `2px solid ${drawing ? '#f97316' : '#2d3748'}`,
              borderRadius: 10,
              cursor: drawing ? 'crosshair' : 'default',
              display: 'block',
              transition: 'border-color 0.2s',
            }}
          />
          {drawing && (
            <p style={{ color: '#f97316', fontSize: 12, marginTop: 8 }}>
              🖊 Click to add points ({currentPts.length} placed). Need ≥3 to save.
            </p>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Zone name */}
          <div style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 10, padding: 16 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
              Zone Name
            </label>
            <input
              value={zoneName}
              onChange={e => setZoneName(e.target.value)}
              style={{
                width: '100%', background: '#1f2937', border: '1px solid #374151',
                color: '#e2e8f0', borderRadius: 6, padding: '8px 10px', fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!drawing ? (
              <button onClick={() => { setDrawing(true); setCurrentPts([]); setStatus(''); }}
                style={btnStyle('#f97316', '#431407')}>
                ✏️ Start Drawing
              </button>
            ) : (
              <>
                <button onClick={saveZone} style={btnStyle('#22c55e', '#052e16')}>
                  ✅ Save Zone
                </button>
                <button onClick={cancelDraw} style={btnStyle('#64748b', '#1e293b')}>
                  ✖ Cancel
                </button>
              </>
            )}
          </div>

          {status && (
            <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 10, fontSize: 12, color: '#94a3b8' }}>
              {status}
            </div>
          )}

          {/* Existing zones list */}
          <div style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase' }}>
              Saved Zones ({zones.length})
            </div>
            {zones.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 12 }}>No zones defined yet.</p>
            ) : (
              zones.map(z => (
                <div key={z.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', background: '#1f2937', borderRadius: 6, marginBottom: 6,
                }}>
                  <div>
                    <div style={{ color: '#00d4ff', fontSize: 12, fontWeight: 600 }}>{z.name}</div>
                    <div style={{ color: '#475569', fontSize: 11 }}>{z.points.length} pts</div>
                  </div>
                  <button
                    onClick={() => deleteZone(z.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ background: '#111827', border: '1px solid #2d3748', borderRadius: 10, padding: 14, fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
            <strong style={{ color: '#94a3b8' }}>How to use:</strong><br />
            1. Click "Start Drawing"<br />
            2. Click on frame to place points<br />
            3. Place ≥3 points, then "Save Zone"<br />
            4. Zone activates in ~5 seconds<br />
            5. Delete zones with 🗑
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(color, bg) {
  return {
    background: bg,
    border: `1px solid ${color}`,
    color: color,
    borderRadius: 8,
    padding: '10px 0',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    width: '100%',
    transition: 'opacity 0.2s',
  };
}
