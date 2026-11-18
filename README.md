# App Flow Studio

[![Check](https://github.com/samansabeti/app-flow-studio/actions/workflows/check.yml/badge.svg)](https://github.com/samansabeti/app-flow-studio/actions/workflows/check.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Turn a folder of app screenshots into a clickable UX audit.**

UX audits usually end up as slide decks: screenshots pasted out of order, findings that are hard to trace back to the screens that prove them, and redesigns shown with nothing to compare them to. App Flow Studio keeps the evidence, the findings, and the proposals together in one clickable workspace.

## What it does

- **Maps the existing app.** Drop in screenshots grouped by journey (signing up, first task, settings…). They become click-through prototypes and a flow map. Every visible button either opens the screen it leads to or says its outcome wasn't captured.
- **Ties findings to evidence.** Each finding cites the screens that prove it and is ranked by severity and grouped into opportunities. **Present** mode walks stakeholders through the findings one at a time.
- **Puts the future beside the present.** Proposed screens sit next to the real ones, with an Existing / Future toggle on every view.
- **Documents the design system.** A design library records the app's colors, type, and components, each backed by a crop of the screenshot it came from. Proposals reuse those tokens.

## Try it

You need [Node.js](https://nodejs.org) 18 or later. There is nothing else to install.

```sh
git clone https://github.com/samansabeti/app-flow-studio.git
cd app-flow-studio
npm run dev
```

Open http://127.0.0.1:8002 to explore **Daylight**, a fictional example app.

## Audit your own app

**[Getting started](docs/GETTING-STARTED.md)** takes you from screenshots to a first audit in about 15 minutes, with no coding experience assumed. In short:

```sh
npm run create-instance -- ../acme-app-flow --name "Acme App Flow" --app-name "Acme"
cd ../acme-app-flow
CAPTURES_DIR=../acme-captures npm run import-captures
npm run dev
```

Each audit is its own folder, separate from this repository, so your screenshots and findings stay private and never mix with the tool.

## Design decisions

- **Evidence is never invented.** Existing screens come only from captures. A control whose outcome wasn't captured says so instead of guessing. Proposals live in a separate, clearly labeled module.
- **Private by default.** Captures stay in a folder outside the project, the dev server only listens on your own computer, and exports include only an explicit list of files.
- **Each audit is an independent copy.** Client work can't break when the tool changes, and the tool never contains client material.
- **No dependencies.** Plain HTML, CSS, and JavaScript with a small Node server: no install step, no build framework, nothing to keep updated.
- **Checked, not just written.** `npm run check` validates every screen link, finding, and evidence reference before anything is shared.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Getting started](docs/GETTING-STARTED.md) | Install, first audit, import screenshots |
| [Audit workflow](docs/AUDIT-WORKFLOW.md) | Screen recordings, redaction, completing hotspots, findings |
| [App modules](docs/APP-MODULES.md) | Every field in the app files |
| [Sharing](docs/SHARING.md) | Static export, phone preview, publishing |
| [Deployment](docs/DEPLOYMENT.md) | Hosting the example site |

## Project layout

```text
app/          Browser source: studio runtime and fictional example apps
docs/         Guides
scripts/      Checks, build, audit generator, capture and export tools
templates/    Starting files for new audits
```

## License

[MIT](LICENSE) © Sam Sabeti
