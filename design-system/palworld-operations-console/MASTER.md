# Palworld Operations Console — Design System

## Intent

A calm control room for a world that keeps running whether players are online or not. The interface is operational first and game-adjacent second: real Pal portraits provide identity, while structure, typography, and controls remain precise and familiar.

Design dials: variance 7/10, motion 3/10, density 8/10.

## Visual language

- Use the existing restrained Pal teal for navigation, primary actions, and live state.
- Use telemetry blue for neutral measurements, amber for attention, and coral only for destructive or critical states.
- Light theme uses cloud workspace surfaces; dark theme uses neutral green-black surfaces. No decorative gradients or glass.
- Bahnschrift/system CJK for headings, Segoe UI Variable/system CJK for interface text, and SFMono/Consolas for telemetry.
- Use borders and surface shifts for grouping. Cards are reserved for distinct tools or records; no nested card grids.
- Radius scale: 6px controls, 8–10px compact records, 12px sections and tool surfaces.

## Spatial system

- Dense 4px base rhythm: 4 / 8 / 12 / 16 / 24 / 32.
- Desktop: persistent 264–268px command sidebar, 64px global status header, fluid workspace up to 1760px.
- Tablet: 228px sidebar and single-column world layout below 920px.
- Mobile: bottom navigation, 12px gutters, 44px minimum interactive targets, no horizontal page scrolling.

## Signature components

- World pulse: segmented status strip for server, FPS, players, base Pals, attention, and uptime.
- Base shifts: compact base summaries followed by a worker roster showing task, location, hunger, SAN, and attention.
- Side rail: host headroom and protection status; visually subordinate to world activity.
- Navigation: compact grouped commands with filled icon well only on the active destination.

## Interaction

- 150–220ms state transitions with ease-out curves; no page-load choreography.
- Never move cards or controls on hover. Feedback comes from surface and color changes.
- Every icon-only action has a label, every focus state is visible, and color is paired with text or iconography.
- Respect `prefers-reduced-motion` and keep content visible without animation.

## Avoid

- Player count as the sole definition of world activity.
- Large empty states when useful server or base data exists.
- Marketing-page heroes, oversized metrics, decorative dashboards, gradient text, glass cards, and uniform bento grids.
- External web fonts or palette changes that dilute the established product identity.
