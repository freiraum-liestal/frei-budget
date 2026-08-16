import { NavLink } from 'react-router-dom'
import { useUI } from '../context/UIContext'

export default function BottomNav() {
  const { openAddSheet } = useUI()

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="icon">🏠</span>
        <span>Übersicht</span>
      </NavLink>
      <NavLink to="/ausgaben" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="icon">📋</span>
        <span>Ausgaben</span>
      </NavLink>
      <button className="nav-item fab" onClick={openAddSheet} aria-label="Ausgabe hinzufügen">
        <span className="icon">+</span>
      </button>
      <NavLink to="/statistik" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="icon">📊</span>
        <span>Statistik</span>
      </NavLink>
      <NavLink to="/einstellungen" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="icon">⚙️</span>
        <span>Einstellungen</span>
      </NavLink>
    </nav>
  )
}
