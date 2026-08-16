import type { AppState } from '../types'

// ============================================================================
// STORAGE-ABSTRAKTION
// ============================================================================
// Der Rest der App spricht nur mit diesem Interface, nie direkt mit
// localStorage. Wenn später Supabase angebunden wird, muss nur eine neue
// Implementierung von DataStore geschrieben werden (z.B. SupabaseStore),
// ohne dass Komponenten oder der Context sich ändern müssen.

const STORAGE_KEY = 'oman-travel-budget:v1'

export interface DataStore {
  load(): AppState | null
  save(state: AppState): void
  clear(): void
}

class LocalStorageStore implements DataStore {
  load(): AppState | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as AppState
    } catch (err) {
      console.error('Fehler beim Laden der lokalen Daten:', err)
      return null
    }
  }

  save(state: AppState): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (err) {
      console.error('Fehler beim Speichern der lokalen Daten:', err)
    }
  }

  clear(): void {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

// Später z.B.: export const dataStore: DataStore = new SupabaseStore(...)
export const dataStore: DataStore = new LocalStorageStore()
