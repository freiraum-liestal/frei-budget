import { useApp } from '../context/AppContext'
import ExpenseList from '../components/ExpenseList'
import { totalForExpenses } from '../utils/calculations'
import { formatCHF } from '../utils/currency'

export default function ExpensesPage() {
  const { state } = useApp()
  const { expenses, settings } = state

  return (
    <div className="page">
      <header className="app-header">
        <h1>Ausgaben</h1>
        <div className="subtitle">
          {expenses.length} Ausgaben · {formatCHF(totalForExpenses(expenses))} total
        </div>
      </header>

      <ExpenseList expenses={expenses} categories={settings.categories} />
    </div>
  )
}
