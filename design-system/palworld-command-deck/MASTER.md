# Palworld Command Deck Design System

**Version:** 0.7.0
**Design dials:** variance 9/10 · motion 7/10 · density 5/10

## Direction

The panel is a persistent world-operations cockpit, not a conventional admin template. Its visual language combines a dark navigation hull, spacious operational canvases, asymmetric telemetry, and Pal-focused imagery. The interface should feel alive while remaining calm enough for long-running server administration.

## Foundations

- Brand accent: existing Pal teal through semantic `--app-accent` tokens.
- Surfaces: `--app-surface`, `--app-surface-muted`, and `--app-border`; never introduce page-local theme palettes.
- Status: semantic success, warning, error, and info tokens paired with text or icons so color is never the only signal.
- Typography: the existing system UI stack for Chinese and Latin text; `--app-font-data` for telemetry and tabular figures. No remote font dependency.
- Spacing: 4/8px rhythm, with `clamp()` for desktop gutters, hero padding, and display type.
- Shape: 12–18px controls, 18–30px operational surfaces, and asymmetric hero corners used sparingly for identity.

## Layout

- Desktop shell: 336px navigation at 2K and above, scaling down to 292px and 252px at intermediate breakpoints.
- Desktop top bar: 96px with telemetry separated into readable status cards.
- Main canvas: fluid gutters and full-width operational sections; avoid a narrow fixed dashboard column on large displays.
- Mobile: compact top identity bar and five-item bottom navigation; core world state appears before secondary intelligence.
- Breakpoints verified at 375, 812 landscape, 1024, 1440, and 2048px.

## Components

- Interactive Pal cards use a large portrait, activity label, level, hunger, and SAN. They are never rendered as table rows on the overview.
- Base selectors reveal one habitat at a time and preserve a clear active state.
- Pal details use centered, scrollable archive modals with a strong portrait hero and two-column information layout; mobile collapses to one column.
- Icon-only controls are at least 44×44px and use Tabler vector icons with accessible labels.
- Hover and pressed feedback may change elevation, border, opacity, or transform without changing layout bounds.

## Motion and accessibility

- Use 150–300ms ease-out transitions for direct interactions.
- Respect `prefers-reduced-motion`; remove decorative movement and hover displacement when requested.
- Every interactive surface must expose `:focus-visible` treatment and keyboard activation through native controls.
- Modal scrims use strong contrast and blur to isolate the active archive.
- Maintain readable contrast in both themes and prevent horizontal overflow at every breakpoint.

## Anti-patterns

- No overview tables for Pal activity.
- No right-side drawers for complete Pal profiles.
- No emojis as structural icons, remote font imports, hover-only actions, or ad-hoc colors.
- No dense 11–12px desktop body copy as the primary information layer on high-resolution screens.
