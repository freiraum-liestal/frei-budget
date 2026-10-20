import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AppSettings, AppState, Expense, Trip } from '../types'
import { createDemoExpenses, createInitialState } from '../utils/defaults'
import { dataStore } from '../utils/storage'
import { getRate } from '../utils/currency'
import { isCloudConfigured } from '../utils/supabaseClient'
import {
  CloudError,
  type CloudTripBundle,
  cloudDeleteExpense,
  cloudUpdateSettings,
  cloudUpdateTrip,
  cloudUpsertExpense,
  createCloudTrip as createCloudTripApi,
  joinCloudTrip,
  subscribeToCloudTrip
} from '../utils/cloudStore'

// ============================================================================
// OFFLINE-FIRST SYNC
// ============================================================================
// Grundsatz: Das Gerät ist die Quelle der Wahrheit für alles, was noch nicht
// in der Cloud bestätigt ist.
//  - Der komplette Zustand wird IMMER lokal gespeichert (auch im Cloud-Modus),
//    damit die App offline mit dem letzten Stand startet.
//  - Neue/geänderte Ausgaben tragen `pendingSync: true` (wird mitgespeichert),
//    Löschungen landen in einer gespeicherten Liste. Das ist die "Outbox".
//  - syncNow(): erst Outbox hochladen, dann frischen Stand aus der Cloud holen
//    (fängt auch Änderungen des Partners ab, die offline verpasst wurden).
//  - syncNow läuft beim Start, bei "online", beim Zurückkehren in die App und
//    periodisch, solange etwas offen ist.

