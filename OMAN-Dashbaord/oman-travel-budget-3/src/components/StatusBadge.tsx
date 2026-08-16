import type { BudgetStatus } from '../types'

const CONFIG: Record<BudgetStatus, { icon: string; label: string }> = {
  good: { icon: '🟢', label: 'Im Budget' },
  warning: { icon: '🟠', label: 'Budget wird knapp' },
  danger: { icon: '🔴', label: 'Budget wird voraussichtlich überschritten' }
}

export default function StatusBadge({ status }: { status: BudgetStatus }) {
  const cfg = CONFIG[status]
  return (
    <span className={`status-badge ${status}`}>
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  )
}
