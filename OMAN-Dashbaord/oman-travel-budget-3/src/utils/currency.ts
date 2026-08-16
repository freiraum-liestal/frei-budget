import type { CurrencyCode, ExchangeRate } from '../types'

/** OMR hat 3 Nachkommastellen (1 Rial = 1000 Baisa), andere Währungen 2. */
const DECIMALS: Record<string, number> = {
  OMR: 3
}

export function decimalsFor(currency: CurrencyCode): number {
  return DECIMALS[currency] ?? 2
}

export function formatAmount(amount: number, currency: CurrencyCode): string {
  const decimals = decimalsFor(currency)
  const formatted = new Intl.NumberFormat('de-CH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(amount)
  return currency === 'CHF' ? `CHF ${formatted}` : `${formatted} ${currency}`
}

export function formatCHF(amount: number): string {
  return formatAmount(amount, 'CHF')
}

export function getRate(rates: ExchangeRate[], currency: CurrencyCode): number {
  const found = rates.find((r) => r.currency === currency)
  if (!found) {
    console.warn(`Kein Wechselkurs für ${currency} gefunden, verwende 1.`)
    return 1
  }
  return found.rateToCHF
}

export function convertToCHF(amount: number, currency: CurrencyCode, rates: ExchangeRate[]): number {
  const rate = getRate(rates, currency)
  return Math.round(amount * rate * 100) / 100
}