const CLOUD_SESSION_KEY = 'oman-travel-budget:cloud-session'
const PENDING_DELETES_KEY = 'oman-travel-budget:pending-deletes'
const SYNC_INTERVAL_MS = 20_000

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
  try {
    if (session) window.localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session))
    else window.localStorage.removeItem(CLOUD_SESSION_KEY)
  } catch (err) {
    console.error('Cloud-Session konnte nicht gespeichert werden:', err)
  }
}
function loadPendingDeletes(): string[] {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}
function savePendingDeletes(ids: string[]) {
  try {
    if (ids.length) window.localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(ids))
    else window.localStorage.removeItem(PENDING_DELETES_KEY)
  } catch (err) {
    console.error('Lösch-Warteschlange konnte nicht gespeichert werden:', err)
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Server-Stand übernehmen, ohne lokal noch nicht synchronisierte Änderungen zu verlieren. */
function mergeWithServer(prev: AppState, bundle: CloudTripBundle, pendingDeletes: string[]): AppState {
  const deleted = new Set(pendingDeletes)
  const localPending = prev.expenses
    .filter((e) => e.pendingSync)
    .map((e) => ({ ...e, tripId: bundle.trip.id }))
  const pendingIds = new Set(localPending.map((e) => e.id))
  const fromServer = bundle.expenses.filter((e) => !deleted.has(e.id) && !pendingIds.has(e.id))
  return { trip: bundle.trip, settings: bundle.settings, expenses: [...fromServer, ...localPending] }
}

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'offline'

interface AppContextValue {
  state: AppState
  cloudEnabled: boolean
  syncStatus: SyncStatus
  syncError: string | null
  accessCode: string | null
  /** Anzahl lokaler Änderungen, die noch nicht in der Cloud sind */
  pendingCount: number
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

const OFFLINE_MESSAGE = 'Offline – Änderungen sind auf diesem Gerät gespeichert und werden automatisch synchronisiert.'

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => dataStore.load() ?? createInitialState())
  const [session, setSessionState] = useState<CloudSession | null>(() => (isCloudConfigured ? loadCloudSession() : null))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (isCloudConfigured && loadCloudSession() ? 'connecting' : 'local'))
  const [syncError, setSyncError] = useState<string | null>(null)
  const [pendingDeletes, setPendingDeletesState] = useState<string[]>(() => loadPendingDeletes())

  const stateRef = useRef(state)
  stateRef.current = state
  const sessionRef = useRef(session)
  sessionRef.current = session
  const pendingDeletesRef = useRef(pendingDeletes)
  pendingDeletesRef.current = pendingDeletes

  const unsubscribeRef = useRef<(() => void) | null>(null)
  const subscribedTripRef = useRef<string | null>(null)
  const syncingRef = useRef(false)
  const rerunRef = useRef(false)

  // Immer lokal speichern – auch im Cloud-Modus. Das ist der Offline-Cache.
  useEffect(() => {
    dataStore.save(state)
  }, [state])

  function setSession(next: CloudSession | null) {
    sessionRef.current = next
    setSessionState(next)
    saveCloudSession(next)
  }

  function setPendingDeletes(next: string[]) {
    pendingDeletesRef.current = next
    setPendingDeletesState(next)
    savePendingDeletes(next)
  }

  function detachRealtime() {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    subscribedTripRef.current = null
  }

  function attachRealtime(tripId: string) {
    if (subscribedTripRef.current === tripId) return
    detachRealtime()
    subscribedTripRef.current = tripId
    unsubscribeRef.current = subscribeToCloudTrip(tripId, {
      onExpenseChange: (payload) => {
        setState((prev) => {
          if (payload.eventType === 'DELETE' && payload.deletedId) {
            return { ...prev, expenses: prev.expenses.filter((e) => e.id !== payload.deletedId) }
          }
          const incoming = payload.expense
          if (!incoming) return prev
          // Lokale, noch nicht hochgeladene Änderung hat Vorrang (wird gleich hochgeladen).
          if (pendingDeletesRef.current.includes(incoming.id)) return prev
          const local = prev.expenses.find((e) => e.id === incoming.id)
          if (local?.pendingSync) return prev
          return {
            ...prev,
            expenses: local ? prev.expenses.map((e) => (e.id === incoming.id ? incoming : e)) : [...prev.expenses, incoming]
          }
        })
      },
      onTripChange: ({ trip, settings }) => {
        setState((prev) => ({ ...prev, trip, settings }))
      }
    })
  }

  /** Outbox hochladen. Wirft bei Netzwerkfehler – der Rest bleibt in der Outbox. */
  async function flushOutbox(tripId: string) {
    for (const id of [...pendingDeletesRef.current]) {
      await cloudDeleteExpense(id)
      setPendingDeletes(pendingDeletesRef.current.filter((x) => x !== id))
    }
    const pending = stateRef.current.expenses.filter((e) => e.pendingSync)
    for (const expense of pending) {
      await cloudUpsertExpense({ ...expense, tripId })
      // Nur als synchronisiert markieren, wenn während des Uploads nicht erneut bearbeitet wurde.
      setState((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) =>
          e.id === expense.id && e.updatedAt === expense.updatedAt ? { ...e, tripId, pendingSync: false } : e
        )
      }))
    }
  }

  async function syncNow(): Promise<void> {
    const current = sessionRef.current
    if (!current || !isCloudConfigured) return
    if (syncingRef.current) {
      rerunRef.current = true
      return
    }
    syncingRef.current = true
    try {
      await flushOutbox(current.tripId)
      const bundle = await joinCloudTrip(current.accessCode)
      if (sessionRef.current?.accessCode !== current.accessCode) return // inzwischen getrennt
      setState((prev) => mergeWithServer(prev, bundle, pendingDeletesRef.current))
      attachRealtime(bundle.trip.id)
      setSyncStatus('synced')
      setSyncError(null)
    } catch (err) {
      console.warn('Sync fehlgeschlagen:', err)
      if (!sessionRef.current) return
      setSyncStatus('offline')
      const online = typeof navigator === 'undefined' || navigator.onLine
      setSyncError(online && err instanceof CloudError && !/fetch|network/i.test(err.message) ? `${err.message} – ${OFFLINE_MESSAGE}` : OFFLINE_MESSAGE)
    } finally {
      syncingRef.current = false
      if (rerunRef.current) {
        rerunRef.current = false
        void syncNow()
      }
    }
  }

  const syncNowRef = useRef(syncNow)
  syncNowRef.current = syncNow

  // Start + automatische Wiederholung: online-Event, Rückkehr in die App, Intervall.
  useEffect(() => {
    if (sessionRef.current) void syncNowRef.current()

    const trigger = () => {
      if (sessionRef.current) void syncNowRef.current()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    window.addEventListener('online', trigger)
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => {
      const hasPending = stateRef.current.expenses.some((e) => e.pendingSync) || pendingDeletesRef.current.length > 0
      if (sessionRef.current && hasPending) trigger()
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
      detachRealtime()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyBundle(bundle: CloudTripBundle) {
    setState({ trip: bundle.trip, settings: bundle.settings, expenses: bundle.expenses })
    setPendingDeletes([])
    setSession({ tripId: bundle.trip.id, accessCode: bundle.accessCode })
    attachRealtime(bundle.trip.id)
    setSyncStatus('synced')
    setSyncError(null)
  }

  const pendingCount = state.expenses.filter((e) => e.pendingSync).length + pendingDeletes.length

  const value: AppContextValue = {
    state,
    cloudEnabled: isCloudConfigured,
    syncStatus,
    syncError,
    accessCode: session?.accessCode ?? null,
    pendingCount,

    addExpense: async (input) => {
      const rate = getRate(stateRef.current.settings.exchangeRates, input.originalCurrency)
      const now = new Date().toISOString()
      const newExpense: Expense = {
        ...input,
        id: crypto.randomUUID(),
        tripId: sessionRef.current?.tripId ?? stateRef.current.trip.id,
        exchangeRate: rate,
        amountCHF: round2(input.originalAmount * rate),
        createdAt: now,
        updatedAt: now,
        ownerId: 'shared',
        pendingSync: Boolean(sessionRef.current)
      }
      // Sofort lokal anzeigen und speichern – geht nie verloren, auch nicht offline.
      setState((prev) => ({ ...prev, expenses: [...prev.expenses, newExpense] }))
      if (sessionRef.current) {
        stateRef.current = { ...stateRef.current, expenses: [...stateRef.current.expenses, newExpense] }
        await syncNow()
      }
    },

    updateExpense: async (expense) => {
      const original = stateRef.current.expenses.find((e) => e.id === expense.id)
      // Buchhaltung: Der Kurs der Erfassung bleibt fix. Nur bei Währungswechsel
      // wird der aktuelle Kurs aus den Einstellungen verwendet.
      const rate =
        original && original.originalCurrency === expense.originalCurrency
          ? original.exchangeRate
          : getRate(stateRef.current.settings.exchangeRates, expense.originalCurrency)
      const updated: Expense = {
        ...expense,
        exchangeRate: rate,
        amountCHF: round2(expense.originalAmount * rate),
        updatedAt: new Date().toISOString(),
        pendingSync: Boolean(sessionRef.current)
      }
      setState((prev) => ({ ...prev, expenses: prev.expenses.map((e) => (e.id === updated.id ? updated : e)) }))
      if (sessionRef.current) {
        stateRef.current = { ...stateRef.current, expenses: stateRef.current.expenses.map((e) => (e.id === updated.id ? updated : e)) }
        await syncNow()
      }
    },

    deleteExpense: async (id) => {
      setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }))
      if (sessionRef.current) {
        stateRef.current = { ...stateRef.current, expenses: stateRef.current.expenses.filter((e) => e.id !== id) }
        if (!pendingDeletesRef.current.includes(id)) setPendingDeletes([...pendingDeletesRef.current, id])
        await syncNow()
      }
    },

    updateTrip: async (patch) => {
      setState((prev) => ({ ...prev, trip: { ...prev.trip, ...patch, updatedAt: new Date().toISOString() } }))
      const current = sessionRef.current
      if (!current) return
      try {
        await cloudUpdateTrip(current.tripId, patch)
      } catch (err) {
        setSyncError(err instanceof CloudError ? err.message : 'Reisedaten konnten nicht synchronisiert werden.')
      }
    },

    updateSettings: async (patch) => {
      setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
      const current = sessionRef.current
      if (!current) return
      try {
        await cloudUpdateSettings(current.tripId, patch)
      } catch (err) {
        setSyncError(err instanceof CloudError ? err.message : 'Einstellungen konnten nicht synchronisiert werden.')
      }
    },

    loadDemoData: () => {
      const demo = createDemoExpenses(stateRef.current.trip.id)
      setState((prev) => {
        const existingIds = new Set(prev.expenses.map((e) => e.id))
        return { ...prev, expenses: [...prev.expenses, ...demo.filter((d) => !existingIds.has(d.id))] }
      })
    },
    clearDemoData: () => {
      setState((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => !e.id.startsWith('demo-')) }))
    },
    resetAll: () => {
      detachRealtime()
      setSession(null)
      setPendingDeletes([])
      dataStore.clear()
      setSyncStatus('local')
      setSyncError(null)
      setState(createInitialState())
    },
    importState: (imported) => setState(imported),

    joinTrip: async (code) => {
      const previousStatus = syncStatus
      setSyncStatus('connecting')
      setSyncError(null)
      try {
        const bundle = await joinCloudTrip(code)
        applyBundle(bundle)
      } catch (err) {
        setSyncStatus(previousStatus === 'connecting' ? 'local' : previousStatus)
        throw err
      }
    },

    createSharedTrip: async (migrateLocalData) => {
      setSyncStatus('connecting')
      setSyncError(null)
      const current = stateRef.current
      const seed = {
        trip: current.trip,
        settings: current.settings,
        expenses: migrateLocalData ? current.expenses : []
      }
      try {
        const bundle = await createCloudTripApi(seed)
        applyBundle(bundle)
        return bundle.accessCode
      } catch (err) {
        const message =
          err instanceof CloudError ? err.message : `Trip konnte nicht erstellt werden: ${err instanceof Error ? err.message : String(err)}`
        setSyncStatus('local')
        setSyncError(message)
        throw err
      }
    },

    leaveTrip: () => {
      detachRealtime()
      setSession(null)
      setPendingDeletes([])
      setSyncStatus('local')
      setSyncError(null)
      // letzten Stand als lokale Kopie behalten
      setState((prev) => ({ ...prev, expenses: prev.expenses.map((e) => ({ ...e, pendingSync: false })) }))
    },

    retryPendingSync: () => syncNow()
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp muss innerhalb von <AppProvider> verwendet werden')
  return ctx
}
