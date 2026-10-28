# App Flow Studio project instructions

## Purpose

Build the reusable Studio product and safely generate independent client instances. Each client audits Existing evidence and proposes a Future experience through Screens, Flow map, Design library, and a live prototype. When new to this project, read `README.md`, `app/config.js`, and the relevant module under `app/apps/`; reuse that context for subsequent edits. Use `docs/KICKOFF.md` when starting a new app. Generated clients retain their flat layout and their own instructions.

Requested routine local edits are authorized: implement, check the affected behavior, and report the result without a separate plan, diff approval, or teaching step. Ask only for a material ambiguity or an action outside the authorized scope. Local commits may group completed work; a commit after every small edit is unnecessary.

## Boundaries

- Work in this project only. Leave the reusable master unchanged when working in a generated app copy.
- Keep everything local. Do not deploy, publish, connect accounts, send messages, or add real network operations unless the user explicitly requests them. A push that triggers automatic deployment is a publishing action; confirm the intended target and audience are covered by that authorization.
- Use English copy, fictional identities, and clearly simulated data for invented examples. Narrow exception: when the user requests a faithful screenshot reference, preserve the supplied pixels and text in local copies, leaving originals unchanged. Preserve source proportions and native chrome; do not redraw obscured UI, fabricate missing states, or add unsupported appearances. This does not authorize publishing the source material.
- Distinguish screenshot-confirmed content from locally linked transitions. Controls with uncaptured outcomes should explain the limit instead of fabricating production behavior. Never invent implementation claims or describe a control that does not work.
- When the user requests a Future redesign, create proposed editable screens and interactions in a separate design-state module. Label them as drafts, keep Existing screenshots intact, and distinguish proposed product copy from confirmed production behavior.
- Preserve plain HTML/CSS/JS and the dependency-free server. Do not add packages or a build framework for routine design work.
- Keep shared studio behavior in `app/studio.js` and `app/studio.css`; keep product identity, tokens, design library, state, screens, actions, overlays, boards, and journeys in the app module.
- Keep browser source in `app/`, shareable project context in `docs/`, and generated public output in ignored `dist/`. Build from an explicit browser inventory. Never copy the repository wholesale into public output. Keep secrets, private notes, and raw chat exports outside the repository.
- Keep the studio chrome neutral and minimal. Open prototypes from screen cards or map nodes. Keep fresh-app creation in the documented CLI workflow.
- Studio appearance and app preview appearance are independent. Store the studio preference globally and the app preference per app in browser-local storage. App colors and typography must not inherit the studio’s visual identity.
- Avoid importing any specific example app from the studio runtime. `app/config.js` is the app registry; its module and asset paths remain relative to the browser root.

## Working model

- `freshState()` returns a new state object, including `route`, `overlay: null`, and `toast: null`.
- `SCREENS` and `OVERLAYS` are pure renderers. Do not mutate state or schedule work during rendering; the same renderer appears in static cards and the live prototype.
- `handlers` implement behavior. `ACTIONS` describe it. Use `ctx.go`, `ctx.set`, `ctx.back`, `ctx.overlay`, `ctx.toast`, `ctx.later`, and `ctx.advance`.
- Keep loading and saving as distinct cards. Use `ctx.advance` for their automatic completion: it plays once per card per open prototype and records a precompletion loading checkpoint. Reset/R restores the latest loading snapshot, otherwise the selected card; Back and backward card browsing hold restored loading for inspection. Closing and reopening permits replay. Preserve entered drafts in loading checkpoints.
- Use `ctx.later` for incidental timed updates. Both timer methods are managed so stale work cannot mutate another card after navigation, reset, or close.
- `NAV` groups cards. Card `setup` creates a reproducible state; `match` selects accurate context during live interaction. Every card ID is unique.
- `FLOWS` references existing cards. Connection labels must describe working transitions.
- Optional `appearances` declares supported modes; default is light and dark. Supply tokens for each declared mode. Optional `presentation: { width, height, edgeToEdge }` sets the canvas; edge-to-edge screens own the complete frame without generic device chrome or the studio overlay wrapper. Optional `previewLabel` names the focused preview.
- Optional `library.typography` and `library.components` supply the selected app’s Design library. Keep specimens consistent with the actual app. Both can use pure `render(state)` functions for static source crops. Use `library.paletteNote` to distinguish sampled colors from authoritative design tokens; do not guess source fonts when only pixels are available.
- Optional `overview` belongs to the app; workspace options belong to `config.studio`. Keep Overview separate from Screens and Flow map. Use only escaped text with limited `**bold**` in hypotheses.
- Cards and overlay context should use a two-line summary: one short `approach` sentence followed by one short `rationale` sentence, placed above entry context and interactions. Legacy `rationale` lists and `notes` remain supported. `overlayContext.resolve(state)` is pure and must describe the currently visible panel. Stable scroll keys and form field names preserve context during rerenders.
- Use stable task-based route names as precise screen references, and unique card IDs for specific states and review links. Preserve identifiers when only display copy changes.
- Update markup, action metadata, card context, and flow references together.
- Escape dynamic text rendered into HTML. Keep form labels, button names, focus behavior, keyboard access, readable contrast, and touch targets usable.

