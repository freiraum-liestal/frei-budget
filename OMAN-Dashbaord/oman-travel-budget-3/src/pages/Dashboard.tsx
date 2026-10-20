import { useApp } from '../context/AppContext'
import { localISODate } from '../utils/date'
import SyncBadge from '../components/SyncBadge'
import { ExpenseRow } from '../components/ExpenseList'
import { calculateBudgetProjection } from '../utils/calculations'
import { formatCHF } from '../utils/currency'

function todayISO() {
  return localISODate()
}

export default function Dashboard() {
  const { state } = useApp()
  const { trip, expenses, settings } = state
  const projection = calculateBudgetProjection(trip, expenses)

  const today = todayISO()
  const todaysExpenses = expenses.filter((e) => e.date === today)
  const todaysTotal = todaysExpenses.reduce((sum, e) => sum + e.amountCHF, 0)

  const fillClass =
    projection.status === 'danger' ? 'danger' : projection.status === 'warning' ? 'warning' : ''

  return (
    <div className="page">
      <header className="app-header">
        <div className="flag">🇴🇲 {trip.name}</div>
        <h1>David &amp; Marlen</h1>
        <SyncBadge />
      </header>

      <section className="hero-card">
        <div className="label">Gesamtbudget</div>
        <div className="amount">{formatCHF(trip.budgetCHF)}</div>

        <div className="progress-track">
          <div
            className={`progress-fill ${fillClass}`}
            style={{ width: `${Math.min(projection.usagePercent, 100)}%` }}
          />
        </div>
        <div className="progress-percent">{projection.usagePercent}% ausgegeben</div>

        <div className="hero-grid">
          <div className="stat">
            <div className="label">Ausgegeben</div>
            <div className="value">{formatCHF(projection.spent)}</div>
          </div>
          <div className="stat">
            <div className="label">Verbleibend</div>
            <div className="value">{formatCHF(projection.remaining)}</div>
          </div>
        </div>
      </section>

      <div className="stat-row">
        <div className="stat-card">
          <div className="label">Tagesbudget</div>
          <div className="value">{formatCHF(projection.dailyBudgetRemaining)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ø pro Tag</div>
          <div className="value">{formatCHF(projection.averagePerDay)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Heute · {new Date().toLocaleDateString('de-CH', { day: '2-digit', month: 'long' })}
        </div>
        {todaysExpenses.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Heute noch keine Ausgaben erfasst.</p>
        ) : (
          <>
            {todaysExpenses.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                category={
                  settings.categories.find((c) => c.id === e.categoryId) ?? {
                    id: e.categoryId,
                    label: e.categoryId,
                    icon: '🧾',
                    isDefault: false
                  }
                }
              />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 4px 0', fontWeight: 700 }}>
              <span>Total</span>
              <span>{formatCHF(todaysTotal)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}