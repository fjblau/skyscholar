import { useState } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import Flights from './components/Flights'
import Payloads from './components/Payloads'
import Admin from './components/Admin'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'flights', label: 'Flights' },
  { id: 'payloads', label: 'Sensor Payloads' },
  { id: 'admin', label: 'Admin' },
]

function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          Sky<span className="brand-accent">Scholar</span>
          <span className="brand-sub">Balloon Deployment & Trajectory Suite</span>
        </div>
        <div className="header-meta">Atmospheric Data Platform</div>
      </header>

      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'flights' && <Flights />}
        {tab === 'payloads' && <Payloads />}
        {tab === 'admin' && <Admin />}
      </main>
    </div>
  )
}

export default App
