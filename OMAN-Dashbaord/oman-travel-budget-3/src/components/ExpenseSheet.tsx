import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { localISODate } from '../utils/date'
import { useUI } from '../context/UIContext'
import { formatCHF, getRate } from '../utils/currency'

function parseAmount(raw: string): number {
  // Akzeptiert "12.5", "12,5", "1'250.00" und "1 250" – egal welche iPhone-Tastatur.
  const normalized = raw.trim().replace(/['’\s]/g, '').replace(',', '.')
  return /^\d*\.?\d*$/.test(normalized) && normalized !== '' && normalized !== '.' ? parseFloat(normalized) : NaN
}

function todayISO() {
  return localISODate()
}

export default function ExpenseSheet() {
  const { isSheetOpen, editingExpense, closeSheet } = useUI()
  const { state, addExpense, updateExpense, deleteExpense } = useApp()

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(state.trip.localCurrency)
  const [categoryId, setCategoryId] = useState(state.settings.categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
  const [charged, setCharged] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!isSheetOpen) return
    if (editingExpense) {
      setAmount(editingExpense.originalAmount.toString())
      setCurrency(editingExpense.originalCurrency)
      setCategoryId(editingExpense.categoryId)
      setDescription(editingExpense.description)
      setDate(editingExpense.date)
    } else {
      setAmount('')
      setCurrency(state.trip.localCurrency)
      setCategoryId(state.settings.categories[0]?.id ?? '')
      setDescription('')
      setDate(todayISO())
    }
    setCharged('')
    setError('')
    setConfirmDelete(false)
  }, [isSheetOpen, editingExpense])

  if (!isSheetOpen) return null

  const numericAmount = parseAmount(amount)
  const chargedCHF = parseAmount(charged)
  const hasCharged = charged.trim() !== ''
  // Vorschau mit demselben Kurs, den das Speichern verwendet (beim Bearbeiten
  // bleibt der historische Kurs, solange die Währung gleich bleibt).
  const previewRate =
    editingExpense && editingExpense.originalCurrency === currency
      ? editingExpense.exchangeRate
      : getRate(state.settings.exchangeRates, currency)
  const previewCHF = !isNaN(numericAmount) ? Math.round(numericAmount * previewRate * 100) / 100 : null
  const fixedCategory = state.settings.categories.find((c) => c.id === categoryId)?.fixed === true
  const beforeTrip = date < state.trip.startDate
  const countsAsFixed = beforeTrip || fixedCategory

  async function handleSave() {
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Bitte einen gültigen Betrag grösser als 0 eingeben.')
      return
    }
    if (!categoryId) {
      setError('Bitte eine Kategorie wählen.')
      return
    }
    if (hasCharged && (isNaN(chargedCHF) || chargedCHF <= 0)) {
      setError('Effektiv belasteter Betrag ist ungültig – leer lassen oder Betrag > 0 eingeben.')
      return
    }
    const chargedValue = hasCharged && currency !== 'CHF' ? chargedCHF : undefined

    const payload = {
      date,
      description: description.trim() || (state.settings.categories.find((c) => c.id === categoryId)?.label ?? 'Ausgabe'),
      categoryId,
      originalAmount: numericAmount,
      originalCurrency: currency
    }

    closeSheet()
    if (editingExpense) {
      await updateExpense({ ...editingExpense, ...payload }, chargedValue)
    } else {
      await addExpense({ ...payload, chargedCHF: chargedValue })
    }
  }

  async function handleDelete() {
    if (!editingExpense) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    closeSheet()
    await deleteExpense(editingExpense.id)
  }

  return (
    <div className="sheet-overlay" onClick={closeSheet}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2>{editingExpense ? 'Ausgabe bearbeiten' : 'Ausgabe hinzufügen'}</h2>
          <button className="icon-btn" onClick={closeSheet} aria-label="Schliessen">✕</button>
        </div>

        <div className="form-group">
          <label className="form-label">Betrag</label>
          <div className="amount-input-row">
            <input
              className={`form-input ${error ? 'error' : ''}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <select className="form-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {state.settings.activeCurrencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {previewCHF !== null && currency !== 'CHF' && !hasCharged && (
            <div className="chf-preview">≈ {formatCHF(previewCHF)}</div>
          )}
          {currency !== 'CHF' && (
            <div style={{ marginTop: 10 }}>
              <label className="form-label">Effektiv belastet in CHF (optional)</label>
              <input
                className="form-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={editingExpense ? `aktuell ${formatCHF(editingExpense.amountCHF)}` : 'z.B. von der Kartenabrechnung'}
                value={charged}
                onChange={(e) => setCharged(e.target.value)}
              />
              <div className="form-hint">
                Wenn bekannt (Karten-App/Abrechnung): Dieser Betrag zählt, inkl. Gebühren. Der effektive Kurs wird mitgespeichert.
              </div>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">Kategorie</label>
          <div className="category-grid">
            {state.settings.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`category-option ${categoryId === cat.id ? 'selected' : ''}`}
                onClick={() => setCategoryId(cat.id)}
              >
                <span className="icon">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Beschreibung (optional)</label>
          <input
            className="form-input"
            type="text"
            placeholder="z.B. Abendessen"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Datum</label>
          <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {countsAsFixed && (
            <div className="form-hint">
              📌 Zählt als <strong>Vorab-/Fixkosten</strong>
              {beforeTrip ? ' (vor Reisebeginn bezahlt)' : ' (Fixkosten-Kategorie)'} – im Total enthalten, aber nicht im Tagesschnitt.
            </div>
          )}
        </div>

        <div className="form-hint" style={{ marginBottom: 14 }}>
          💡 Bancomat-Bezüge nicht als Ausgabe erfassen – nur die einzelnen Bar-Ausgaben. Die Bezugsgebühr gehört unter „Gebühren“.
        </div>

        <button className="btn btn-primary" onClick={handleSave}>
          {editingExpense ? 'Änderungen speichern' : 'Ausgabe speichern'}
        </button>

        {editingExpense && (
          <button
            className="btn btn-danger"
            style={{ marginTop: 10 }}
            onClick={handleDelete}
          >
            {confirmDelete ? 'Wirklich löschen? Nochmal tippen' : 'Ausgabe löschen'}
          </button>
        )}
      </div>
    </div>
  )
}
