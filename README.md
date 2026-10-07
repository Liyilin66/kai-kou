# Kai-Kou（开口）

Kai-Kou (开口) is an AI practice platform for the PTE Academic speaking and writing tasks.

## Main App

The product source lives in `kai-kou/`.

```bash
cd kai-kou
npm install
npm run dev
```

For the local scoring API:

```bash
npm run dev:api
```

See `kai-kou/README.md` for app setup, environment variables, deployment notes, and verification steps.

## Repository Layout

```text
kai-kou/              Main Vue/Vite app and Node API code
kai-kou/src/          Frontend routes, views, stores, and components
kai-kou/api/          Vercel serverless API entrypoints
kai-kou/backend/      Shared backend services and scoring logic
kai-kou/db/           Database SQL files
kai-kou/seeds/        Seed data
kai-kou/scripts/      Operational scripts
kai-kou/docs/         Product and operations documentation
```

## Local Artifacts

The following are local-only and should not be committed:

```text
.agents/
.claude/
.codex/
.omx/
.omc/
output/
wfd/
dist/
node_modules/
```

WFD audio generation docs live at `kai-kou/docs/wfd/audio-workflow.md`.
