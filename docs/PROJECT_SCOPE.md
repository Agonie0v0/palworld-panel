# Project Scope

## Target

Build a Palworld management platform with this flow:

1. Deploy the Web panel on AMD64 or ARM64 Linux.
2. Use the panel to deploy a Palworld dedicated server locally or through a remote Agent.
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
- Remote layer:
  - Token-protected Agent RPC.
  - Panel and game server can run on different AMD64/ARM64 machines.

## Implemented

- Panel runs on Node.js.
- Panel can start, stop, restart, update, and back up the server.
- Panel can write `PalWorldSettings.ini`.
- Panel can call RCON commands.
- Panel can read Palworld REST API endpoints.
- Panel can manage backup list, download, restore, and delete.
- Panel can store whitelist records.
- Panel can schedule automatic backup and broadcast.
- Panel can manage RCON templates and scheduled RCON tasks.
- Panel includes sav_cli-based save parsing.
- Panel shows player, guild, pal, and inventory summaries and detail views from save data.
- Panel shows Palworld map tiles with player and base markers.
- Panel has first-run administrator initialization and account/password login.
- Panel has responsive mobile layouts.
- Panel uses a desktop operations sidebar and mobile bottom navigation.
- Dashboard shows server version, uptime, FPS, world day, online count, memory, and backup health.
- Player management merges live REST API presence with historical save records and supports search/filtering.
- Player and guild records use structured detail views with raw JSON available only as diagnostics.
- Save data uses category switching for players, guilds, pals, inventory, and the Palworld world map.
- Panel has a Deployment page.
- Deployment page can call a Linux deployment script.
- Deployment script supports AMD64 native and ARM64 box64.
- Agent installer supports separated panel/server deployment.

## Deliberate Differences From palworld-server-tool

- The lightweight panel uses JSON files instead of a database.
- The frontend stays dependency-light and build-free instead of shipping a Vue component bundle.
- Detail views prioritize the fields returned by the bundled parser and keep complete records in expandable diagnostics.
- Map tiles are loaded on demand from the public upstream map resource to keep the Docker image small.
- Pal images and the full item/pal asset catalog are not bundled, which keeps ARM deployments and updates small.

## Recommended Next Milestone

Add production hardening:

- HTTPS reverse-proxy examples.
- Agent IP allow-list examples for Oracle Cloud.
- Automated integration tests against a disposable Linux VM.
- Optional self-hosted map and pal asset package for offline installations.
- Rich whitelist table actions and RCON template variable completion.
