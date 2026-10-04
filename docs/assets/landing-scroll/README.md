# Landing Scroll — docs/assets/landing-scroll/

Screenshots and GIFs for the feat/landing-scroll milestone (v0.4.1-landing).

## Expected captures

| Asset | Description |
|-------|-------------|
| `hero-dark.png` | Hero section — animated invoice mock + scan beam |
| `how-it-works-step1.png` | Sticky-scroll stage 1: Upload — dropzone + file chip |
| `how-it-works-step2.png` | Stage 2: Extract — scan beam + bounding boxes + field chips |
| `how-it-works-step3.png` | Stage 3: Analyse — 7 engine tiles + fusion indicator |
| `how-it-works-step4.png` | Stage 4: Explain — risk gauge + finding cards |
| `engines-grid-dark.png` | 7-signal grid with hover lift |
| `why-different-dark.png` | Stat counter cards (7 engines / 100% evidence / 0 verdicts) |
| `cta-dark.png` | CTA section with accent glow background |
| `*-light.png` | Light-theme equivalents |
| `scroll-demo.gif` | Short GIF of sticky-scroll storytelling in action |

## Lighthouse targets (run against local preview build)

```
npx lighthouse http://localhost:4173/ --only-categories=performance,accessibility,best-practices,seo
```

| Category | Target | Notes |
|----------|--------|-------|
| Performance | ≥ 85 | Stage SVGs are lazy-mounted via ViewportGate |
| Accessibility | ≥ 95 | All stages have aria-label; icons are aria-hidden |
| Best Practices | ≥ 90 | |
| SEO | ≥ 90 | |

## Animation notes

- Sticky-scroll section: `height: calc(4 * 100vh)`, inner sticky `100svh`.
- Scroll progress → `activeStep` via `useMotionValueEvent(stepFloat, 'change')`.
- Stage components mount fresh (AnimatePresence mode="wait") → auto-animate.
- `ViewportGate` gates mobile stage mounts to viewport entry.
- `prefers-reduced-motion`: shows static final states; sticky-scroll container
  hidden, mobile stacked layout shown in all cases.
