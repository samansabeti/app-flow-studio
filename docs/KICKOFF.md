# Start a client app flow

Create a new instance from the product folder:

```sh
npm run create-instance -- ../client-app-flow --name "Client App Flow" --app-name "Client" --port 8004
```

Add the generated folder as a local Codex project. Start a chat inside that project and use the brief below. Work in the client copy; preserve the master.

The master stores browser source in `app/` and guidance in `docs/`. Generated clients keep the flat layout described below: their `config.js`, runtime, and kickoff file are at the client root. Read the client’s own instructions when working there.

## Kickoff brief

Build **[app name] App Flow** in this instance. Read `AGENTS.md`, `README.md`, `config.js`, `instance.json`, and both app modules before editing.

**Audience:** [Who will review this, and what decision should it help them make?]

**Existing evidence:** [Screenshots, captures, or observed behavior. Identify gaps.]

**Journeys:** [Entry point → important choices → outcome.]

**Future proposal:** [What changes, why, and what remains unresolved?]

**Overview:** [The decision to make, clearly labeled hypotheses, and an optional reference URL.]

**Design references:** [Provided visual system, tokens, fonts, and examples.]

**Required states:** [Ready, empty, loading, error, success, dialogs, or sheets that matter.]

**Sharing audience:** [Private reviewers or public. Do not assume screenshots are cleared for public sharing.]

For Existing, use source-specific frames and concise screen names. Preserve their aspect ratio and native chrome. Distinguish observed behavior, user-confirmed transitions, and local prototype links. Do not fabricate missing production screens or audit findings.

For Future, build editable proposed screens and flows in its separate module. Keep Screens, Flow map, and Design library aligned. Keep all real service operations simulated unless separately authorized. Every visible control must work or explain the missing outcome.

Use plain HTML/CSS/JS and the existing module contract. Keep client styling and tokens in the app; keep the Studio shell minimal. Keep loading and saving as separate cards, using `ctx.advance()` to complete each once per open prototype. Reset/R and Back restore loading for inspection; close and reopen to replay. Use managed `ctx.later()` for incidental timed updates. Update `instance.json` whenever adding an exported module or asset.

Configure optional Overview, workspace heading, icon, sidebar, appearance, and Design library visibility in `config.js`. Put overview copy in each app module. Keep `files` as the full local inventory; use optional `exportFiles` to select the review bundle while retaining all active modules and their dependencies. For unbuilt features, explain the limit and the next useful action.

For each screen or overlay, write one short `approach` sentence and one short `rationale` sentence. They appear first in the detail panel, followed by entry context and interactions. Give routes stable task-based names and use card IDs to distinguish loading, error, and other states. Use those identifiers in change requests instead of ambiguous references to “this screen.”

Run remains loopback-only. Use Phone preview explicitly when testing on a phone on the same trusted network; its QR page is generated locally. Stop it when finished.

Run checks and inspect the affected flows in a browser. Report the actual preview URL and any unverified behavior. Export only after checking its contents. Publishing and inviting reviewers require the user's intended audience to be clear.
