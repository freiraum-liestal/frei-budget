import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { exportCSV, exportJSON, validateAndParseImport } from '../utils/exportImport'
import { formatCHF } from '../utils/currency'
import CloudSyncSection from '../components/CloudSyncSection'

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

export default function SettingsPage() {
  const { state, updateTrip, updateSettings, loadDemoData, clearDemoData, resetAll, importState } = useApp()
  const { trip, settings, expenses } = state
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [confirmReset, setConfirmReset] = useState(false)
  const [importMessage, setImportMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const hasDemoData = expenses.some((e) => e.id.startsWith('demo-'))
  const tripDays = daysBetween(trip.startDate, trip.endDate)

  function handleRateChange(currency: string, value: string) {
    const rate = parseFloat(value.replace(',', '.'))
    if (isNaN(rate)) return
    updateSettings({
      exchangeRates: settings.exchangeRates.map((r) => (r.currency === currency ? { ...r, rateToCHF: rate, updatedAt: new Date().toISOString() } : r))
    })
  }

  function handleImportFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = validateAndParseImport(reader.result as string)
      if (!result.success || !result.state) {
        setImportMessage({ text: result.error ?? 'Import fehlgeschlagen.', ok: false })
        return
      }
      importState(result.state)
      setImportMessage({ text: 'Backup erfolgreich importiert.', ok: true })
    }
    reader.readAsText(file)
  }

  function handleResetAll() {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    resetAll()
    setConfirmReset(false)
  }

  return (
    <div className="page">
      <header className="app-header"><h1>Einstellungen</h1></header>

      <CloudSyncSection />

      <div className="card settings-section">
        <div className="card-title">Reise einrichten</div>
        <div className="form-group">
          <label className="form-label">Reisename</label>
          <input className="form-input" value={trip.name} onChange={(e) => updateTrip({ name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Startdatum</label>
          <input className="form-input" type="date" value={trip.startDate} onChange={(e) => updateTrip({ startDate: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Enddatum</label>
          <input className="form-input" type="date" value={trip.endDate} onChange={(e) => updateTrip({ endDate: e.target.value })} />
        </div>
        <div className="settings-row">
          <span className="row-label">Reisetage</span>
          <span className="row-value">{tripDays} Tage</span>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">Gesamtbudget (CHF)</label>
          <input
            className="form-input"
            type="number"
            value={trip.budgetCHF}
            onChange={(e) => updateTrip({ budgetCHF: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="card settings-section">
        <div className="card-title">Währungen &amp; Wechselkurse</div>
        <div className="settings-row">
          <span className="row-label">Basiswährung</span>
          <span className="row-value">{trip.baseCurrency}</span>
        </div>
        <div className="settings-row">
          <span className="row-label">Lokale Währung</span>
          <select
            className="form-select"
            style={{ width: 100 }}
            value={trip.localCurrency}
            onChange={(e) => updateTrip({ localCurrency: e.target.value })}
          >
            {settings.exchangeRates.map((r) => (
              <option key={r.currency} value={r.currency}>{r.currency}</option>
            ))}
          </select>
        </div>
        {settings.exchangeRates
          .filter((r) => r.currency !== 'CHF')
          .map((r) => (
            <div className="form-group" key={r.currency} style={{ marginTop: 12 }}>
              <label className="form-label">1 {r.currency} = ? CHF</label>
              <input
                className="form-input"
                type="number"
                step="0.0001"
                value={r.rateToCHF}
                onChange={(e) => handleRateChange(r.currency, e.target.value)}
              />
            </div>
          ))}
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Kurse gelten für neu erfasste Ausgaben. Bereits gespeicherte Ausgaben behalten ihren ursprünglichen Kurs.
          Tipp: Kurs inkl. Fremdwährungsgebühr deiner Karte eintragen und nach der ersten Kartenabrechnung
          kalibrieren (CHF-Belastung ÷ OMR-Betrag). Einzelne Ausgaben können zusätzlich mit dem effektiv belasteten
          CHF-Betrag erfasst werden.
        </p>
      </div>

      <div className="card settings-section">
        <div className="card-title">Kategorien</div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Antippen, um eine Kategorie als <strong>Fixkosten</strong> 📌 zu markieren. Fixkosten zählen ins Total, aber
          nicht in den Tagesschnitt und die Prognose. Alles, was vor Reisebeginn datiert ist, zählt automatisch als
          Vorab-Kosten.
        </p>
        <div className="category-grid">
          {settings.categories.map((c) => (
            <button
              type="button"
              className={`category-option ${c.fixed ? 'selected' : ''}`}
              key={c.id}
              onClick={() =>
                updateSettings({
                  categories: settings.categories.map((x) => ({ ...x, fixed: x.id === c.id ? !c.fixed : x.fixed === true }))
                })
              }
            >
              <span className="icon">{c.icon}</span>
              <span>{c.label}</span>
              {c.fixed && <span className="chip-toggle on">📌 Fix</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="card settings-section">
        <div className="card-title">Daten</div>
        <button className="btn btn-secondary" style={{ marginBottom: 10 }} onClick={() => exportCSV(expenses, settings.categories, trip)}>
          CSV exportieren
        </button>
        <button className="btn btn-secondary" style={{ marginBottom: 10 }} onClick={() => exportJSON(state)}>
          JSON-Backup exportieren
        </button>
        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
          JSON-Backup importieren
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImportFile(file)
            e.target.value = ''
          }}
        />
        {importMessage && (
          <p style={{ fontSize: 13, marginTop: 10, color: importMessage.ok ? 'var(--color-positive)' : 'var(--color-danger)' }}>
            {importMessage.text}
          </p>
        )}
      </div>

      <div className="card settings-section">
        <div className="card-title">Demo-Daten</div>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Lädt Beispielausgaben, um die App auszuprobieren ({formatCHF(1200)} Testdaten über 5 Tage).
        </p>
        {hasDemoData ? (
          <button className="btn btn-secondary" onClick={clearDemoData}>Demo-Daten löschen</button>
        ) : (
          <button className="btn btn-secondary" onClick={loadDemoData}>Demo-Daten laden</button>
        )}
      </div>

      <div className="card settings-section">
        <div className="card-title">Gefahrenzone</div>
        <button className="btn btn-danger" onClick={handleResetAll}>
          {confirmReset ? 'Wirklich alle Daten löschen? Nochmal tippen' : 'Alle Daten löschen'}
        </button>
      </div>
    </div>
  )
}
