# Audit workflow

From an empty instance to an Existing prototype, findings, and Future concepts. All commands run inside a generated instance unless noted. Module field details are in [APP-MODULES.md](APP-MODULES.md); exporting and publishing are in [SHARING.md](SHARING.md).

## 1. Create the instance

From this product folder:

```sh
npm run create-instance -- ../acme-app-flow --name "Acme App Flow" --app-name "Acme" --port 8004
```

The parent folder must exist and the destination must be new; the generator never overwrites. It copies only the runtime, tooling, and templates (no example apps, no other clients). The instance opens on Overview in Existing and contains:

- `apps/existing.js`: an empty Existing design state (no screens yet).
- `apps/future.js`: a proposed-journey starting point for Future concepts.
- `apps/findings.js`: no findings, status "Work in progress", and three example journeys (`signing-up`, `first-task`, `managing-settings`) to rename or replace.
- `apps/design-system.js`: status `pending` until the design system is inferred.

Empty journeys show as "Not captured yet" in Screens, the Flow map, and Overview. To import an existing app instead, add `--from <folder> --manifest <manifest.json>`; the manifest must list its registry entry and every module, stylesheet, image, and font. Use [KICKOFF.md](KICKOFF.md) for the brief.

## 2. Set up the captures inbox

Captures go in one folder **outside** the project, so screenshots never reach Git or an export. Set it either way (first match wins):

1. `CAPTURES_DIR=/path/to/captures npm run import-captures` (relative to where you type the command)
2. `"capturesDir": "../acme-captures"` in `instance.json` (relative to the project)

The tools refuse an inbox inside the project. Layout:

```text
acme-captures/
  01-signing-up/          one folder per journey: NN-<journey id>, in findings.js journeys order
  02-first-task/
  03-managing-settings/
  recordings/             screen recordings for extract-frames
  heic-originals/         HEIC files moved here after conversion
```

A folder matches a journey by its name without the `NN-` prefix. Without a journeys registry, every subfolder becomes a journey.

## 3. Capture

- **Screenshots**: PNG, JPEG, WebP, or HEIC into the journey folders, named in screen order.
- **Screen recordings** (macOS only): put them in `recordings/` and run `npm run extract-frames`. It saves one full-size PNG per screen that stays still for about half a second, skipping transitions, scrolling, and repeats. Options: `--marks "0:00=01-signing-up,12:30=02-first-task"` sorts frames into journey folders by time; `--skip-matching <folder>` drops frames that match existing screenshots; `--sensitivity low|normal|high`; `--fps`; `--out`; `--force`. Needs Apple's command line tools (`xcode-select --install`).
- **Redaction** (macOS only): `npm run blur-regions -- <image> <output.png> <x,y,w,h> …` or `-- --spec jobs.json` writes a blurred copy (heavy pixelation, then Gaussian blur, minimum 24 px blocks so text cannot be read back). The original is never changed and cannot be the output. The blur is irreversible in the copy. Blurred areas are privacy redactions, not UI.

## 4. Import

```sh
npm run import-captures            # draft or append
npm run import-captures -- --dry-run
npm run import-captures -- --force # regenerate from scratch
```

- **First run** (Existing is still the untouched scaffold): drafts `apps/existing.js` from the whole inbox, copies images to `apps/assets/existing/`, and adds them to `instance.json`.
- **Later runs** are append-only: only shots not yet in the project are added (matched on filename without the `NN-` prefix), as cards marked **"NEW, needs completing"**, positioned by inbox order in `SHOTS` and their journey's steps. Existing cards are never changed.
- `--dry-run` reports what would be added.
- `--force` regenerates Existing from the whole inbox and discards every hand edit; the previous file is backed up to the system temp folder first.
- HEIC shots are converted to PNG with macOS `sips` and the originals moved to `heic-originals/`. On other systems they are skipped with a note.

`npm run draft-existing -- <folder>` drafts from any folder once, without the inbox; `--force` replaces an edited module.

Journeys in `apps/findings.js` marked `messages: true` (emails, push notifications, texts) get `channel` and `supports` fields on their drafted shots; the screen details show them as, for example, "Push · supports Completing the first task".

