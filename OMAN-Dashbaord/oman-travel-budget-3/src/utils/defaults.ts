import type { AppSettings, AppState, Category, Trip } from '../types'
import { localISODate } from './date'

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'flug', label: 'Flug', icon: '✈️', isDefault: true, fixed: true },
  { id: 'mietwagen', label: 'Mietwagen', icon: '🚗', isDefault: true, fixed: true },
  { id: 'benzin', label: 'Benzin', icon: '⛽', isDefault: true },
  { id: 'hotel', label: 'Hotel', icon: '🏨', isDefault: true },
  { id: 'essen', label: 'Essen', icon: '🍽️', isDefault: true },
  { id: 'lebensmittel', label: 'Lebensmittel', icon: '🛒', isDefault: true },
  { id: 'aktivitaeten', label: 'Aktivitäten', icon: '🏝️', isDefault: true },
  { id: 'strand', label: 'Strand', icon: '🏖️', isDefault: true },
  { id: 'noam', label: 'Noam', icon: '👶', isDefault: true },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', isDefault: true },
  { id: 'gebuehren', label: 'Gebühren', icon: '💳', isDefault: true },
  { id: 'telefon', label: 'Telefon / Internet', icon: '📱', isDefault: true },
  { id: 'sonstiges', label: 'Sonstiges', icon: '🧾', isDefault: true }
]

const DEFAULT_FIXED_IDS = new Set(DEFAULT_CATEGORIES.filter((c) => c.fixed).map((c) => c.id))

/** Ältere Daten kennen das Feld `fixed` noch nicht: dann Standard (Flug,
 *  Mietwagen) anwenden. Sobald einmal in den Einstellungen umgeschaltet wurde,
 *  gelten die gespeicherten Werte. */
export function normalizeCategories(categories: Category[]): Category[] {
  const hasExplicit = categories.some((c) => typeof c.fixed === 'boolean')
  if (hasExplicit) return categories
  return categories.map((c) => ({ ...c, fixed: DEFAULT_FIXED_IDS.has(c.id) }))
}

export function createDefaultTrip(): Trip {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const end = new Date(now.getFullYear(), 0, 14)
  const iso = (d: Date) => localISODate(d)
  return {
    id: 'trip-oman-2026',
    name: 'Oman 2026',
    startDate: iso(start),
    endDate: iso(end),
    budgetCHF: 4000,
    baseCurrency: 'CHF',
    localCurrency: 'OMR',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export function createDefaultSettings(): AppSettings {
  return {
    exchangeRates: [
      { currency: 'CHF', rateToCHF: 1, updatedAt: new Date().toISOString() },
      { currency: 'OMR', rateToCHF: 2.05, updatedAt: new Date().toISOString() },
      { currency: 'EUR', rateToCHF: 0.95, updatedAt: new Date().toISOString() },
      { currency: 'USD', rateToCHF: 0.88, updatedAt: new Date().toISOString() }
    ],
    categories: DEFAULT_CATEGORIES,
    activeCurrencies: ['CHF', 'OMR']
  }
}

export function createInitialState(): AppState {
  return {
    trip: createDefaultTrip(),
    expenses: [],
    settings: createDefaultSettings()
  }
}

/** Generiert Demo-Ausgaben relativ zum aktuellen Reisedatum, damit die
 *  Prognose-Logik auch mit Testdaten sinnvolle Werte zeigt. */
export function createDemoExpenses(tripId: string): AppState['expenses'] {
  const today = new Date()
  const daysAgo = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    return localISODate(d)
  }
  const mk = (
    id: string,
    dOffset: number,
    description: string,
    categoryId: string,
    amount: number,
    currency: 'CHF' | 'OMR',
    rate: number
  ) => ({
    id,
    tripId,
    date: daysAgo(dOffset),
    description,
    categoryId,
    originalAmount: amount,
    originalCurrency: currency,
    exchangeRate: rate,
    amountCHF: Math.round(amount * rate * 100) / 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerId: 'shared' as const
  })

  return [
    mk('demo-1', 5, 'Hotel Muscat', 'hotel', 180, 'CHF', 1),
    mk('demo-2', 5, 'Mietwagen Abholung', 'mietwagen', 420, 'CHF', 1),
    mk('demo-3', 4, 'Tanken', 'benzin', 12, 'OMR', 2.05),
    mk('demo-4', 4, 'Abendessen Souq', 'essen', 8.5, 'OMR', 2.05),
    mk('demo-5', 3, 'Wadi Shab Eintritt', 'aktivitaeten', 15, 'OMR', 2.05),
    mk('demo-6', 3, 'Frühstück', 'essen', 6.2, 'OMR', 2.05),
    mk('demo-7', 2, 'Wasser & Snacks', 'lebensmittel', 4.8, 'OMR', 2.05),
    mk('demo-8', 1, 'SIM-Karte', 'telefon', 5, 'OMR', 2.05),
    mk('demo-9', 0, 'Mittagessen', 'essen', 9.3, 'OMR', 2.05)
  ]
}
