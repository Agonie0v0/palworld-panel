# Palworld Panel Web

Vue 3 frontend for Palworld Panel.

This interface is based on [zaigie/palworld-server-tool](https://github.com/zaigie/palworld-server-tool) and remains subject to the upstream Apache License 2.0 for copied or derived content. Palworld Panel adds server deployment, Agent mode, maintenance, and game settings management.

```bash
pnpm install
pnpm test
pnpm build
```

The production build is committed in `dist/` because the root Dockerfile and host installation scripts deploy it directly.