## 5. Complete Existing

Ask Claude (or work by hand) to complete the draft from the images alone:

1. Order screens (status-bar times are the most reliable order) and set aside near-duplicates.
2. Title each screen from its visible content.
3. Add a hotspot for every visible control: `to` a captured screen, `back`, or a `note` for an uncaptured outcome (full field list in [APP-MODULES.md](APP-MODULES.md#screenshot-based-existing-modules)).
4. Fix `JOURNEYS` to match; optionally add `STAGES` for a staged Flow map.
5. Draw each hotspot box onto its screenshot and correct any that miss their control.
6. Infer the design system into `apps/design-system.js` (schema in its header): sample color hex values from pixels, measure type in points, confirm families with `npm run scan-fonts -- <App.app|.ipa> --url <web app>` (bundled fonts are proof; otherwise Apple system fonts), cite each value with an evidence crop `{ card, box }`, fill `tokens`, then set status `ready`. The Design library shows a loading state until then, and Future inherits the tokens.

Keep this pass objective. Findings come next.

## Findings

`apps/findings.js` is the written audit:

```js
export default {
  summary: '',
  status: 'Work in progress',          // pill beside the Findings title
  evidenceState: 'existing',
  proposalState: 'future',
  journeys: [{ id, title, summary?, messages? }],
  opportunities: [{ id, title, summary, impact: 'high' | 'medium' | 'low' }],  // list order = priority
  items: [{ id, severity: 'high' | 'medium' | 'low', title, problem, recommendation,
            evidence: [cardIds], proposal: [cardIds], journey?, opportunity? }],
};
```

- **Journeys** tag findings, add a journey filter, order journeys in every view, and name the inbox folders.
- **Opportunities** group findings in priority order; ungrouped findings appear under "Not yet grouped".
- Evidence cards come from `evidenceState`, proposal cards from `proposalState`. Cite only what the screenshots show.
- `npm run check` rejects unknown severities, impacts, journeys, or opportunities, duplicate IDs, and missing cards.

The Findings view appears once items exist. **Present** walks through findings one at a time with evidence and proposal side by side. Inside a prototype, Existing / Future jumps to the paired card (first evidence and first proposal card of a finding, or a card's `compare`).

### Reviewing findings

Drafted findings are not the audit until a person has checked each against its evidence. In the local preview (`npm run dev`), **Review** in the Findings view opens one finding at a time beside every evidence screen it cites, with three questions: can I see this in the evidence, is it a user problem rather than a taste call, and is the recommendation specific enough to draw?

- **Accept** (A), **Edit** (E) or **Reject** (R); arrows move between findings. Edit changes severity, title, problem and recommendation, then accepts. Reject takes an optional reason.
- Decisions save to `apps/findings-review.json`, keyed by finding id: `{ decision: 'accepted' | 'rejected', edits?, reason?, reviewedOn? }`. The Studio lays this file over `apps/findings.js` when it loads, so the draft stays intact and an edit can be restored or a decision undone. Commit it with the audit.
- While a review is under way, the status pill shows its count ("4 of 12 reviewed"), each finding shows its state, and each opportunity shows how many of its findings are accepted. Rejected findings stay listed for the reviewer, struck through and unnumbered, and are left out of Present, journey counts and Existing / Future pairing.
- Saving is the preview's only write: one fixed file per findings module, from the loopback preview only. `npm run dev:phone` shows a saved review read-only.
- Once a review has any decision, exports and shared links carry accepted findings only (see [SHARING.md](SHARING.md)). `npm run check` rejects a malformed review or one that names a finding that no longer exists.

**Overview order**: intro (optional `about` block and the overview header), then the journeys table (screens and findings per journey, "Not captured yet" for empty ones), then "Early directions (not yet validated)" listing opportunities when findings exist, then the hypotheses and reference.

## 6. Future, export, share

Build proposed screens in `apps/future.js` as editable drafts, in the client's own tokens. Every control works or explains its limit. Then follow [SHARING.md](SHARING.md): `npm run export-share` for a local bundle, and `npm run share` only once the audience is authorized.
