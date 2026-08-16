import React, { createContext, useContext, useState } from 'react'
import type { Expense } from '../types'

interface UIContextValue {
  isSheetOpen: boolean
  editingExpense: Expense | null
  openAddSheet: () => void
  openEditSheet: (expense: Expense) => void
  closeSheet: () => void
}

const UIContext = createContext<UIContextValue | undefined>(undefined)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [isSheetOpen, setSheetOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const value: UIContextValue = {
    isSheetOpen,
    editingExpense,
    openAddSheet: () => {
      setEditingExpense(null)
      setSheetOpen(true)
    },
    openEditSheet: (expense) => {
      setEditingExpense(expense)
      setSheetOpen(true)
    },
    closeSheet: () => {
      setSheetOpen(false)
      setEditingExpense(null)
    }
  }

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI muss innerhalb von <UIProvider> verwendet werden')
  return ctx
}
