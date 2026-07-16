# Project Scope

## Target

Build a Palworld management platform with this flow:

1. Deploy the Web panel on AMD64 or ARM64 Linux.
2. Use the panel to deploy a Palworld dedicated server on the same machine.
3. Use the panel to manage server lifecycle, settings, players, backups, RCON tasks, REST API data, and save data.

## Architecture

- Panel layer: Node.js WebUI and API.
- Deployment layer: Linux scripts called by the panel.
- Server runtime layer: systemd Palworld service.
- Compatibility layer:
  - AMD64: run Palworld server directly.
  - ARM64: run Palworld server through box64.
- Data layer:
  - JSON panel config.
  - File backups.
  - sav_cli save parser.

## Implemented

- Panel runs on Node.js.
- Panel can start, stop, restart, update, and back up the server.
- Panel can write `PalWorldSettings.ini`.
- Panel can call RCON commands.
- Panel can read Palworld REST API endpoints.
- Panel can manage backup list, restore, and delete.
- Panel can store whitelist records.
- Panel can schedule automatic backup and broadcast.
- Panel includes sav_cli-based save parsing.
- Panel shows player, guild, pal, and inventory summaries from save data.
- Panel has a Deployment page.
- Deployment page can call a Linux deployment script.
- Deployment script supports AMD64 native and ARM64 box64.

## Still To Match palworld-server-tool More Closely

- First-run administrator setup flow.
- Persistent database instead of only JSON files.
- Full player detail page.
- Full guild detail page.
- Full pal detail page.
- Map tile view with player/base markers.
- RCON command template library.
- Scheduled RCON task CRUD UI parity.
- Backup download endpoint and UI.
- Better mobile layout parity.
- Agent/remote-node mode if panel and game server are not on the same host.

## Recommended Next Milestone

Build a first-run wizard:

- Set panel token/admin account.
- Choose deployment mode.
- Deploy Palworld server.
- Set server name and passwords.
- Start server.
- Show required firewall ports.
