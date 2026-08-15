# Game data attribution

The panel includes generated, read-only lookup data used to display Palworld
names, categories, work suitability, combat values, passive descriptions, and
partner skills. Save files are parsed locally and are never sent to these data
sources.

- `game_index.json` was generated from the PalworldSavePal 1.0.1 data bundle.
- `pal_work_index.json` was generated from the MIT-licensed
  [Awy64/palworld-atlas-data](https://github.com/Awy64/palworld-atlas-data)
  dataset for dedicated-server build 24088465.
- `pal_detail_index.json` was generated from the MIT-licensed
  [PalCalc](https://github.com/tylercamp/palcalc) database snapshot v26.
- `pal_partner_index.json` was generated from the Simplified Chinese
  [PalDB](https://paldb.cc/cn/Pals) catalog.
- `worker_pal_index.json` contains generated Pal portrait and hunger-capacity
  lookup values.
- `pal_species_index.json` combines the Simplified Chinese Pal descriptions,
  partner skills, work suitability, level-up skills, and drops from
  [taoyunan/palworld-paldeck-cn](https://github.com/taoyunan/palworld-paldeck-cn)
  revision `d0167e16a3fd5e640d35366c40b991f80c2b14df` with base stats, hunger,
  and movement data from [Awy64/palworld-atlas-data](https://github.com/Awy64/palworld-atlas-data)
  revision `add14423f623c45836ed31f4a180c2adfa8b0ab7`, dedicated-server build
  `24088465`, and the MIT-licensed [PalCalc](https://github.com/tylercamp/palcalc)
  database revision `c59712e24b839a0bedef16b06a1a0117e8741fe3` (`v27`) for complete
  current species stats. Habitat coordinates and other map data are
  deliberately omitted.

These indexes are factual metadata and are bundled so the panel remains fully
local at runtime.

To regenerate the combined species index from the three exact Git revisions
above, run:

```sh
npm run sync:pal-species -- <palworld-paldeck-cn checkout> <palworld-atlas-data checkout> <PalCalc checkout>
```
