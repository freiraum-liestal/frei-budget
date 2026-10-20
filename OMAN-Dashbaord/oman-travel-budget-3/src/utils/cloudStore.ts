import { supabase } from './supabaseClient'
import type { AppSettings, Expense, Trip } from '../types'
import { DEFAULT_CATEGORIES, normalizeCategories } from './defaults'

// ============================================================================
// Mapping zwischen App-Modell (camelCase) und Supabase-Tabellen (snake_case)
// ============================================================================

interface TripRow {
  id: string
  access_code: string
  name: string
  start_date: string
  end_date: string
  budget_chf: number
  base_currency: string
  local_currency: string
  exchange_rates: AppSettings['exchangeRates']
  categories: AppSettings['categories']
  active_currencies: string[]
  created_at: string
  updated_at: string
}

interface ExpenseRow {
  id: string
  trip_id: string
  date: string
  description: string
  category_id: string
  original_amount: number
  original_currency: string
  exchange_rate: number
  amount_chf: number
  owner_id: string
  created_at: string
  updated_at: string
}

function tripFromRow(row: TripRow): { trip: Trip; settings: AppSettings } {
  return {
    trip: {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      budgetCHF: row.budget_chf,
      baseCurrency: row.base_currency,
      localCurrency: row.local_currency,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    settings: {
      exchangeRates: row.exchange_rates,
      categories: normalizeCategories(row.categories?.length ? row.categories : DEFAULT_CATEGORIES),
      activeCurrencies: row.active_currencies
    }
  }
}

function expenseFromRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    date: row.date,
    description: row.description,
    categoryId: row.category_id,
    originalAmount: Number(row.original_amount),
    originalCurrency: row.original_currency,
    exchangeRate: Number(row.exchange_rate),
    amountCHF: Number(row.amount_chf),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: 'shared'
  }
}

function generateAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ohne verwechselbare Zeichen (0/O, 1/I)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

export interface CloudTripBundle {
  trip: Trip
  settings: AppSettings
  expenses: Expense[]
  accessCode: string
}

export class CloudError extends Error {}

function requireClient() {
  if (!supabase) {
    throw new CloudError(
      'Cloud-Synchronisierung ist nicht eingerichtet. VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen.'
    )
  }
  return supabase
}

/** Erstellt einen neuen gemeinsamen Trip in der Cloud und gibt den Zugriffscode zurück. */
export async function createCloudTrip(seed: { trip: Trip; settings: AppSettings; expenses: Expense[] }): Promise<CloudTripBundle> {
  const client = requireClient()
  let accessCode = generateAccessCode()

  const { data: tripRow, error: tripError } = await client
    .from('trips')
    .insert({
      access_code: accessCode,
      name: seed.trip.name,
      start_date: seed.trip.startDate,
      end_date: seed.trip.endDate,
      budget_chf: seed.trip.budgetCHF,
      base_currency: seed.trip.baseCurrency,
      local_currency: seed.trip.localCurrency,
      exchange_rates: seed.settings.exchangeRates,
      categories: seed.settings.categories,
      active_currencies: seed.settings.activeCurrencies
    })
    .select()
    .single()

  if (tripError || !tripRow) {
    throw new CloudError(`Trip konnte nicht erstellt werden: ${tripError?.message ?? 'unbekannter Fehler'}`)
  }

  // Demo-Daten nie in die Cloud übernehmen
  const realExpenses = seed.expenses.filter((e) => !e.id.startsWith('demo-'))
  if (realExpenses.length > 0) {
    const rows = realExpenses.map((e) => ({
      trip_id: tripRow.id,
      date: e.date,
      description: e.description,
      category_id: e.categoryId,
      original_amount: e.originalAmount,
      original_currency: e.originalCurrency,
      exchange_rate: e.exchangeRate,
      amount_chf: e.amountCHF
    }))
    const { error: expError } = await client.from('expenses').insert(rows)
    if (expError) {
      throw new CloudError(`Bestehende Ausgaben konnten nicht übernommen werden: ${expError.message}`)
    }
  }

  return joinCloudTrip(accessCode)
}

