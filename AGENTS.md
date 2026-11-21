# App Flow Studio project instructions

Reusable product for UX audits of existing apps: Existing screens mapped from screenshots, findings, and Future concepts, in independent generated client instances. When new here, read `README.md`, `app/config.js`, and the relevant module under `app/apps/`; then the doc for the task: `docs/APP-MODULES.md` (module contract, config), `docs/AUDIT-WORKFLOW.md` (captures to findings), `docs/SHARING.md` (export, publish), `docs/KICKOFF.md` (new instance), `docs/GETTING-STARTED.md` (non-coder setup).

## Current state

- Developed on localhost only (`npm run dev`, http://127.0.0.1:8002). Not deployed: no hosting is connected to this repo. GitHub `samansabeti/app-flow-studio` is public (template repository).
- The built-in demo is the fictional, code-drawn Daylight app (with invented example findings to try Review on) plus a Blank app. A screenshot-based demo instance is planned from screenshots Sam will supply; until then the client template starts empty with three example journeys.
- Ingest is production screenshots (captures inbox → `npm run import-captures`). Screen-recording extraction exists but is secondary.
- Audience: recruiters reviewing Sam's work and anyone (including non-coders) using it for their own audits. MIT licensed. README is the pitch; `docs/GETTING-STARTED.md` is the no-coding-assumed path. Keep both accurate when commands change. GitHub Actions (`.github/workflows/check.yml`) runs check, check:build and build.
- History before Nov 18 was imported from the private archive repo with client names, local paths and co-author trailers removed. Never reintroduce them.

Requested local edits are authorized: implement, check the affected behavior, report. Ask only for material ambiguity or anything outside scope. Group local commits at useful milestones. Commits credit Sam only: no Claude/AI co-author trailers or generated-by lines.

## Security and publication

- Treat this repository as public (it will be published). Use only invented, neutral examples (fictional apps, people, data). Never commit client names, screenshots, identifiers, findings, or paths to private material, here or in templates. Client work lives in a generated instance outside this repo.
- Keep everything local. Pushing to GitHub, deploying, publishing, `npm run share`, connecting hosting or accounts, sending invitations, and real network operations all need explicit authorization of target and audience. Export (`npm run export-share`) and build are local and are not publishing.
- Captures inboxes, recordings, and frames stay outside every project folder. Never put secrets, `.env` files, private notes, or chat exports in the repo. Public output is only the explicit browser inventory in `dist/`; never copy the repository wholesale.
- `npm run dev` stays loopback-only; LAN access only through explicit `npm run dev:phone`. The preview's only write is the findings review file (`<findings>-review.json`, same-origin PUT, never in phone mode); add no other write routes without asking.

## Fidelity

- Distinguish screenshot evidence from linked transitions. A control with an uncaptured outcome explains the limit (`note`); never fabricate production behavior, screens, or findings. Composites join unedited captured pixels only.
- Drafted findings are unreviewed until a person accepts them in Review. Never write or edit a findings review file on someone's behalf, and never present unreviewed findings as reviewed. Exports carry accepted findings only once a review exists.
- Future redesigns go in a separate design-state module, labelled as drafts; Existing screenshots stay intact. Proposed copy is not a product claim.
- Reference apps expose only appearances their evidence supports. Preserve source proportions and native chrome.

## Code rules

- Plain HTML/CSS/JS and the dependency-free server. No packages or build framework for routine work.
- Shared studio behavior in `app/studio.js` and `app/studio.css` (flat `studio.*` in instances). Product identity, tokens, design library, state, screens, actions, overlays, boards, and journeys in the app module. The runtime never imports a specific example app; `app/config.js` is the registry.
- `SCREENS`, `OVERLAYS`, `library` renderers, and `overlayContext.resolve` are pure: no state mutation or scheduled work. Behavior lives in `handlers` through `ctx` (`go`, `set`, `back`, `overlay`, `toast`, `later`, `advance`, `action`); `ACTIONS` describe it. No unmanaged timers.
- Loading and saving are distinct cards completed with `ctx.advance`; incidental timers use `ctx.later`.
- Card IDs are unique; routes are stable task names. Update markup, actions, card context, and `FLOWS` together. Escape dynamic text; keep labels, focus, keyboard access, contrast, and touch targets usable.
- Studio chrome is a neutral top bar (bottom tabs on phones). Studio and app appearance are independent.
- Generated instances are independent copies with a flat layout; never claim they inherit later master changes.

## Commands

- `npm run dev` preview · `npm run check` contract checks · `npm run build` master `dist/` (no deploy) · `npm run check:build` build isolation tests
- `npm run create-instance -- ../x-app-flow --name "X App Flow" --app-name "X" --port 8004` refuses existing destinations.
- In instances: `import-captures`, `draft-existing`, `extract-frames`, `blur-regions`, `scan-fonts`, `export-share`, `share`. See `docs/AUDIT-WORKFLOW.md` and `docs/SHARING.md`.

## Completion

- Run `npm run check` before finishing any app-code, template, or configuration change, and inspect the changed view or path. Shared runtime, generator, or export changes need regression checks for their consumers.
- Documentation-only changes need a content/diff review, not a server or browser.
- When behavior or usage changes, update this file or the matching `docs/` file in the same commit. No changelogs here; history is in Git.
- Report the preview URL when relevant, what was verified, and material gaps.
