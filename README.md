# App Flow Studio

The reusable product for auditing an app's existing experience and designing its future experience. Each client gets an independent instance with an optional **Overview**, **Screens**, **Flow map**, **Design library**, and an **Existing / Future** toggle.

The product project contains only fictional examples and reusable templates. Client work belongs in a generated instance. Instances are independent copies, not live-linked deployments of the master; later Studio improvements must be deliberately ported and checked.

## Run the product

Requires Node.js 18 or later. No dependencies or install step.

```sh
npm run dev
```

Open the URL printed in the terminal. The default is `http://127.0.0.1:8002`; busy ports fall forward. Override with `npm run dev -- --port 8010`, or use port `0` for an available port. Stop with Ctrl+C. The server binds only to your computer and serves the browser source in `app/`. Use the server rather than opening `app/index.html` directly.

## Source, documentation, and output

This repository keeps the product together while separating files by purpose:

```text
app/          Browser source: HTML, CSS, JavaScript, and fictional examples
docs/         Project context, kickoff brief, validation, and deployment guidance
scripts/      Local checks, build, export, and client-generation tools
templates/    Starting content for independent client instances
dist/         Generated public files, excluded from Git
```

`README.md` stays at the root as the project entry point. `AGENTS.md` stays there so its instructions apply across the repository. `package.json`, `server.mjs`, and `vercel.json` configure local commands and hosting.

Run `npm run build` to validate the product and create `dist/`. The dependency-free build copies only an explicit browser-file inventory, sanitizes the configuration, and checks the resulting package. It does not upload anything. Treat `app/` as the editable source and `dist/` as disposable output: edit the source, then build again.

The build replaces only its own unchanged output. If you have edited `dist/` or created that folder yourself, it stops so you can preserve those files. Build ownership records stay outside the public folder in ignored `.app-flow-exports/`. Run `npm run check:build` to test output isolation, repeat builds, and overwrite protection using temporary fictional fixtures.

`package.json` declares `appFlow.browserRoot: "app"` for this master. The tools use that setting to find browser files while keeping their command entry points at the project root. Generated clients omit it and keep their flat layout.

Commit reviewed source and shareable documentation. Keep secrets, actual `.env` files, private notes, and raw chat exports outside this repository. `.gitignore` helps exclude untracked files; it does not erase files already committed. A private repository does not make a deployed website private. See [deployment guidance](docs/DEPLOYMENT.md) for the hosting boundary.

## Hosting and automatic deployment

