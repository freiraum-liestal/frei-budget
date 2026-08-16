import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { UIProvider } from './context/UIContext'
import BottomNav from './components/BottomNav'
import ExpenseSheet from './components/ExpenseSheet'
import Dashboard from './pages/Dashboard'
import ExpensesPage from './pages/ExpensesPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <AppProvider>
      <UIProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ausgaben" element={<ExpensesPage />} />
            <Route path="/statistik" element={<StatsPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
          </Routes>
          <BottomNav />
          <ExpenseSheet />
        </HashRouter>
      </UIProvider>
    </AppProvider>
  )
}
