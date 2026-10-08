import { useEffect, useState } from 'react'

/**
 * Returns true when the user has requested reduced motion.
 * Use this to gate non-essential animations.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}

/**
 * Animated count-up hook.
 * Returns current display value, animating from 0 to `target`.
 */
export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) { setValue(target); return }
    const start = performance.now()
    const raf = (time: number) => {
      const elapsed = time - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(raf)
    }
    const handle = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(handle)
  }, [target, duration, reduced])

  return value
}
