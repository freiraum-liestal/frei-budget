// ============================================================================
// DATUM – immer in LOKALER Zeit des Geräts
// ============================================================================
// `new Date().toISOString().slice(0, 10)` liefert das UTC-Datum. In Oman
// (UTC+4) wäre "heute" zwischen 00:00 und 04:00 noch gestern, und Datumsreihen
// verschieben sich um einen Tag. Deshalb überall diese Helfer verwenden.

/** yyyy-mm-dd in lokaler Zeit */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Lokales Mitternachts-Datum aus yyyy-mm-dd */
export function parseLocalDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

/** Addiert n Kalendertage zu einem yyyy-mm-dd-Datum */
export function addDaysISO(iso: string, n: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + n)
  return localISODate(d)
}
