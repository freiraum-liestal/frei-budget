import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../context/AppContext'
import {
  budgetTimeline,
  calculateBudgetProjection,
  categoryTotals,
  dailyTotals,
  largestExpenses,
  totalForExpenses
} from '../utils/calculations'
import { formatCHF } from '../utils/currency'

const CHART_COLORS = ['#12233F', '#2F5EA8', '#5B8DEF', '#8FB2E8', '#2E9E6D', '#B5842A', '#D64545', '#9AA5B8', '#6D8BAD', '#3E5C85']

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
}

export default function StatsPage() {
  const { state } = useApp()
  const { trip, expenses, settings } = state

  if (expenses.length === 0) {
    return (
      <div className="page">
        <header className="app-header"><h1>Statistik</h1></header>
        <div className="empty-state">
          <div className="icon">📊</div>
          <h3>Noch keine Auswertungen</h3>
          <p>Erfasse ein paar Ausgaben, um deine Statistiken zu sehen.</p>
        </div>
      </div>
    )
  }

  const projection = calculateBudgetProjection(trip, expenses, settings.categories)
  const catTotals = categoryTotals(expenses)
  const daily = dailyTotals(expenses, trip, settings.categories)
  const timeline = budgetTimeline(trip, expenses, settings.categories)
  const biggest = largestExpenses(expenses, 5)

  const categoryLabel = (id: string) => settings.categories.find((c) => c.id === id)?.label ?? id
  const categoryIcon = (id: string) => settings.categories.find((c) => c.id === id)?.icon ?? '🧾'

  const pieData = catTotals.map((c) => ({ name: categoryLabel(c.categoryId), value: c.total }))

  return (
    <div className="page">
      <header className="app-header"><h1>Statistik</h1></header>

      <div className="stat-row">
        <div className="stat-card">
          <div className="label">Gesamtausgaben</div>
          <div className="value">{formatCHF(totalForExpenses(expenses))}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ø pro Tag</div>
          <div className="value">{formatCHF(projection.averagePerDay)}</div>
          <div className="hint">ohne Vorab/Fix</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Vorab-/Fixkosten vs. laufende Kosten</div>
        {[
          { label: '📌 Vorab / Fix', value: projection.fixedSpent },
          { label: '🧾 Laufend auf der Reise', value: projection.variableSpent }
        ].map((row) => (
          <div className="category-bar-row" key={row.label}>
            <div className="top">
              <span className="name">{row.label}</span>
              <span>
                {formatCHF(row.value)} · {projection.spent > 0 ? Math.round((row.value / projection.spent) * 1000) / 10 : 0}%
              </span>
            </div>
            <div className="category-bar-track">
              <div className="category-bar-fill" style={{ width: `${projection.spent > 0 ? (row.value / projection.spent) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
          Vorab/Fix = vor Reisebeginn datiert oder Kategorie als Fixkosten markiert (Einstellungen → Kategorien).
        </p>
      </div>

      <div className="card">
        <div className="card-title">Ausgaben nach Kategorie</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatCHF(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">Kategorien-Analyse</div>
        {catTotals.map((c) => (
          <div className="category-bar-row" key={c.categoryId}>
            <div className="top">
              <span className="name">{categoryIcon(c.categoryId)} {categoryLabel(c.categoryId)}</span>
              <span>{formatCHF(c.total)} · {c.percent}%</span>
            </div>
            <div className="category-bar-track">
              <div className="category-bar-fill" style={{ width: `${c.percent}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Laufende Ausgaben pro Tag</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={daily.map((d) => ({ ...d, label: shortDate(d.date) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7EC" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v: number) => formatCHF(v)} />
            <Bar dataKey="total" fill="#2F5EA8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">Budgetentwicklung</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={timeline.map((t) => ({ ...t, label: shortDate(t.date) }))}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7EC" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v: number) => formatCHF(v)} />
            <Line type="monotone" dataKey="budgetLine" stroke="#9AA5B8" strokeDasharray="4 4" dot={false} name="Budgetlinie" />
            <Line type="monotone" dataKey="spent" stroke="#12233F" strokeWidth={2.5} dot={false} name="Ausgegeben" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">Grösste Ausgaben</div>
        {biggest.map((e) => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span>{categoryIcon(e.categoryId)} {e.description}</span>
            <strong>{formatCHF(e.amountCHF)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
