import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AppSettings, AppState, Expense, Trip } from '../types'
import { createDemoExpenses, createInitialState } from '../utils/defaults'
import { dataStore } from '../utils/storage'
import { convertToCHF } from '../utils/currency'
import { isCloudConfigured } from '../utils/supabaseClient'
import {
  CloudError,
  cloudAddExpense,
  cloudDeleteExpense,
  cloudUpdateExpense,
  cloudUpdateSettings,
  cloudUpdateTrip,
  createCloudTrip as createCloudTripApi,
  joinCloudTrip,
  subscribeToCloudTrip
} from '../utils/cloudStore'

const CLOUD_SESSION_KEY = 'oman-travel-budget:cloud-session'

interface CloudSession {
  tripId: string
  accessCode: string
}

function loadCloudSession(): CloudSession | null {
  try {
    const raw = window.localStorage.getItem(CLOUD_SESSION_KEY)
    return raw ? (JSON.parse(raw) as CloudSession) : null
  } catch {
    return null
  }
}
function saveCloudSession(session: CloudSession | null) {
  if (session) window.localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session))
  else window.localStorage.removeItem(CLOUD_SESSION_KEY)
}

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'error'

interface AppContextValue {
  state: AppState
  cloudEnabled: boolean
  syncStatus: SyncStatus
  syncError: string | null
  accessCode: string | null
  addExpense: (input: {
    date: string
    description: string
    categoryId: string
    originalAmount: number
    originalCurrency: string
  }) => Promise<void>
  updateExpense: (expense: Expense) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  updateTrip: (patch: Partial<Trip>) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  loadDemoData: () => void
  clearDemoData: () => void
  resetAll: () => void
  importState: (state: AppState) => void
  joinTrip: (accessCode: string) => Promise<void>
  createSharedTrip: (migrateLocalData: boolean) => Promise<string>
  leaveTrip: () => void
  retryPendingSync: () => Promise<void>
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => dataStore.load() ?? createInitialState())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [accessCode, setAccessCode] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const pendingRetryRef = useRef<Set<string>>(new Set())

  // Im reinen Lokal-Modus: bei jeder Änderung lokal speichern.
  useEffect(() => {
    if (syncStatus === 'local') {
      dataStore.save(state)
    }
  }, [state, syncStatus])

  function attachRealtimeSubscription(tripId: string) {
    unsubscribeRef.current?.()
    unsubscribeRef.current = subscribeToCloudTrip(tripId, {
      onExpenseChange: (payload) => {
        setState((prev) => {
          if (payload.eventType === 'DELETE' && payload.deletedId) {
            return { ...prev, expenses: prev.expenses.filter((e) => e.id !== payload.deletedId) }
          }
          if (payload.expense) {
            const exists = prev.expenses.some((e) => e.id === payload.expense!.id)
            return {
              ...prev,
              expenses: exists
                ? prev.expenses.map((e) => (e.id === payload.expense!.id ? payload.expense! : e))
                : [...prev.expenses, payload.expense!]
            }
          }
          return prev
        })
      },
      onTripChange: ({ trip, settings }) => {
        setState((prev) => ({ ...prev, trip, settings }))
      }
    })
  }

  async function connectToCloud(code: string) {
    setSyncStatus('connecting')
    setSyncError(null)
    const bundle = await joinCloudTrip(code)

    setState({ trip: bundle.trip, settings: bundle.settings, expenses: bundle.expenses })
    setAccessCode(bundle.accessCode)
    saveCloudSession({ tripId: bundle.trip.id, accessCode: bundle.accessCode })
    attachRealtimeSubscription(bundle.trip.id)
    setSyncStatus('synced')
  }

  // Beim Start: falls zuvor ein Cloud-Trip verbunden war, automatisch wieder verbinden.
  useEffect(() => {
    const session = loadCloudSession()
    if (session && isCloudConfigured) {
      connectToCloud(session.accessCode).catch(() => {
        setSyncStatus('error')
        setSyncError('Cloud-Verbindung beim Start fehlgeschlagen. Du arbeitest offline mit dem letzten bekannten Stand weiter.')
      })
    }
    return () => {
      unsubscribeRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function withCloudErrorHandling<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await fn()
      setSyncError(null)
      return result
    } catch (err) {
      const message = err instanceof CloudError ? err.message : 'Unerwarteter Fehler bei der Cloud-Synchronisierung.'
      setSyncError(message)
      console.error(err)
      return undefined
    }
  }

  async function retryPendingSync() {
    if (pendingRetryRef.current.size === 0 || syncStatus !== 'synced') return
    const ids = Array.from(pendingRetryRef.current)
    for (const id of ids) {
      const expense = stateRef.current.expenses.find((e) => e.id === id)
      if (!expense) {
        pendingRetryRef.current.delete(id)
        continue
      }
      try {
        await cloudAddExpense(stateRef.current.trip.id, {
          id: expense.id,
          date: expense.date,
          description: expense.description,
          categoryId: expense.categoryId,
          originalAmount: expense.originalAmount,
          originalCurrency: expense.originalCurrency,
          exchangeRate: expense.exchangeRate,
          amountCHF: expense.amountCHF
        })
        pendingRetryRef.current.delete(id)
        setState((prev) => ({
          ...prev,
          expenses: prev.expenses.map((e) => (e.id === id ? { ...e, pendingSync: false } : e))
        }))
      } catch {
        // bleibt in der Warteschlange, nächster Versuch später
      }
    }
    setSyncError(pendingRetryRef.current.size > 0 ? `${pendingRetryRef.current.size} Ausgabe(n) warten noch auf Synchronisierung.` : null)
  }

  // Automatisch erneut versuchen, sobald das Gerät wieder online ist.
  useEffect(() => {
    function handleOnline() {
      retryPendingSync()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

  const value: AppContextValue = {
    state,
    cloudEnabled: isCloudConfigured,
    syncStatus,
    syncError,
    accessCode,

    addExpense: async (input) => {
      const rate = state.settings.exchangeRates.find((r) => r.currency === input.originalCurrency)?.rateToCHF ?? 1
      const amountCHF = convertToCHF(input.originalAmount, input.originalCurrency, state.settings.exchangeRates)
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const isCloud = syncStatus === 'synced'

      const newExpense: Expense = {
        ...input,
        id,
        tripId: state.trip.id,
        exchangeRate: rate,
        amountCHF,
        createdAt: now,
        updatedAt: now,
        ownerId: 'shared',
        pendingSync: isCloud
      }

      // Sofort lokal anzeigen – die Eingabe geht NIE verloren, auch nicht offline.
      setState((prev) => ({ ...prev, expenses: [...prev.expenses, newExpense] }))

      if (!isCloud) return

      try {
        await cloudAddExpense(state.trip.id, { ...input, id, exchangeRate: rate, amountCHF })
        setState((prev) => ({
          ...prev,
          expenses: prev.expenses.map((e) => (e.id === id ? { ...e, pendingSync: false } : e))
        }))
        setSyncError(null)
      } catch (err) {
        const message =
          err instanceof CloudError ? err.message : 'Keine Verbindung – Ausgabe ist lokal gespeichert und wird automatisch nachgeholt.'
        setSyncError(message)
        pendingRetryRef.current.add(id)
      }
    },

    updateExpense: async (expense) => {
      const amountCHF = convertToCHF(expense.originalAmount, expense.originalCurrency, state.settings.exchangeRates)
      const updated = { ...expense, amountCHF, updatedAt: new Date().toISOString() }

      setState((prev) => ({ ...prev, expenses: prev.expenses.map((e) => (e.id === updated.id ? updated : e)) }))

      if (syncStatus === 'synced') {
        await withCloudErrorHandling(() => cloudUpdateExpense(updated))
      }
    },

    deleteExpense: async (id) => {
      setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }))
      if (syncStatus === 'synced') {
        await withCloudErrorHandling(() => cloudDeleteExpense(id))
      }
    },

    updateTrip: async (patch) => {
      setState((prev) => ({ ...prev, trip: { ...prev.trip, ...patch, updatedAt: new Date().toISOString() } }))
      if (syncStatus === 'synced') {
        await withCloudErrorHandling(() => cloudUpdateTrip(state.trip.id, patch))
      }
    },

    updateSettings: async (patch) => {
      setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
      if (syncStatus === 'synced') {
        await withCloudErrorHandling(() => cloudUpdateSettings(state.trip.id, patch))
      }
    },

    loadDemoData: () => {
      const demo = createDemoExpenses(state.trip.id)
      setState((prev) => {
        const existingIds = new Set(prev.expenses.map((e) => e.id))
        return { ...prev, expenses: [...prev.expenses, ...demo.filter((d) => !existingIds.has(d.id))] }
      })
    },
    clearDemoData: () => {
      setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => !e.id.startsWith('demo-')) }))
    },
    resetAll: () => {
      dataStore.clear()
      saveCloudSession(null)
      unsubscribeRef.current?.()
      setSyncStatus('local')
      setAccessCode(null)
      setState(createInitialState())
    },
    importState: (imported) => setState(imported),

    joinTrip: async (code) => {
      await connectToCloud(code)
    },

    createSharedTrip: async (migrateLocalData) => {
      setSyncStatus('connecting')
      setSyncError(null)
      const current = stateRef.current
      const seed = migrateLocalData
        ? { trip: current.trip, settings: current.settings, expenses: current.expenses }
        : { trip: current.trip, settings: current.settings, expenses: [] }

      try {
        const bundle = await createCloudTripApi(seed)
        setState({ trip: bundle.trip, settings: bundle.settings, expenses: bundle.expenses })
        setAccessCode(bundle.accessCode)
        saveCloudSession({ tripId: bundle.trip.id, accessCode: bundle.accessCode })
        attachRealtimeSubscription(bundle.trip.id)
        setSyncStatus('synced')
        return bundle.accessCode
      } catch (err) {
        const message = err instanceof CloudError ? err.message : `Trip konnte nicht erstellt werden: ${err instanceof Error ? err.message : String(err)}`
        setSyncStatus('local')
        setSyncError(message)
        throw err
      }
    },

    leaveTrip: () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      saveCloudSession(null)
      setSyncStatus('local')
      setAccessCode(null)
      dataStore.save(stateRef.current) // letzten Cloud-Stand als lokale Kopie behalten
    },

    retryPendingSync
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp muss innerhalb von <AppProvider> verwendet werden')
  return ctx
}
