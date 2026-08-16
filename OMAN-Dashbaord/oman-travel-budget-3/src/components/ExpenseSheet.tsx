import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useUI } from '../context/UIContext'
import { convertToCHF, formatCHF } from '../utils/currency'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function ExpenseSheet() {
  const { isSheetOpen, editingExpense, closeSheet } = useUI()
  const { state, addExpense, updateExpense, deleteExpense } = useApp()

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(state.trip.localCurrency)
  const [categoryId, setCategoryId] = useState(state.settings.categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
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
    setError('')
    setConfirmDelete(false)
  }, [isSheetOpen, editingExpense])

  if (!isSheetOpen) return null

  const numericAmount = parseFloat(amount.replace(',', '.'))
  const previewCHF = !isNaN(numericAmount) ? convertToCHF(numericAmount, currency, state.settings.exchangeRates) : null

  async function handleSave() {
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Bitte einen gültigen Betrag grösser als 0 eingeben.')
      return
    }
    if (!categoryId) {
      setError('Bitte eine Kategorie wählen.')
      return
    }

    const payload = {
      date,
      description: description.trim() || (state.settings.categories.find((c) => c.id === categoryId)?.label ?? 'Ausgabe'),
      categoryId,
      originalAmount: numericAmount,
      originalCurrency: currency
    }

    closeSheet()
    if (editingExpense) {
      await updateExpense({ ...editingExpense, ...payload })
    } else {
      await addExpense(payload)
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
              type="number"
              inputMode="decimal"
              step="0.001"
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
          {previewCHF !== null && currency !== 'CHF' && (
            <div className="chf-preview">≈ {formatCHF(previewCHF)}</div>
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
