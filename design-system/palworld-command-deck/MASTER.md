# Palworld Command Deck Design System

**Version:** 0.8.1
**Design dials:** variance 8/10 · motion 7/10 · density 7/10

## Direction

The panel is a persistent world-operations cockpit, not a conventional admin template. Its visual language combines a theme-aware navigation deck, spacious operational canvases, asymmetric telemetry, and Pal-focused imagery. The interface should feel alive while remaining calm enough for long-running server administration.

## Foundations

- Brand accent: existing Pal teal through semantic `--app-accent` tokens.
- Surfaces: `--app-surface`, `--app-surface-muted`, and `--app-border`; never introduce page-local theme palettes.
- Status: semantic success, warning, error, and info tokens paired with text or icons so color is never the only signal.
- Typography: the existing system UI stack for Chinese and Latin text; `--app-font-data` for telemetry and tabular figures. No remote font dependency.
- Spacing: 4/8px rhythm, with `clamp()` for desktop gutters, card padding, and display type.
- Shape: 8–18px controls and operational surfaces; asymmetric corners are used sparingly for identity.

## Layout

- Desktop shell: compact 224–252px navigation with its own vertical overflow only when the available height is unusually short.
- Navigation theme: a soft accent/info gradient in light mode and a distinct deep teal gradient in dark mode; both retain semantic contrast.
- Desktop top bar: 68–76px with telemetry separated into readable status cards.
- Main canvas: fluid gutters and full-width operational sections; avoid a narrow fixed dashboard column on large displays.
- Overview intelligence: host identity, resource dials, safeguard identity, and safeguard facts share compact horizontal telemetry bands on wide screens; cards must not gain artificial height just because the canvas is wide.
- Mobile: compact top identity bar and five-item bottom navigation; core world state appears before secondary intelligence.
- Breakpoints verified at 375, 812 landscape, 1024, 1440, and 2048px.

## Components

- Interactive Pal cards use a large portrait, activity label, level, hunger, and SAN. They are never rendered as table rows on the overview.
- Passive-skill tiers use their full card surface as the in-game cue: neutral gray, negative red, metallic gold, and rainbow gradient. Tier names remain available to assistive technology but are not repeated as visible pills.
- Base selectors reveal one habitat at a time or aggregate every habitat through an explicit “All bases” option.
- Pal details use centered, scrollable archive modals with a strong portrait hero and two-column information layout; mobile collapses to one column.
- Primary icon-only controls are at least 44×44px and use vector icons with accessible labels; compact persistent navigation utilities may use 34×34px targets with tooltips.
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
