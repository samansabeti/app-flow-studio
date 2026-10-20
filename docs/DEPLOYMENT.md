# Deployment

## Current live site

[App Flow Studio](https://app-flow-studio.vercel.app) is a public snapshot of fictional examples. The October 20, 2026 deployment was uploaded with the Vercel CLI from a prepared package at `/private/tmp/app-flow-vercel-gkl9A7`. It did not come from GitHub and did not upload the complete working folder.

The package contained `index.html`, `studio.js`, `studio.css`, `app.css`, `ui.js`, sanitized `config.js`, `apps/daylight.js`, `apps/blank.js`, and hosting configuration `vercel.json`. Vercel serves the eight browser files; the hosting configuration was not publicly retrievable. Project documentation, local tooling, environment files, and Git metadata were absent from the upload. Copy and screen notes embedded in browser JavaScript are public.

The existing project is `samansabetis-projects/app-flow-studio`. The verified deployment ID is `dpl_62vfk4tA1PyWDnNPNaZivNCzDJbg`. This record describes that snapshot; repeat the file and access checks after any later deployment.

## Local source and public output

Edit browser code under `app/`. Keep shareable project context under `docs/`. Run:

```sh
npm run build
```

The build validates the app and creates `dist/` from an explicit browser-file inventory. It removes local inventory metadata from the browser configuration and checks the resulting files. It adds no framework or installed dependencies. `dist/` is generated output and is ignored by Git; do not edit it by hand.

The root `vercel.json` describes the intended build configuration. GitHub integration and applying these settings to the existing Vercel project remain pending approval. Nothing about a local build or commit changes the current live snapshot.

## Intended Vercel settings

| Setting | Value |
| --- | --- |
| Project | Existing `samansabetis-projects/app-flow-studio` |
| Root Directory | Repository root (`.`) |
| Framework Preset | Other |
| Install Command | Empty override |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node version | `24.x` |
| Production branch | `main` |

The root directory tells Vercel where to run commands, including tools in `scripts/`. The output directory limits the static files visitors can download. Only the reviewed contents of `dist/` should be served. Keep the existing project and domain when connecting GitHub.

After separate approval, create and verify a private GitHub repository, push the reviewed commits, and connect that repository to the existing Vercel project. Before the first Git build, temporarily disable automatic production-domain assignment so the current site stays live during verification. Inspect the new deployment’s temporary URL and file inventory, then promote it after approval. Re-enable automatic domain assignment only when future pushes to `main` are intended to update the public site. Keep the previous deployment available for rollback.

## Git, privacy, and publishing

- A **commit** saves a named snapshot in local Git history.
- A **push** uploads committed history to GitHub. Private repository access controls who can read that history.
- A **deployment** publishes a built snapshot to a hosting service. Once Git integration is enabled, a push can trigger this step automatically.

Commit browser source, reviewed documentation, tools, templates, and safe configuration. Do not commit actual `.env` files, tokens, passwords, private keys, credentials, private notes, or raw chat exports. Keep sensitive working material outside this repository. A placeholder-only `.env.example` may be committed when useful.

`.gitignore` prevents matching untracked files from being added normally. It does not remove already tracked files or erase earlier commits. Review history before the first push; exposed credentials must be revoked or rotated, even if the file is later removed. Never put secrets in browser JavaScript or public build output. A private GitHub repository does not make `app-flow-studio.vercel.app` private.

Before publishing, validate the app, inspect the output inventory, test the deployed interface, and confirm that documentation, tools, secrets, and Git metadata cannot be fetched anonymously. Generated clients use their own `npm run export-share` workflow and require a separately reviewed audience.
