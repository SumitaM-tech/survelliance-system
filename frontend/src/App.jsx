import React, { useState } from 'react';
import LiveFeed from './components/LiveFeed';
import ZoneEditor from './components/ZoneEditor';
import AlertHistory from './components/AlertHistory';
import StatsBar from './components/StatsBar';
import BehaviorPanel from './components/BehaviorPanel';

const API = process.env.REACT_APP_API_URL || '';
export { API };

const tabs = ['Live Feed', 'Behavior Analysis', 'Zone Editor', 'Alert History'];

const styles = {
  shell: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: {
    background: 'linear-gradient(90deg, #0a0e1a 0%, #111827 100%)',
    borderBottom: '1px solid #2d3748',
    padding: '12px 24px',
    display: 'flex', alignItems: 'center', gap: 16,
  },
  logo: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#00d4ff', boxShadow: '0 0 12px #00d4ff', flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.05em' },
  nav: { background: '#111827', borderBottom: '1px solid #2d3748', display: 'flex', padding: '0 24px' },
  tabBtn: (active) => ({
    padding: '10px 20px', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
    color: active ? '#00d4ff' : '#64748b',
    fontWeight: active ? 600 : 400, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s',
  }),
  main: { flex: 1, padding: 24, maxWidth: 1400, margin: '0 auto', width: '100%' },
};

export default function App() {
  const [tab, setTab] = useState(0);
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.logo} />
        <span style={styles.title}>AI Smart Surveillance</span>
        <div style={{ marginLeft: 'auto' }}><StatsBar /></div>
      </header>
      <nav style={styles.nav}>
        {tabs.map((t, i) => (
          <button key={t} style={styles.tabBtn(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </nav>
      <main style={styles.main}>
        {tab === 0 && <LiveFeed />}
        {tab === 1 && <BehaviorPanel />}
        {tab === 2 && <ZoneEditor />}
        {tab === 3 && <AlertHistory />}
      </main>
    </div>
  );
}
