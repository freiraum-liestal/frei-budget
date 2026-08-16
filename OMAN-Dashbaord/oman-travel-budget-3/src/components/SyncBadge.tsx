import { useApp } from '../context/AppContext'

export default function SyncBadge() {
  const { syncStatus, syncError, state, retryPendingSync } = useApp()

  if (syncStatus === 'local') return null

  const pendingCount = state.expenses.filter((e) => e.pendingSync).length

  const config = {
    connecting: { icon: '☁️', label: 'Verbinde…', color: 'var(--color-text-muted)' },
    synced: { icon: '🟢', label: 'Synchronisiert', color: 'var(--color-positive)' },
    error: { icon: '⚠️', label: 'Sync-Fehler', color: 'var(--color-danger)' }
  }[syncStatus]

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: config.color, marginTop: 4 }}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
        {syncStatus === 'error' && syncError && (
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>· {syncError}</span>
        )}
      </div>
      {pendingCount > 0 && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--color-warning)',
            background: 'var(--color-warning-bg)',
            padding: '6px 10px',
            borderRadius: 8
          }}
        >
          <span>
            ⏳ {pendingCount} Ausgabe{pendingCount > 1 ? 'n' : ''} noch nicht synchronisiert (kein Netz?)
          </span>
          <button className="btn-text" style={{ padding: 0, fontSize: 12 }} onClick={() => retryPendingSync()}>
            Erneut versuchen
          </button>
        </div>
      )}
    </div>
  )
}
