---
name: neon-cat-neumorphic-design-system
source: extracted-from-code
character: "A quiet personal workspace with tactile neumorphic surfaces, compact information density, and a restrained teal action accent. The interface feels calm and practical across light, dark, sugar, and warm themes, while soft elevation keeps controls distinct without turning the page into decoration."
tokens: "Real values live in src/styles/_variables.scss, src/styles/_global.scss, src/styles/theme.css, and the Neu component Sass files. Read them there and never duplicate them here."
contrast: "Verified core pairs from the existing tokens: body 8.99:1 in light, 7.68:1 in dark, white on primary 6.59:1, and sugar body 13.95:1."
---

## Build mandate

You are a senior product designer. Every page should ship as a complete product surface inside the existing application shell. Give the user clear context, real product copy, a considered content hierarchy, and visible loading, empty, error, and recovery states where the feature needs them. Keep every element purposeful and avoid leaving a functional widget isolated in unused space.

## Character and direction

Use the existing soft neumorphic language as the defining visual move. Surfaces share the active theme background and become legible through paired light and dark shadows, modest borders, and compact rounded corners. Reserve teal for primary actions and meaningful focus, with the existing success, warning, and danger families used only for state and feedback.

Typography stays direct and readable. Use the existing Inter and Geist families for interface content, Geist Mono for numeric or technical values, and the existing Ma Shan Zheng face only where the surrounding product already uses its expressive voice. Motion should remain subtle and should communicate press, elevation, theme changes, or state transitions.

## Composition patterns

Keep the fixed navigation and shared `Content` shell as the page frame. Productivity pages should use a clear page title and short status summary, then group the main working surface and supporting history or context into responsive sections. Use compact vertical rhythm, aligned controls, and bounded panels instead of scattering small controls across the canvas.

For the Pomodoro surface, treat the active timer as the primary working area. Place synchronization and recovery feedback close enough to explain whether results are safe, then present month navigation, calendar context, and chronological history as one supporting record area. Empty, loading, offline, blocked, and conflict states should occupy the same stable regions as their populated forms.

## Component and usage rules

Reuse `NeuDiv`, `NeuButton`, `NeuInput`, `NeuProgressBar`, `Content`, the existing icon set, `cn`, and theme variables before creating a new primitive. Use embossed treatment for stable panels and primary controls, debossed treatment for inset values or progress, and flatter treatment for dense history rows where repeated shadows would add noise.

Use semantic buttons for actions and links for navigation. Primary emphasis belongs to the current main action only. Success, warning, and danger colors must pair with text or an icon and never carry meaning alone. Keep shadows restrained on repeated content, avoid raw colors and duplicate spacing values, and add missing reusable values to the existing token files instead of hardcoding them in a feature component.

Do not introduce a parallel card or button system. Do not use emoji as interface icons. Do not animate continuously except for the timer behavior itself, and respect reduced motion for decorative transitions.

## Responsive and accessibility direction

Start with a single column that keeps timer controls reachable on small screens, then allow the timer and record area to share wider space when the container permits. Preserve a minimum 44 by 44 interaction target, visible focus indicators, semantic heading order, and live regions for synchronization and blocking messages. Theme support includes the existing light, dark, sugar, and warm modes, so every new state must remain readable in each rather than assuming a single canvas.
