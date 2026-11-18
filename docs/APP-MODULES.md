# App modules and workspace configuration

How an app module is shaped, how screenshot-based Existing modules work, and which workspace options `config.js` accepts. In the master, browser source is under `app/` (`app/config.js`, `app/apps/*.js`); generated instances use a flat layout (`config.js`, `apps/*.js`).

## The app contract

Each app module exports one object. Screen markup and product behavior live here; general studio behavior lives in `studio.js`.

- **`identity`**: `id`, `name`, `tagline`, `description`, `version`.
- **`overview`**, optional: `{ eyebrow, title, description, rationale, approachTitle, strategies, reference }`. `strategies` are hypothesis strings; only `**bold**` is formatted and all HTML is escaped. `reference` is `{ label, url }` with an HTTP(S) URL. Shown only when `studio.showOverview` is true.
- **`tokens`**: `background`, `surface`, `ink`, `muted`, `border`, `accent`, `accentSoft`, `onAccent`, `danger` for every supported appearance.
- **`appearances`**, optional: supported modes, default `['light', 'dark']`. A single mode hides the app appearance selector.
- **`presentation`**, optional: `{ width, height, edgeToEdge }`, default a 360 × 740 phone. `edgeToEdge: true` renders across the whole canvas without status bar, home indicator, or overlay wrapper. **`previewLabel`** renames the focused preview.
- **`library`**, optional: Design library specimens. `typography` entries are `{ name, sample, fontFamily, fontSize, fontWeight?, fontStyle?, description? }` or `{ name, description?, render(state) }`; `components` are `{ id, name, description?, render(state) }`. `paletteNote` labels sampled colors as approximate.
- **`freshState()`**: a new object with `route`, `overlay: null`, `toast: null`, and product state.
- **`SCREENS`**: route → pure `(state) => html`, normally an `.app-screen` root.
- **`handlers`**: action name → `(ctx, payload)`. **`ACTIONS`**: label, description, optional destination `to`.
- **`OVERLAYS`**: named renderers for dialogs and sheets. **`overlayContext`**, optional: `{ title, kind, how, actions, approach?, rationale?, notes? }` per overlay, with optional pure `resolve(state)` for the visible panel (`data-overlay-view` restores nested focus). **`dismissOverlay(ctx)`**, optional: return `true` when it handled Back/Escape.
- **`NAV`**: boards of state cards. **`FLOWS`**: journeys as ordered card references; each step's `label` describes its transition. Optional `journey` ties a flow to a findings journey.
- **`FLOW_STAGES`**, optional: see [Flow stages](#flow-stages).
- **`onEnter(ctx)`**, optional: starts simulated async work on entering a state. **`backRoute`**, optional: fallback route map for Back when a card was opened directly.

A design state with nothing captured yet may have empty `SCREENS`, `NAV`, and `FLOWS` (the Existing template starts this way); `npm run check` accepts that and lists its journeys as "Not captured yet".

### ctx, timers, and loading

Handlers read `ctx.state` and call `ctx.set(patch)`, `ctx.go(route, patch, { replace? })`, `ctx.back()`, `ctx.overlay(nameOrNull)`, `ctx.toast(message, duration)`, `ctx.later(ms, fn)`, `ctx.advance(ms, fn)`, or `ctx.action(name, payload)`.

Loading and saving are separate cards. `ctx.advance` completes them: it plays once per card per open prototype and records a precompletion checkpoint. Reset (or **R**) restores the latest loading snapshot, otherwise the selected card; Back and backward browsing hold restored loading for inspection; close and reopen to replay. Checkpoints keep entered drafts. `ctx.later` is for incidental timed updates. Both are cancelled on navigation, reset, or close; overlay timers also end when the overlay closes.

For unbuilt features, explain the limit and the next useful action ("This outcome is not built yet. Use Back to explore the draft; nothing is saved.") instead of faking success.

### Markup conventions

`data-action="name"` on buttons, `data-submit="name"` on forms, `data-field="prop"` binds an input to a top-level state property. Built-in actions: `back`, `dismiss-overlay`, `dismiss-toast`. Give multiple `.app-scroll` regions stable `data-scroll-key` values. Same-screen rerenders keep scroll, focus, and caret. Escape all dynamic text.

### State cards

Each `NAV` card declares `id`, `title`, `route`, `kind`, `status`, `setup(state)`, `match(state)`, `how`, and `actions`, plus a two-line summary: one `approach` sentence (what the screen does) and one `rationale` sentence (why). Legacy `rationale`/`notes` arrays still work. `setup` builds the reproducible state; `match` picks context during live use.

Routes are stable task names (`plan-create`), card IDs name specific states (`create-invalid`) and power `?app=…&state=…&card=…` links. Changing display copy never changes either.

To add a route: renderer in `SCREENS` and fields in `freshState()`; handler plus `ACTIONS` entry (`to` if it navigates); a matching `data-action` control; a `NAV` card and its `FLOWS` reference with real labels; then `npm run check` and tap through.

### Screen kinds and badges

Card `kind` may be `ready`, `loading`, `empty`, `error`, `success`, `dialog`, `sheet`, or `toast`. The studio only shows **Dialog**, **Empty**, **Error**, and **Success**: `ready` and `loading` are internal, and `sheet` is shown as Dialog. The screen-type filter appears only when at least two shown kinds exist. A card whose ID contains `composite` gets a **Composite** badge. The Screens grid shows no route IDs and no "Captured" badge; other statuses (such as Draft) still show.

## Screenshot-based Existing modules

`npm run draft-existing` and `npm run import-captures` generate `apps/existing.js` with three editable literals; the rest of the file is generated runtime. Its header comment is the authoritative reference.

**`SHOTS`**, one per captured screen: `route`, `image`, `size`, `title` (from the image, never the filename), `board` (journey title), `journey` (findings journey id), `approach`, `rationale`, `hotspots`, and optionally:

| Field | Meaning |
| --- | --- |
| `next`, `nextAfter` | A screen with nothing to tap that moves on by itself to route `next` after `nextAfter` ms (default 1200) |
| `backTo` | Route Back/Close returns to when the screen was opened directly |
| `kind` | `dialog` (anything over a visible screen), `empty`, `error`, `success`; `loading` for self-advancing screens |
| `channel`, `supports` | Only in journeys with `messages: true`: `push`, `email`, or `sms`, and the id of the journey the message serves |

**Hotspots** cover every visible control: `{ label, box: [left%, top%, width%, height%], ... }` with one of:

| Field | Meaning |
| --- | --- |
| `to: 'route'` | Opens the captured screen the control leads to |
| `back: true` | Returns to the previous screen (Back, Close, Cancel, Done) |
| `backPast: [routes]` | Like back, but keeps going back while the screen reached is in the list |
| `note: '…'` | Outcome not captured; the note is shown instead |

With `to`, optionally: `lateTo` (destination once `state.late` is set, when the same control led elsewhere later in the session), `leave: [routes]` (back out of these first, so Save replaces a stack of forms), `over: 'route'` (replace this screen in history first, for one-time setup screens). `phase: 'early' | 'late'` on any hotspot sets `state.late` when its screen opens. `npm run check` confirms every `to`, `lateTo`, `over`, `leave`, and `backPast` route exists.

**`JOURNEYS`**: `[{ title, journey, steps: [route, …] }]`, plain route lists (a journey may have several branch entries). **`STAGES`**: `{ journeyId: [{ label, routes }] }`, exported as `FLOW_STAGES`. Keep `SHOTS` and `JOURNEYS` plain literal arrays so import-captures can append to them.

### Composites

When no single capture shows a needed state (a sheet over a different screen), join unedited captured pixels from two captures into one image. Put `composite` in its route and file name; the card gets a Composite badge and image alt text says so. Never paint, retouch, or invent content.

## Flow stages

`FLOW_STAGES = { [journeyId]: [{ label, cards: [cardId, …] }] }` draws that journey on its own as a left-to-right tree, one column per stage, its paths merged. A screen sits below the screen in the same stage that leads to it; a screen in no stage takes the stage of the screen leading to it. Journeys without stages stay on the shared map. `npm run check` requires each staged card to exist, be on one of that journey's `FLOWS`, and appear once.

## Workspace configuration

`config.js` accepts an optional `studio` object. Unknown keys are rejected so mistakes are visible.

```js
"studio": {
  "showOverview": true,
  "defaultView": "overview",
  "headerTitle": "Example review",
  "headerSubtitle": "Draft experience",
  "showDesignLibrary": true,
  "sidebar": { "scope": "First journey" },
  "appearance": "light",
  "icon": "./apps/icon.svg",
  "about": { "preparedFor": "Example Co", "preparedBy": "Your name", "date": "October 2026", "scope": "Sign-up", "note": "Optional review instructions." }
}
```

- The studio chrome is a slim **top bar** with the view tabs; phones get bottom tabs. There is no sidebar. Legacy `sidebar.scope` shows as a label in the top bar; `sidebar.collapsible` is accepted and ignored. Journey jump links appear on the Screens view.
- `defaultView`: `overview`, `findings`, `screens`, `map`, or `library`; falls back to Screens when hidden.
- `showDesignLibrary: false` hides the Design library view.
- `appearance` fixes the Studio appearance and hides its switch. `icon` must be an image under `apps/` that is in the export inventory.
- `about` frames Overview for someone opening a link without a walkthrough; every field is optional.

Screens combines search, journey filter, and screen-type filter. On phones, step arrows or swipe browse cards; **Details** opens the explanation; **Full screen** gives the prototype more room. App appearance is stored per app and independent of Studio appearance; prototype state resets on reload.

### Overview, Findings, Present

Overview order: the `about` block and intro (`overview` header and rationale), then the journeys table, then the findings section (titled "Early directions (not yet validated)" when opportunities exist), then the `strategies` list and reference link. Findings data and the Present mode are described in [AUDIT-WORKFLOW.md](AUDIT-WORKFLOW.md#findings). Presenter mode loads every state's stylesheet together, so scope each under its own root class (the templates use `.client-existing` and `.client-future`). A card can pair itself with another state's card via `compare: { state: 'future', card: 'card-id' }`.
