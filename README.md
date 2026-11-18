# App Flow Studio

A foundational tool Sam Sabeti built for UX audits and diagnostics of existing apps. Point it at a folder of screenshots and it helps you:

- **Map the existing app** into journeys, with click-through prototypes built from the real screenshots: every visible control opens the screen it leads to, or says the outcome was not captured.
- **Record findings** tied to the screens that prove them, grouped into journeys and opportunities, ready to walk through in Present mode.
- **Sketch the future state** as editable concept screens beside the evidence, with an Existing / Future toggle on every view.

Each audit lives in its own generated **instance**, an independent copy with Overview, Screens, Flow map, Findings, and Design library views. This repository holds only the reusable product, templates, and fictional examples. Client material never belongs here.

Plain HTML, CSS, and JavaScript with a dependency-free Node server. No build framework, no install step.

**Status:** in active development on localhost; private for now, public soon. A screenshot-based demo is coming; today's built-in example is the fictional Daylight app.

## Quick start

Requires Node.js 18 or later.

```sh
npm run dev
```

Open the URL printed in the terminal (default `http://127.0.0.1:8002`; busy ports fall forward, `-- --port 0` picks a free one). The server binds to your computer only. `npm run check` validates the example apps.

## The audit workflow

1. **Create an instance** next to this folder:
   `npm run create-instance -- ../acme-app-flow --name "Acme App Flow" --app-name "Acme" --port 8004`
   It starts empty, with three example journeys and a "Work in progress" status.
2. **Capture** screenshots (or screen recordings) into a captures inbox outside the project, one folder per journey: `01-signing-up`, `02-first-task`, and so on. `npm run extract-frames` turns recordings into stills; `npm run blur-regions` redacts private details (both macOS only).
3. **Import**: `npm run import-captures` drafts Existing from the inbox. Later runs only append new shots, marked "NEW, needs completing".
4. **Complete the hotspots**: order and name each screen, map every visible control, draw the journeys, and infer the app's design system from the pixels.
5. **Write findings** in `apps/findings.js`: each one cites Existing evidence, belongs to a journey, and can be grouped under an opportunity.
6. **Sketch the future, then share**: build concept screens in the Future module, `npm run export-share` for a local static bundle, and publish with `npm run share` only once the audience is authorized.

## Documentation

| File | What it covers |
| --- | --- |
| [docs/AUDIT-WORKFLOW.md](docs/AUDIT-WORKFLOW.md) | Captures inbox, import and append, frames, blurring, completing Existing, findings, Overview |
| [docs/APP-MODULES.md](docs/APP-MODULES.md) | App module contract, hotspot fields, screen kinds, flow stages, workspace configuration |
| [docs/SHARING.md](docs/SHARING.md) | Export, local hosting, phone preview, publishing a client instance |
| [docs/KICKOFF.md](docs/KICKOFF.md) | Brief for starting a new client instance |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting this repository's public example site |

Contributor and agent rules are in [AGENTS.md](AGENTS.md).

## Layout

```text
app/          Browser source: studio runtime, shared UI, fictional example apps
docs/         Guides and records (never served)
scripts/      Checks, build, instance generator, capture and export tools
templates/    Starting content for new client instances
dist/         Generated public build, ignored by Git
```

A prototype and evidence-review workspace, not a production integration: captured screens are evidence, and proposed copy is a design choice, not a product promise.
