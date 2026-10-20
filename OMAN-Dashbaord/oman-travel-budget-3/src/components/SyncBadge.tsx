import { useApp } from '../context/AppContext'

export default function SyncBadge() {
  const { syncStatus, syncError, pendingCount, retryPendingSync } = useApp()

  if (syncStatus === 'local') return null

  const config = {
    connecting: { icon: '☁️', label: 'Verbinde…', color: 'var(--color-text-muted)' },
    synced: { icon: '🟢', label: 'Synchronisiert', color: 'var(--color-positive)' },
    offline: { icon: '📴', label: 'Offline', color: 'var(--color-warning)' }
  }[syncStatus]

  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: config.color, marginTop: 4 }}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </div>
      {(pendingCount > 0 || (syncStatus === 'offline' && syncError)) && (
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
            {pendingCount > 0
              ? `⏳ ${pendingCount} Änderung${pendingCount > 1 ? 'en' : ''} auf dem Gerät gespeichert, noch nicht synchronisiert`
              : syncError}
          </span>
          <button className="btn-text" style={{ padding: 0, fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => retryPendingSync()}>
            Jetzt syncen
          </button>
        </div>
      )}
    </div>
  )
}
