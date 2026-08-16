import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function CloudSyncSection() {
  const { cloudEnabled, syncStatus, syncError, accessCode, state, joinTrip, createSharedTrip, leaveTrip } = useApp()
  const [codeInput, setCodeInput] = useState('')
  const [joinError, setJoinError] = useState('')
  const [busy, setBusy] = useState(false)
  const [migrateLocal, setMigrateLocal] = useState(true)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [copied, setCopied] = useState(false)
  const [createError, setCreateError] = useState('')

  if (!cloudEnabled) {
    return (
      <div className="card settings-section">
        <div className="card-title">Cloud-Synchronisierung</div>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Noch nicht eingerichtet. Dazu müssen <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          als Umgebungsvariablen gesetzt sein (siehe README, Abschnitt „Cloud-Synchronisierung einrichten").
        </p>
      </div>
    )
  }

  async function handleJoin() {
    if (!codeInput.trim()) {
      setJoinError('Bitte einen Zugriffscode eingeben.')
      return
    }
    setBusy(true)
    setJoinError('')
    try {
      await joinTrip(codeInput)
    } catch {
      setJoinError('Verbindung fehlgeschlagen. Bitte Code und Internetverbindung prüfen.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate() {
    setBusy(true)
    setCreateError('')
    try {
      await createSharedTrip(migrateLocal)
    } catch {
      setCreateError('Trip konnte nicht erstellt werden. Siehe Fehlermeldung unten oder Browser-Konsole für Details.')
    } finally {
      setBusy(false)
    }
  }

  function handleCopy() {
    if (!accessCode) return
    navigator.clipboard?.writeText(accessCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleLeave() {
    if (!confirmLeave) {
      setConfirmLeave(true)
      return
    }
    leaveTrip()
    setConfirmLeave(false)
  }

  if (syncStatus === 'synced' && accessCode) {
    return (
      <div className="card settings-section">
        <div className="card-title">Cloud-Synchronisierung</div>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Dieser Trip wird live mit allen synchronisiert, die diesen Code verwenden.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-bg)',
            border: '1px dashed var(--color-border)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 12
          }}
        >
          <span style={{ fontFamily: 'var(--font-numeric)', fontSize: 22, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-primary)' }}>
            {accessCode}
          </span>
          <button className="btn-text" onClick={handleCopy}>{copied ? 'Kopiert ✓' : 'Kopieren'}</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Teile diesen Code sicher mit deiner Partnerin (nicht öffentlich posten) – sie gibt ihn unten unter
          „Code eingeben" auf ihrem Gerät ein.
        </p>
        <button className="btn btn-secondary" onClick={handleLeave}>
          {confirmLeave ? 'Wirklich trennen? Nochmal tippen' : 'Trip verlassen (zurück zu lokal)'}
        </button>
      </div>
    )
  }

  return (
    <div className="card settings-section">
      <div className="card-title">Cloud-Synchronisierung</div>

      <div style={{ marginBottom: 20 }}>
        <label className="form-label">Code eingeben</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ textTransform: 'uppercase' }}
            placeholder="z.B. XK3F9Q"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }} onClick={handleJoin} disabled={busy}>
            Beitreten
          </button>
        </div>
        {joinError && <div className="form-error">{joinError}</div>}
        {syncStatus === 'error' && syncError && <div className="form-error">{syncError}</div>}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Noch keinen Code? Erstelle einen neuen gemeinsamen Trip in der Cloud.
        </p>
        {state.expenses.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={migrateLocal} onChange={(e) => setMigrateLocal(e.target.checked)} />
            Bestehende {state.expenses.length} lokale Ausgaben übernehmen
          </label>
        )}
        <button className="btn btn-secondary" onClick={handleCreate} disabled={busy}>
          {busy ? 'Erstelle…' : 'Neuen gemeinsamen Trip erstellen'}
        </button>
        {createError && <div className="form-error" style={{ marginTop: 10 }}>{createError}</div>}
        {syncError && <div className="form-error" style={{ marginTop: 10 }}>{syncError}</div>}
      </div>
    </div>
  )
}
