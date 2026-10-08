# Repository Guidance

This repository is organized around the Kai-Kou product app in `kai-kou/`.

## Scope

- `kai-kou/` is the main application and deployment root.
- `kai-kou/AGENTS.md` contains the detailed app-level working rules.
- Root-level files should stay limited to repository guidance, summary docs, and ignore rules.

## Keep Out Of Git

Do not commit local agent runtimes, generated state, build output, logs, or local production artifacts:

- `.agents/`
- `.claude/`
- `.codex/`
- `.omx/`
- `.omc/`
- `output/`
- `wfd/`
- `dist/`
- `node_modules/`
- local `.env*` files

## WFD Boundary

Keep WFD implementation code in `kai-kou/src`, `kai-kou/backend`, and `kai-kou/scripts`.
Keep WFD process documentation in `kai-kou/docs/wfd/`.
Generated WFD audio, workbooks, and run reports belong outside Git history.

## Release Gate

Vercel deploys production automatically from `main`. Pushing `main` is a production release.

- Work on `lyl`. Before starting a task, merge `main` into `lyl` so both branches are in sync.
- Any change that affects the live app (`kai-kou/src`, `kai-kou/api`, `kai-kou/backend`, `kai-kou/server.js`, `kai-kou/vercel.json`, `kai-kou/package.json`, or SQL the app depends on) stops at `lyl` after push. Do not merge to `main` until the user confirms that the separate Claude review has passed. A self-review or sub-agent review does not count.
- Docs-only changes (`kai-kou/docs/`, README) may go to `main` without that review.
- When handing work over for review, list the commits on `lyl` that are not on `main`.

## Git Hygiene

Before committing, check `git status -sb --untracked-files=all` and stage only intentional source, docs, or config changes.
Do not stage logs, runtime state, generated reports, local media output, or tool-specific cache directories.
