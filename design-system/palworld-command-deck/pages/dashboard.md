# Dashboard: World Command Center

This page overrides the master system where noted.

## Information architecture

1. World stage: large statement, unattended-world explanation, sync action, and live orbit telemetry.
2. Base habitats: selectable base rail plus a scene-like grid of Pal cards.
3. World intelligence: host resource dials, safeguards, backups, and shift coverage.
4. Pal focus: centered modal opened from a Pal card without changing the current base context.

## Interaction rules

- A base selection updates the habitat in place; it is not navigation.
- Show at most 12 prioritized Pals per habitat, with attention states first.
- Opening a Pal preserves the dashboard scroll and selected base.
- The modal closes through its visible 44px control, Escape, or the scrim.
- Sync remains the single primary action in the world stage.

## Responsive behavior

- At 1420px and below, reduce the Pal grid to two columns and reflow intelligence cards.
- At 1080px and below, stack the world stage and convert the base rail to a compact grid.
- At 720px and below, use one Pal column, horizontal base selection, a 320px orbit, and a single-column modal.
- Never allow the world orbit or base rail to create horizontal page overflow.

## Empty and degraded states

- No players online is an active-world state, not an idle or paused state.
- Missing world data provides a direct path to PST configuration or reparse guidance.
- Missing host telemetry leaves Pal habitat information usable and labels telemetry as unavailable.
