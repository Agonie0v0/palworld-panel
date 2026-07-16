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
- Panel has a Deployment page.
- Deployment page can call a Linux deployment script.
- Deployment script supports AMD64 native and ARM64 box64.
- Agent installer supports separated panel/server deployment.

## Deliberate Differences From palworld-server-tool

- Persistent database instead of only JSON files.
- The lightweight panel uses JSON files instead of a database.
- Detail views expose complete parsed records in a compact dialog instead of copying the reference Vue tables exactly.
- Map tiles are loaded on demand from the public upstream map resource to keep the Docker image small.

## Recommended Next Milestone

Add production hardening:

- HTTPS reverse-proxy examples.
- Agent IP allow-list examples for Oracle Cloud.
- Automated integration tests against a disposable Linux VM.
