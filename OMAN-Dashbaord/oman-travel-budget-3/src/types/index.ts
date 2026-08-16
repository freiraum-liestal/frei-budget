// ============================================================================
// DATENMODELL
// ============================================================================
// Bewusst als "Supabase-ready" konzipiert: Trip, Expense und Settings sind
// getrennte Entitäten mit eigener id. ownerId ist bereits vorbereitet
// (aktuell immer "shared", da David & Marlen ein gemeinsames Konto führen),
// damit später eine echte User-Zuordnung ohne Datenmodell-Bruch ergänzt
// werden kann. Es gibt bewusst KEINE "paidBy"/"owedBy"-Felder.

export type CurrencyCode = 'CHF' | 'OMR' | 'EUR' | 'USD' | string

export interface ExchangeRate {
  currency: CurrencyCode
  /** Wie viel 1 Einheit dieser Währung in CHF wert ist */
  rateToCHF: number
  updatedAt: string
}

export interface Category {
  id: string
  label: string
  icon: string
  /** true = vom System vorgegeben, kann nicht gelöscht werden */
  isDefault: boolean
}

export interface Expense {
  id: string
  tripId: string
  date: string // ISO yyyy-mm-dd
  description: string
  categoryId: string
  originalAmount: number
  originalCurrency: CurrencyCode
  /** Kurs zum Zeitpunkt der Erfassung – bleibt für historische Ausgaben fix */
  exchangeRate: number
  amountCHF: number
  createdAt: string
  updatedAt: string
  /** Platzhalter für spätere Multi-User-Zuordnung (aktuell ungenutzt in UI) */
  ownerId: 'shared'
  /** Nur clientseitig: true solange die Ausgabe noch nicht in der Cloud bestätigt ist */
  pendingSync?: boolean
}

export interface Trip {
  id: string
  name: string
  startDate: string // ISO yyyy-mm-dd
  endDate: string // ISO yyyy-mm-dd
  budgetCHF: number
  baseCurrency: CurrencyCode
  localCurrency: CurrencyCode
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  exchangeRates: ExchangeRate[]
  categories: Category[]
  activeCurrencies: CurrencyCode[]
}

export interface AppState {
  trip: Trip
  expenses: Expense[]
  settings: AppSettings
}

export type BudgetStatus = 'good' | 'warning' | 'danger'

export interface BudgetProjection {
  daysTotal: number
  daysElapsed: number
  daysRemaining: number
  spent: number
  remaining: number
  usagePercent: number
  averagePerDay: number
  dailyBudgetRemaining: number
  projectedTotal: number
  projectedDifference: number
  status: BudgetStatus
}
