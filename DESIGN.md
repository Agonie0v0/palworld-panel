# Design System

## Direction

The panel is an operations console for a live Palworld world. It should feel calm,
precise, and recognizable without turning routine administration into game UI.

The signature element is the world-state rail: five live segments representing
server availability, FPS, player capacity, backup protection, and host health.
Color on this rail always carries operational meaning.

## Color

- Cloud: `#F5F7F8` for the workspace background.
- Ink: `#16211F` for primary content.
- Pal teal: `#0B746B` for navigation and primary actions.
- Telemetry blue: `#2F6F9F` for neutral live data.
- Alert amber: `#B87922` for elevated or incomplete states.
- Danger coral: `#C34B5A` for destructive actions and critical states.

Dark mode uses neutral green-black surfaces with brighter semantic colors. Avoid
large areas of saturated color and avoid decorative gradients.

## Typography

- Display: Bahnschrift with system CJK fallbacks for product names and headings.
- Body: Segoe UI Variable with PingFang SC and Microsoft YaHei fallbacks.
- Data: SFMono-Regular or Consolas for versions, ratios, timestamps, and metrics.

Letter spacing remains zero. Data uses tabular numerals where possible.

## Structure

- Sidebar: identity, managed-server state, primary navigation, tools, preferences.
- Workspace header: current view and a compact live telemetry strip.
- Overview: world pulse, host health, then one continuous operations band.
- Mobile: preserve the bottom navigation and use a bottom tool drawer.

Use borders and dividers to express grouping. Cards are reserved for distinct
records, dialogs, and framed tools rather than every page section.

## Interaction

- Active navigation uses teal and a filled icon well.
- Success, warning, and danger colors never act as decoration.
- Destructive controls keep a coral treatment and require confirmation.
- Motion is limited to state changes and the world-state rail entrance.
- All motion must respect reduced-motion preferences.
