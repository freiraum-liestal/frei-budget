import type { BudgetProjection, BudgetStatus, Expense, Trip } from '../types'

function toDateOnly(iso: string): Date {
  const d = new Date(iso + 'T00:00:00')
  return d
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/** Alle Kernzahlen für das Dashboard werden ausschliesslich aus den
 *  tatsächlich gespeicherten Ausgaben berechnet – keine Hardcoding-Logik. */
export function calculateBudgetProjection(trip: Trip, expenses: Expense[]): BudgetProjection {
  const start = toDateOnly(trip.startDate)
  const end = toDateOnly(trip.endDate)
  const today = toDateOnly(new Date().toISOString().slice(0, 10))

  const daysTotal = daysBetweenInclusive(start, end)

  // Vergangene Tage: mindestens 1 (Anreisetag zählt), gedeckelt auf daysTotal.
  const rawElapsed = daysBetweenInclusive(start, today < start ? start : today > end ? end : today)
  const daysElapsed = Math.min(Math.max(rawElapsed, today >= start ? 1 : 0), daysTotal)
  const daysRemaining = Math.max(daysTotal - daysElapsed, 0)

  const spent = expenses
    .filter((e) => e.tripId === trip.id)
    .reduce((sum, e) => sum + e.amountCHF, 0)

  const remaining = trip.budgetCHF - spent
  const usagePercent = trip.budgetCHF > 0 ? (spent / trip.budgetCHF) * 100 : 0

  const averagePerDay = daysElapsed > 0 ? spent / daysElapsed : 0
  const dailyBudgetRemaining = daysRemaining > 0 ? Math.max(remaining, 0) / daysRemaining : Math.max(remaining, 0)

  // Projektion nur noch intern, um den Status für die Fortschrittsbalken-Farbe zu bestimmen.
  const projectedTotal = averagePerDay > 0 ? averagePerDay * daysTotal : spent

  let status: BudgetStatus = 'good'
  if (projectedTotal > trip.budgetCHF) {
    status = 'danger'
  } else if (projectedTotal > trip.budgetCHF * 0.9) {
    status = 'warning'
  }

  return {
    daysTotal,
    daysElapsed,
    daysRemaining,
    spent: round2(spent),
    remaining: round2(remaining),
    usagePercent: round1(usagePercent),
    averagePerDay: round2(averagePerDay),
    dailyBudgetRemaining: round2(dailyBudgetRemaining),
    status
  }
}

export function expensesByDate(expenses: Expense[]): Map<string, Expense[]> {
  const map = new Map<string, Expense[]>()
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  for (const e of sorted) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  return map
}

export function totalForExpenses(expenses: Expense[]): number {
  return round2(expenses.reduce((sum, e) => sum + e.amountCHF, 0))
}

export interface CategoryTotal {
  categoryId: string
  total: number
  percent: number
  count: number
}

export function categoryTotals(expenses: Expense[]): CategoryTotal[] {
  const totalSpent = totalForExpenses(expenses)
  const map = new Map<string, { total: number; count: number }>()
  for (const e of expenses) {
    const cur = map.get(e.categoryId) ?? { total: 0, count: 0 }
    cur.total += e.amountCHF
    cur.count += 1
    map.set(e.categoryId, cur)
  }
  return Array.from(map.entries())
    .map(([categoryId, v]) => ({
      categoryId,
      total: round2(v.total),
      count: v.count,
      percent: totalSpent > 0 ? round1((v.total / totalSpent) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total)
}

export function dailyTotals(expenses: Expense[]): { date: string; total: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    map.set(e.date, (map.get(e.date) ?? 0) + e.amountCHF)
  }
  return Array.from(map.entries())
    .map(([date, total]) => ({ date, total: round2(total) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Kumulative Budgetentwicklung über die Reise, für das Line-Chart. */
export function budgetTimeline(trip: Trip, expenses: Expense[]): { date: string; spent: number; budgetLine: number }[] {
  const daily = dailyTotals(expenses)
  const start = toDateOnly(trip.startDate)
  const end = toDateOnly(trip.endDate)
  const totalDays = daysBetweenInclusive(start, end)
  const dailyBudgetLine = trip.budgetCHF / totalDays

  let cumulative = 0
  const dailyMap = new Map(daily.map((d) => [d.date, d.total]))
  const result: { date: string; spent: number; budgetLine: number }[] = []

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    cumulative += dailyMap.get(iso) ?? 0
    result.push({ date: iso, spent: round2(cumulative), budgetLine: round2(dailyBudgetLine * (i + 1)) })
  }
  return result
}

export function largestExpenses(expenses: Expense[], limit = 5): Expense[] {
  return [...expenses].sort((a, b) => b.amountCHF - a.amountCHF).slice(0, limit)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}