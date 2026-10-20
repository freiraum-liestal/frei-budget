import type { BudgetProjection, BudgetStatus, Category, Expense, Trip } from '../types'
import { addDaysISO, localISODate, parseLocalDate } from './date'

function daysBetweenInclusive(startISO: string, endISO: string): number {
  const ms = parseLocalDate(endISO).getTime() - parseLocalDate(startISO).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

// ============================================================================
// VORAB-/FIXKOSTEN vs. LAUFENDE REISEKOSTEN
// ============================================================================
// Buchhalterische Trennung: Flug, Mietwagen-Vorauszahlung, vorab bezahlte
// Hotels usw. zählen voll ins Budget, verzerren aber den Tagesschnitt und die
// Prognose, wenn man sie auf die Reisetage verteilt. Als Vorab/Fix gilt:
//  - alles, was VOR Reisebeginn datiert ist (Zahlungsdatum), oder
//  - alles in einer Kategorie, die in den Einstellungen als "Fixkosten"
//    markiert ist (Standard: Flug, Mietwagen).

export function isFixedCost(expense: Expense, trip: Trip, categories: Category[]): boolean {
  if (expense.date < trip.startDate) return true
  return categories.find((c) => c.id === expense.categoryId)?.fixed === true
}

/** Alle Kernzahlen für das Dashboard werden ausschliesslich aus den
 *  tatsächlich gespeicherten Ausgaben berechnet – keine Hardcoding-Logik. */
export function calculateBudgetProjection(
  trip: Trip,
  allExpenses: Expense[],
  categories: Category[],
  todayISO: string = localISODate()
): BudgetProjection {
  const expenses = allExpenses.filter((e) => e.tripId === trip.id)
  const daysTotal = daysBetweenInclusive(trip.startDate, trip.endDate)

  const beforeTrip = todayISO < trip.startDate
  const afterTrip = todayISO > trip.endDate
  // Vergangene Tage inkl. heute (Anreisetag zählt), vor der Reise 0.
  const daysElapsed = beforeTrip ? 0 : afterTrip ? daysTotal : daysBetweenInclusive(trip.startDate, todayISO)
  // Verbleibende Tage INKL. heute – sonst wird das Tagesbudget überschätzt.
  const daysLeftInclToday = beforeTrip ? daysTotal : afterTrip ? 0 : daysTotal - daysElapsed + 1
  const daysRemaining = Math.max(daysTotal - daysElapsed, 0)

  let spent = 0
  let fixedSpent = 0
  let variableBeforeToday = 0
  let todayVariableSpent = 0
  for (const e of expenses) {
    spent += e.amountCHF
    if (isFixedCost(e, trip, categories)) {
      fixedSpent += e.amountCHF
    } else if (e.date < todayISO) {
      variableBeforeToday += e.amountCHF
    } else if (e.date === todayISO) {
      todayVariableSpent += e.amountCHF
    }
  }
  const variableSpent = spent - fixedSpent

  const remaining = trip.budgetCHF - spent
  const usagePercent = trip.budgetCHF > 0 ? (spent / trip.budgetCHF) * 100 : 0

  // Ø pro Tag nur über laufende Kosten bis und mit heute.
  const variableUpToToday = variableBeforeToday + todayVariableSpent
  const averagePerDay = daysElapsed > 0 ? variableUpToToday / daysElapsed : 0

  // Tagesbudget: Rest (vor den heutigen Ausgaben) gleichmässig auf die
  // verbleibenden Tage inkl. heute verteilen. Bleibt so über den Tag stabil.
  // (Alles ausser den heutigen laufenden Ausgaben abziehen – auch künftig datierte.)
  const availableForDays = trip.budgetCHF - spent + todayVariableSpent
  const dailyBudgetRemaining = daysLeftInclToday > 0 ? Math.max(availableForDays, 0) / daysLeftInclToday : Math.max(remaining, 0)
  const todayRemaining = daysLeftInclToday > 0 && !beforeTrip ? dailyBudgetRemaining - todayVariableSpent : 0

  // Prognose: Fixkosten + laufender Schnitt hochgerechnet auf die ganze Reise.
  const projectedTotal = daysElapsed > 0 ? fixedSpent + averagePerDay * daysTotal : spent

  let status: BudgetStatus = 'good'
  if (projectedTotal > trip.budgetCHF || remaining < 0) {
    status = 'danger'
  } else if (projectedTotal > trip.budgetCHF * 0.9) {
    status = 'warning'
  }

  return {
    daysTotal,
    daysElapsed,
    daysRemaining,
    spent: round2(spent),
    fixedSpent: round2(fixedSpent),
    variableSpent: round2(variableSpent),
    remaining: round2(remaining),
    usagePercent: round1(usagePercent),
    averagePerDay: round2(averagePerDay),
    dailyBudgetRemaining: round2(dailyBudgetRemaining),
    todayVariableSpent: round2(todayVariableSpent),
    todayRemaining: round2(todayRemaining),
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

/** Laufende Ausgaben pro Reisetag (ohne Vorab-/Fixkosten). */
export function dailyTotals(expenses: Expense[], trip?: Trip, categories: Category[] = []): { date: string; total: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    if (trip && isFixedCost(e, trip, categories)) continue
    map.set(e.date, (map.get(e.date) ?? 0) + e.amountCHF)
  }
  return Array.from(map.entries())
    .map(([date, total]) => ({ date, total: round2(total) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Kumulative Budgetentwicklung über die Reise, für das Line-Chart.
 *  Startet bei den Vorab-/Fixkosten; die Budgetlinie verteilt nur den Rest
 *  gleichmässig. Der Endwert entspricht immer dem Total. */
export function budgetTimeline(
  trip: Trip,
  expenses: Expense[],
  categories: Category[] = []
): { date: string; spent: number; budgetLine: number }[] {
  const totalDays = daysBetweenInclusive(trip.startDate, trip.endDate)
  let fixed = 0
  const dailyMap = new Map<string, number>()
  for (const e of expenses) {
    if (isFixedCost(e, trip, categories)) {
      fixed += e.amountCHF
      continue
    }
    // Ausgaben nach Reiseende dem letzten Tag zuordnen, damit das Total stimmt
    const day = e.date > trip.endDate ? trip.endDate : e.date
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + e.amountCHF)
  }
  const perDayBudget = (trip.budgetCHF - fixed) / totalDays

  let cumulative = fixed
  const result: { date: string; spent: number; budgetLine: number }[] = []
  for (let i = 0; i < totalDays; i++) {
    const iso = addDaysISO(trip.startDate, i)
    cumulative += dailyMap.get(iso) ?? 0
    result.push({ date: iso, spent: round2(cumulative), budgetLine: round2(fixed + perDayBudget * (i + 1)) })
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
