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

These indexes are factual metadata and are bundled so the panel remains fully
local at runtime.