/** Tritt einem bestehenden Trip über den geteilten Zugriffscode bei. */
export async function joinCloudTrip(accessCode: string): Promise<CloudTripBundle> {
  const client = requireClient()
  const normalizedCode = accessCode.trim().toUpperCase()

  const { data: tripRow, error: tripError } = await client
    .from('trips')
    .select('*')
    .eq('access_code', normalizedCode)
    .single()

  if (tripError || !tripRow) {
    throw new CloudError('Kein Trip mit diesem Zugriffscode gefunden. Bitte Code prüfen.')
  }

  const { data: expenseRows, error: expError } = await client
    .from('expenses')
    .select('*')
    .eq('trip_id', tripRow.id)
    .order('date', { ascending: false })

  if (expError) {
    throw new CloudError(`Ausgaben konnten nicht geladen werden: ${expError.message}`)
  }

  const { trip, settings } = tripFromRow(tripRow as TripRow)
  return {
    trip,
    settings,
    expenses: (expenseRows as ExpenseRow[]).map(expenseFromRow),
    accessCode: normalizedCode
  }
}

/** Speichert eine Ausgabe (neu oder geändert). Idempotent: Wenn ein früherer
 *  Versuch beim Server angekommen ist, aber die Antwort verloren ging (wackliges
 *  Netz), überschreibt der nächste Versuch dieselbe Zeile statt am
 *  Primary Key zu scheitern. */
export async function cloudUpsertExpense(expense: Expense): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('expenses').upsert(
    {
      id: expense.id,
      trip_id: expense.tripId,
      date: expense.date,
      description: expense.description,
      category_id: expense.categoryId,
      original_amount: expense.originalAmount,
      original_currency: expense.originalCurrency,
      exchange_rate: expense.exchangeRate,
      amount_chf: expense.amountCHF
    },
    { onConflict: 'id' }
  )
  if (error) throw new CloudError(`Ausgabe konnte nicht gespeichert werden: ${error.message}`)
}

export async function cloudDeleteExpense(id: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('expenses').delete().eq('id', id)
  if (error) throw new CloudError(`Ausgabe konnte nicht gelöscht werden: ${error.message}`)
}

export async function cloudUpdateTrip(tripId: string, patch: Partial<Trip>): Promise<void> {
  const client = requireClient()
  const payload: Record<string, unknown> = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.startDate !== undefined) payload.start_date = patch.startDate
  if (patch.endDate !== undefined) payload.end_date = patch.endDate
  if (patch.budgetCHF !== undefined) payload.budget_chf = patch.budgetCHF
  if (patch.baseCurrency !== undefined) payload.base_currency = patch.baseCurrency
  if (patch.localCurrency !== undefined) payload.local_currency = patch.localCurrency

  const { error } = await client.from('trips').update(payload).eq('id', tripId)
  if (error) throw new CloudError(`Trip konnte nicht aktualisiert werden: ${error.message}`)
}

export async function cloudUpdateSettings(tripId: string, patch: Partial<AppSettings>): Promise<void> {
  const client = requireClient()
  const payload: Record<string, unknown> = {}
  if (patch.exchangeRates !== undefined) payload.exchange_rates = patch.exchangeRates
  if (patch.categories !== undefined) payload.categories = patch.categories
  if (patch.activeCurrencies !== undefined) payload.active_currencies = patch.activeCurrencies

  const { error } = await client.from('trips').update(payload).eq('id', tripId)
  if (error) throw new CloudError(`Einstellungen konnten nicht gespeichert werden: ${error.message}`)
}

export type RealtimeHandlers = {
  onExpenseChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; expense?: Expense; deletedId?: string }) => void
  onTripChange: (bundle: { trip: Trip; settings: AppSettings }) => void
}

/** Abonniert Live-Änderungen für einen Trip. Gibt eine Unsubscribe-Funktion zurück. */
export function subscribeToCloudTrip(tripId: string, handlers: RealtimeHandlers): () => void {
  const client = requireClient()

  const channel = client
    .channel(`trip-${tripId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          handlers.onExpenseChange({ eventType: 'DELETE', deletedId: (payload.old as ExpenseRow).id })
        } else {
          handlers.onExpenseChange({
            eventType: payload.eventType as 'INSERT' | 'UPDATE',
            expense: expenseFromRow(payload.new as ExpenseRow)
          })
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
      (payload) => {
        handlers.onTripChange(tripFromRow(payload.new as TripRow))
      }
    )
    .subscribe()

  return () => {
    client.removeChannel(channel)
  }
}
