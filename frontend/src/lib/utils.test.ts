import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, scoreToLevel, cn } from './utils'

describe('utils', () => {
  describe('formatCurrency', () => {
    it('formats USD correctly', () => {
      expect(formatCurrency(1234.56, 'USD')).toMatch(/US\$1,234\.56|\$1,234\.56/)
    })
    it('formats EUR correctly', () => {
      expect(formatCurrency(1234.56, 'EUR').replace(/\s/g, ' ')).toMatch(/€1,234\.56/)
    })
    it('handles zero', () => {
      expect(formatCurrency(0)).toMatch(/₹0\.00/)
    })
    it('handles undefined', () => {
      expect(formatCurrency(undefined)).toBe('—')
    })
  })

  describe('formatDate', () => {
    it('formats valid date string', () => {
      expect(formatDate('2024-01-15T12:00:00Z')).toMatch(/15 Jan 2024/)
    })
    it('handles undefined', () => {
      expect(formatDate(undefined)).toBe('—')
    })
  })

  describe('scoreToLevel', () => {
    it('returns LOW for < 30', () => {
      expect(scoreToLevel(29)).toBe('LOW')
    })
    it('returns MEDIUM for 30-59', () => {
      expect(scoreToLevel(30)).toBe('MEDIUM')
      expect(scoreToLevel(59)).toBe('MEDIUM')
    })
    it('returns HIGH for 60-79', () => {
      expect(scoreToLevel(60)).toBe('HIGH')
      expect(scoreToLevel(79)).toBe('HIGH')
    })
    it('returns CRITICAL for >= 80', () => {
      expect(scoreToLevel(80)).toBe('CRITICAL')
      expect(scoreToLevel(100)).toBe('CRITICAL')
    })
  })

  describe('cn (tailwind merge)', () => {
    it('merges class names correctly', () => {
      expect(cn('p-2 text-red-500', 'p-4')).toBe('text-red-500 p-4')
    })
    it('handles conditional classes', () => {
      expect(cn('p-2', true && 'text-red-500', false && 'text-blue-500')).toBe('p-2 text-red-500')
    })
  })
})
