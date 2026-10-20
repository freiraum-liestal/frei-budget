import type { AppState, Category, Expense, Trip } from '../types'
import { isFixedCost } from './calculations'

function categoryLabel(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id
}

export function expensesToCSV(expenses: Expense[], categories: Category[], trip: Trip): string {
  const header = ['Datum', 'Beschreibung', 'Kategorie', 'Typ', 'Originalbetrag', 'Originalwährung', 'Wechselkurs', 'CHF-Betrag']
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [
      e.date,
      csvEscape(e.description),
      csvEscape(categoryLabel(categories, e.categoryId)),
      isFixedCost(e, trip, categories) ? 'Vorab/Fix' : 'Laufend',
      e.originalAmount.toString(),
      e.originalCurrency,
      e.exchangeRate.toString(),
      e.amountCHF.toString()
    ])
  return [header, ...rows].map((r) => r.join(';')).join('\r\n')
}

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportCSV(expenses: Expense[], categories: Category[], trip: Trip) {
  const tripName = trip.name
  const csv = expensesToCSV(expenses, categories, trip)
  // BOM für korrekte Umlaute-Darstellung in Excel
  downloadFile('\uFEFF' + csv, `${slugify(tripName)}-ausgaben.csv`, 'text/csv;charset=utf-8')
}

export function exportJSON(state: AppState) {
  downloadFile(JSON.stringify(state, null, 2), `${slugify(state.trip.name)}-backup.json`, 'application/json')
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export interface ImportResult {
  success: boolean
  error?: string
  state?: AppState
}

/** Validiert eine importierte JSON-Backup-Datei, bevor sie übernommen wird. */
export function validateAndParseImport(raw: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { success: false, error: 'Die Datei enthält kein gültiges JSON.' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: 'Unerwartetes Datenformat.' }
  }

  const obj = parsed as Record<string, unknown>
  if (!obj.trip || !Array.isArray(obj.expenses) || !obj.settings) {
    return { success: false, error: 'Die Datei enthält keine gültige Sicherung (trip/expenses/settings fehlen).' }
  }

  const trip = obj.trip as Record<string, unknown>
  if (typeof trip.id !== 'string' || typeof trip.budgetCHF !== 'number') {
    return { success: false, error: 'Reisedaten in der Datei sind unvollständig.' }
  }

  for (const exp of obj.expenses as unknown[]) {
    const e = exp as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.amountCHF !== 'number' || typeof e.date !== 'string') {
      return { success: false, error: 'Mindestens eine Ausgabe in der Datei ist ungültig.' }
    }
  }

  return { success: true, state: parsed as AppState }
}
