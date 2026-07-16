# sav_cli Notice

This directory vendors the `sav_cli` parser from `zaigie/palworld-server-tool`.

- Upstream project: https://github.com/zaigie/palworld-server-tool
- Upstream directory: `sav_cli/`
- Upstream license for `sav_cli`: Apache-2.0

Runtime dependencies are installed from PalworldSaveTools:

- `palsav-flex`
- `palooz`

Those dependencies include native decompression code and declare GPL-related
licensing. Treat generated Docker images or redistributed parser bundles as
containing those runtime components.

Use the parser only for trusted Palworld server save files.