[App Flow Studio](https://app-flow-studio.vercel.app) is the public site for the fictional examples. Anyone with the link can open it.

The existing Vercel project `samansabetis-projects/app-flow-studio` is connected to the private GitHub repository [samansabeti/app-flow-studio](https://github.com/samansabeti/app-flow-studio). Its production branch is `main`. A push triggers a build from the repository root using `npm run build`; only the contents of `dist/` are published. The current build contains eight browser files.

With automatic production-domain assignment enabled, successful builds from `main` update the same public URL. Local edits and commits alone do not change the site. Pushing `main` is a publishing action: review changes and the build before pushing. See [deployment guidance](docs/DEPLOYMENT.md) for verification and rollback.

## Create a client instance

From this product folder:

```sh
npm run create-instance -- ../acme-app-flow --name "Acme App Flow" --app-name "Acme" --port 8004
```

The parent folder must exist and the destination must be new. The generator refuses to overwrite files or folders. It copies only approved runtime, documentation, tooling, and template files. Fictional demo apps and other clients are excluded.

The new instance opens Overview in Existing, with an expanded collapsible sidebar and a visible Design library. It contains a single app with independent Existing and Future modules. Existing starts as an explicitly unreviewed evidence scaffold; Future starts as a proposed journey. The browser remembers a later version choice; imported instances retain their declared default. Replace those placeholders using [the kickoff brief](docs/KICKOFF.md). The old `create-app` command remains a compatibility alias.

Generated clients keep their existing flat layout: `index.html`, `config.js`, and the shared runtime live at the client root, with app modules under `apps/`. The master’s `app/` and `docs/` organization does not move files in existing clients.

To import an existing app, add `--from <source-folder> --manifest <manifest.json>`. The manifest must explicitly list its registry entry and each required content file. It must include every module, stylesheet, image, and font used by the app. The importer rejects escaping paths and symbolic links. It does not discover or copy an entire source folder.

`--from` is the folder that contains the manifest’s relative paths. For a generated client this is the client root; for content from this master it is `app/`.

## Use in Codex

1. Add this folder as a local project named **App Flow Studio**.
2. Add each generated folder as its own local project, using its instance name.
3. Start client work from that client's project. Keep reusable product work here.
4. Use the configured **Run** action to start the local server. In Codex, **Command-Shift-D** runs the primary action.

Local action settings are prepared in `.codex/environments/environment.toml`. Run starts the loopback preview; Phone preview explicitly enables the LAN preview; Check validates the app. Generated instances also have an Export action. If the actions are not picked up automatically, add the same commands through **Settings → Local environments** for that folder. Project registration and UI action detection must be confirmed in Codex; creating the files alone does not confirm either.

A chat is a conversation with a working folder. A local project gives that folder a persistent name and repeatable commands. A running server is the process that makes its `localhost` URL available. Opening a chat does not start that server. Registering a new project does not change an old chat's working folder.

## Share a client instance

In the client folder:

```sh
npm run check
npm run export-share
```

The export creates a static `dist/` folder for hosting, with only browser runtime and explicitly listed content assets. It excludes development tools, documentation, `.codex`, Git files, environment files, and source manifests. Exporting does not deploy or grant access to anyone.

`instance.json.files` is the complete local content inventory. Optional `exportFiles` is an explicit subset for export and phone preview. It must retain every active registry module, stylesheet, branding icon, and required browser asset. Use it to keep unused source evidence in the local instance without including it in the review bundle. Clients without `exportFiles` retain the original behavior: export their shareable `files`. Static imports and literal asset references are checked; computed filenames still require an accurate inventory and browser verification. Keep required third-party font or asset license files in the selected inventory.

Review the included screenshots and copy before choosing an audience. Captured accounts, conversations, and filenames may be sensitive. An unlisted public URL is still public. Use hosting with access control for private client review. No client invitation is sent by the generator or exporter.

Host `dist/` as a static site. Each screen can be linked using its existing `?app=...&state=...&card=...` URL. Keep export files unchanged between export and upload; run Export again after edits. The exporter refuses to overwrite an unowned or modified destination.

## What belongs where

| Location | Purpose |
| --- | --- |
| `app/config.js` | Studio name, app registry, versions, and defaults |
| `app/studio.js`, `app/studio.css` | Neutral shared Studio interface and interaction runtime |
| `app/app.css`, `app/ui.js` | Shared app primitives and rendering helpers |
| `app/apps/daylight.js`, `app/apps/blank.js` | Fictional product examples; not copied into client instances |
| `docs/` | Shareable context and guidance; excluded from the public build |
| `templates/client/` | Blank Existing audit and Future proposal templates |
| `scripts/build.mjs` | Validated browser-only master build into `dist/` |
| `scripts/create-instance.mjs` | Safe independent client creation |
| `scripts/export-share.mjs` | Static client export from the explicit file inventory |
| `scripts/check.mjs` | App contract and interaction consistency checks |
| `instance.json` in clients | Client identity, generator version, and content inventory |

In a generated instance, put screenshots, fonts, and assets under `apps/`, add their relative paths to `instance.json` when needed, and keep app-specific styling in the app's registered stylesheet. The app owns its tokens, typography, components, screens, boards, and journeys. Do not bake client names or app-specific behavior into the shared runtime.

## Explore and compare

Use the app picker in the master to explore examples. A single-app client instance hides that picker. Existing / Future switches Screens, Flow map, and Design library together. Each card opens its live prototype and contextual notes. Back, Reset, previous/next, and keyboard controls work in the focused view.

Loading and saving remain separate screen cards. Their automatic transitions play once per card while the prototype is open. Reset or **R** restores the most recent loading snapshot, or the selected card when no loading step has run. Back restores a loading checkpoint before its completion; restored loading and backward card browsing hold for inspection while visual animations continue. Close and reopen the prototype to replay. Loading checkpoints restore the simulated data and entered draft values from before completion.

Screens combines search, board filtering, and state-kind filtering. Counts reflect the visible selection. Board shortcuts clear those filters before revealing the selected board. Board navigation appears only in Screens; Overview and Flow map are separate views.

On a phone, use the bottom tabs to move between views. Open a card, then use the step arrows or swipe to browse; **App back** follows the prototype’s own history. **Details** opens the screen’s explanation and interactions. **Full screen** gives the prototype more room, and **Exit full screen** returns to the review controls without losing the current draft. Reference frames keep their declared proportions.

Studio appearance and app appearance are separate. A reference app should only expose appearances supported by its evidence. Prototype state is simulated and resets on reload; the browser remembers appearance and selected version. No authentication, recording, purchase, or service connection is implied by a prototype.

## Configure the workspace

`app/config.js` in the master, or `config.js` in a generated client, accepts an optional `studio` object. Omit it for the legacy defaults: Screens landing page, switchable Studio appearance, visible Design library, and expanded sidebar. New templates opt into Overview and a collapsible sidebar. Paths inside the configuration remain relative to the browser root, so an app module is still `./apps/daylight.js`.

```js
"studio": {
  "showOverview": true,
  "defaultView": "overview",
  "headerTitle": "Example review",
  "headerSubtitle": "Draft experience",
  "showDesignLibrary": true,
  "sidebar": { "collapsible": true, "scope": "First journey" }
}
```

`defaultView` accepts `overview`, `screens`, `map`, or `library`, falling back to Screens when the requested view is hidden. Optional `appearance: "light"` or `"dark"` fixes only the Studio appearance and hides its switch. Omit it to allow switching. Optional `icon: "./apps/icon.svg"` displays a local workspace icon; include the asset in the instance and export inventories. `headerTitle` and `headerSubtitle` affect the workspace heading, while `studioName` names the workspace. Supported settings survive import and export. Unknown settings are rejected so configuration mistakes are visible.

## Preview on a phone

```sh
npm run dev:phone
npm run check:phone
```

Phone preview is opt-in and binds one private LAN address. The terminal prints the phone URL and a local `/phone` QR page. Open that page on this computer and scan it from a phone on the same trusted network. QR generation runs locally; it does not send the preview address to a service. Optional `--host <assigned-private-IPv4>` selects an interface; `--port 0` chooses an available port. Stop the command to end access. The server does not add authentication or a public tunnel.

Phone mode serves only the browser runtime, sanitized configuration, and selected browser content inventory. It rejects source docs, tools, editor files, hidden paths, and symlinks. In the master, `config.previewFiles` is the explicit example-content inventory. Generated clients use `instance.exportFiles` when present, otherwise their shareable `instance.files`. Default `npm run dev` remains loopback-only.

## The app contract

Each app module exports one object. Keep screen markup and product behavior here; keep general studio behavior in `app/studio.js` (or `studio.js` in a generated client).

- **`identity`**: `id`, `name`, `tagline`, `description`, `version`.
- **`overview`**, optional: `{ eyebrow, title, description, rationale, approachTitle, strategies, reference }`. `strategies` is a list of hypothesis strings; only `**bold**` is formatted, with all HTML escaped. `reference` is `{ label, url }` with an HTTP(S) URL. Overview appears only when `studio.showOverview` is true. Keep hypotheses distinct from verified findings.
- **`tokens`**: palettes with `background`, `surface`, `ink`, `muted`, `border`, `accent`, `accentSoft`, `onAccent`, and `danger` for every supported appearance. The runtime applies these to editable app UI.
- **`appearances`**, optional: supported modes, defaulting to `['light', 'dark']`. A single mode hides the app appearance selector. Do not invent a dark screenshot variant when none was supplied.
- **`presentation`**, optional: `{ width, height, edgeToEdge }`, defaulting to a 360 × 740 phone. `edgeToEdge: true` renders the screen across the entire canvas without the studio’s status bar, content inset, home indicator, or overlay wrapper. Use the source aspect ratio for full screenshot frames. **`previewLabel`** optionally changes the focused preview caption.
- **`library`**, optional: app-owned, static Design library specimens. `typography` entries use `{ name, sample, fontFamily, fontSize, fontWeight?, fontStyle?, description? }` or `{ name, description?, render(state) }` for source crops. `components` entries use `{ id, name, description?, render(state) }`. Renderers return HTML without changing state. `paletteNote` can label sampled colors as approximate. Use screen cards to test interactions.
- **`freshState()`**: returns a new object containing `route`, `overlay`, `toast`, and your product state.
- **`SCREENS`**: route names mapped to pure functions receiving state and returning HTML. Normally render an `.app-screen` root inside the supplied phone frame. An edge-to-edge app owns the complete canvas.
- **`handlers`**: action names mapped to functions that receive `ctx` and an optional payload.
- **`ACTIONS`**: each action’s label, description, and optional destination route `to`.
- **`OVERLAYS`**: named renderers for modal dialogs and sheets.
- **`overlayContext`**, optional: metadata keyed by overlay name, with `{ title, kind, how, actions, approach?, rationale?, notes? }`. It replaces the focused context while that overlay is open. Optional pure `resolve(state)` returns partial context for the active panel. The summary follows the currently visible panel rather than inheriting another screen’s explanation. A panel can use `data-overlay-view="stable-panel-name"` for nested focus restoration.
- **`dismissOverlay(ctx)`**, optional: handles Back/Escape/dismiss inside a nested overlay. Return `true` when handled; otherwise the runtime closes the overlay. Use `ctx.overlay(null)` to close it.
- **`NAV`**: named boards containing state cards and their context.
- **`FLOWS`**: named journeys as ordered card references; a step’s `label` describes its transition to the next step or its final action.
- **`onEnter(ctx)`**, optional: starts simulated asynchronous work for an entered state.
- **`backRoute`**, optional: route-to-route fallback map used by Back when a card is opened directly without navigation history. Otherwise Back falls back to the initial route.

Handlers can read `ctx.state` and call `ctx.set(patch)`, `ctx.go(route, patch)`, `ctx.back()`, `ctx.overlay(nameOrNull)`, `ctx.toast(message, duration)`, `ctx.later(milliseconds, callback)`, `ctx.advance(milliseconds, callback)`, or `ctx.action(name, payload)`. Use `ctx.go(route, patch, { replace: true })` to replace an ordinary navigation step without adding route history.

Use `ctx.advance` for the automatic completion of a distinct loading or saving card. Its callback synchronously applies the completed state with `ctx.set`, `ctx.go`, or both. The runtime plays that transition once per loading card per open prototype and keeps one precompletion snapshot for Back and Reset, even when the callback uses `replace: true`. Use `ctx.later` for incidental timed updates that should not create loading checkpoints; toast expiry is managed separately. Both timer methods cancel pending work on navigation, reset, or close. Do not use unmanaged timers.

Timers started inside an overlay also end when that overlay closes or is replaced. A screen timer can continue while an overlay is open. Keep renderers and context resolvers pure. For intentionally unbuilt features, give informative feedback such as “This outcome is not built yet. Use Back to explore the draft; nothing is saved.” Describe the limit and the useful next action instead of simulating a false success. Daylight demonstrates managed loading and saving; the Future template demonstrates scope feedback.

The viewer preserves scroll and form focus on same-screen updates, including caret selection. Use `data-field` for state-bound inputs and stable names for other form fields. Give multiple `.app-scroll` regions stable `data-scroll-key` values or IDs. Navigating to another card resets its scroll. Standard ARIA menus and horizontal tablists support their arrow keys without moving between cards; overlays trap focus and restore it to the opener.

Use `data-action="action-name"` on buttons and `data-submit="action-name"` on forms. Inputs with `data-field="stateProperty"` bind directly to that top-level state property. The runtime supplies `back`, `dismiss-overlay`, and `dismiss-toast` actions. Escape dynamic text before putting it into HTML; never inject user text as markup.

### Add a route or flow

1. Add a renderer to `SCREENS` and any needed initial fields to `freshState()`.
2. Add a handler and an `ACTIONS` description. Set `to` when it navigates to another route.
3. Put a corresponding `data-action` button or `data-submit` form in the source screen.
4. Add a card to `NAV`, then reference its ID in `FLOWS`. Use real action labels for the connections.
5. Run the checks and tap through the journey. Update its context in the same edit.

### Add a state

A route can have many cards: ready, loading, empty, error, success, dialog, sheet, or toast. Each card declares `id`, `title`, `route`, `kind`, `status`, `setup(state)`, `match(state)`, `how`, and an `actions` array.

Put a two-line summary at the top of the detail panel: `approach` is one short sentence describing the screen’s design approach, then `rationale` is one short sentence explaining why. Entry context and available interactions follow. Text can wrap naturally on narrow screens; do not truncate it to force two physical lines. Legacy `rationale` arrays and `notes` arrays still work.

```js
approach: 'Collect a name, duration, and category in one form.',
rationale: 'Make a small intention concrete without a long setup.'
```

`setup` receives fresh state with the card’s route already applied and produces its screenshot state. `match` selects context during live use; make it specific enough to distinguish variants. Loading, overlays, or success need distinct context when their available actions differ. Only document implemented behavior.

### Use routes as precise references

The visible `/create` or `/home` label names a `SCREENS` key, not a separate web URL. Use short, stable task names such as `plan-create` or `plan-detail`. Add an app prefix only when it helps disambiguate. Avoid names tied to temporary headlines or layout choices.

Use the route when discussing the whole screen, and the unique card ID when specifying a state: “On `/create`, adjust the save action” or “On `create-invalid`, clarify the error.” Card IDs power Flow map references and `?card=...` links. Changing display copy should not change either identifier; if a route changes, update handlers, back routes, card context, and flows together. Link to the card when sharing an exact state for review.

### Change the look

Update app-owned tokens and registered stylesheets, keeping each supported appearance readable. Keep Design library specimens consistent with the actual screens. Screenshot references retain their source proportions and pixels. Use sampled values only when clearly labeled as approximate. Change `app/studio.css` (or `studio.css` in a generated client) only for the surrounding Studio interface.

## Validate before handing off

Run `npm run check` and `npm run build` in the master, then inspect affected screens and interactions in a browser. Generated clients use `npm run check` and `npm run export-share`. Exercise Back, Reset, forms, overlays, timer cancellation, keyboard navigation, supported appearances, and a narrow viewport. Compare Existing source frames to their assets. Check that map labels and context reflect working transitions. Scripted checks do not replace visual review; report when browser verification is unavailable.

This is a prototype and evidence-review workspace, not a production integration. Captured claims are source evidence; proposed copy is a design choice, not a verified product promise.