## Keep scope teachable

Start with the smallest complete journey. Add distinct states when they clarify product behavior, not to reach a screen count. Use existing UI primitives and theme tokens; support light and dark for editable examples, and only source-supported appearances for screenshot references. Keep content usable inside its declared canvas and the studio responsive on smaller windows.

## Commands and completion

- `npm run dev` starts the local preview; the terminal reports its actual URL.
- `npm run dev -- --port 0` chooses an available port automatically.
- `npm run check` validates app configuration and consistency.
- `npm run build` validates and generates the master’s browser-only `dist/`. It does not deploy. Review the output before separately authorized publication.
- `npm run create-instance -- ../client-app-flow --name "Client App Flow" --app-name "Client" --port 8004` creates an independent Existing/Future instance and refuses an existing destination.
- In a generated instance, keep `instance.json` synchronized with required app content and assets. `npm run export-share` exports only that explicit inventory and the browser runtime.
- Optional `instance.json.exportFiles` narrows the export and phone-preview inventory; preserve active modules, styles, icons, assets, and third-party license notices. Dynamically computed asset paths still require manual inventory review.
- Client workflow: Sam screenshots the client's app on an iPhone into a folder. Create a new instance, run `npm run draft-existing -- <folder>`, then complete Existing from the images alone: order by status-bar time, set aside near-duplicates, map every visible control (`to` a captured screen, `back`, or an uncaptured `note`), and add `JOURNEYS` for the Flow map. Then infer the client's design system into `apps/design-system.js` (schema in its header; status `pending` until done): sample every color hex from pixels, measure type sizes in points, confirm families with `npm run scan-fonts -- <App.app|.ipa> --url <web app>` (bundled fonts are proof; used-but-unbundled means Apple system fonts), cite each value with an evidence crop `{ card, box }`, and fill `tokens` so Future inherits it. Before reporting, draw every hotspot and evidence box onto its screenshot and correct any that miss their control. Keep it objective; findings come later.
- In an instance, `npm run draft-existing -- <folder>` drafts the Existing module from screenshots, and `npm run share` publishes to Vercel (outward-facing; needs explicit authorization of project and audience). Findings live in the registry entry's `findings` module.
- `npm run dev:phone` explicitly enables a private-LAN preview with a local QR page. Keep `npm run dev` loopback-only. Never enable LAN mode implicitly.
- Keep client screenshots and identifiers out of the reusable master and fresh templates.
- Generated projects are independent copies; never claim automatic inheritance of later master updates.
- Do not claim that writing local action settings has registered the folder as a Codex project or proven UI detection.

Match verification to the change:

- Copy or styling: inspect the affected view and any layout or appearance it changes. Behavior: exercise the changed path and its relevant recovery or navigation. Run `npm run check` for app-code or configuration changes.
- Shared runtime, generator, export, or hosting changes: add regression checks for the contracts and consumers they affect. Check forms, timers, keyboard access, appearances, narrow layouts, or source fidelity when those are implicated; do not run the entire browser matrix for an unrelated edit.
- Documentation-only changes need a content/diff review, not a build, server, or browser. Generated-document changes also need a syntax check and a sample generated client.
- Before publishing, build or export, review the output inventory and privacy boundary, and verify the authorized deployment. Routine local edits do not need a fresh export, validation-log entry, setup audit, or teaching walkthrough. Revisit Run/project registration only when new, changed, or broken.

Stop once the relevant checks pass unless new evidence requires more work. Report actual verification and material gaps honestly.

Report the working preview URL, actual project directory, concise change summary, and material limitations. Leave a usable local preview running when practical.
