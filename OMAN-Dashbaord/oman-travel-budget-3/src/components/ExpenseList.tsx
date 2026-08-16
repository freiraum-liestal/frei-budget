import type { Category, Expense } from '../types'
import { expensesByDate, totalForExpenses } from '../utils/calculations'
import { formatAmount, formatCHF } from '../utils/currency'
import { useUI } from '../context/UIContext'

function formatDateHeader(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
}

function categoryFor(categories: Category[], id: string): Category {
  return categories.find((c) => c.id === id) ?? { id, label: id, icon: '🧾', isDefault: false }
}

export function ExpenseRow({ expense, category }: { expense: Expense; category: Category }) {
  const { openEditSheet } = useUI()
  return (
    <button className="expense-row" onClick={() => openEditSheet(expense)}>
      <div className="icon">{category.icon}</div>
      <div className="info">
        <div className="description">{expense.description}</div>
        <div className="category">{category.label}</div>
      </div>
      <div className="amounts">
        <div className="amount-chf">
          {expense.pendingSync && <span title="Wird noch synchronisiert" style={{ marginRight: 4 }}>⏳</span>}
          {formatCHF(expense.amountCHF)}
        </div>
        {expense.originalCurrency !== 'CHF' && (
          <div className="amount-original">{formatAmount(expense.originalAmount, expense.originalCurrency)}</div>
        )}
      </div>
    </button>
  )
}

export default function ExpenseList({ expenses, categories }: { expenses: Expense[]; categories: Category[] }) {
  if (expenses.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🧾</div>
        <h3>Noch keine Ausgaben</h3>
        <p>Tippe unten auf „+“, um deine erste Ausgabe zu erfassen.</p>
      </div>
    )
  }

  const grouped = expensesByDate(expenses)

  return (
    <>
      {Array.from(grouped.entries()).map(([date, dayExpenses]) => (
        <div className="day-group" key={date}>
          <div className="day-group-header">
            <span className="date">{formatDateHeader(date)}</span>
            <span className="total">{formatCHF(totalForExpenses(dayExpenses))}</span>
          </div>
          {dayExpenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} category={categoryFor(categories, e.categoryId)} />
          ))}
        </div>
      ))}
    </>
  )
}
