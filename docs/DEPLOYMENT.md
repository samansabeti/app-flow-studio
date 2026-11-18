# Deployment

## Status

Not deployed. No hosting is connected to this repository; development happens on localhost. The rest of this file describes how the fictional-example site is built and published once hosting is connected and publication is authorized.

## How hosting works

Vercel checks out the repository, runs `npm run build` from its root, and publishes only `dist/`. The current public inventory is `index.html`, `studio.js`, `studio.css`, `app.css`, `ui.js`, sanitized `config.js`, `apps/daylight.js`, and `apps/blank.js`. Copy and screen notes embedded in those browser files are public.

Git integration gives Vercel access to tracked source and documentation for building. That access is separate from public website access: documentation, local tooling, Git metadata, and hosting configuration are outside `dist/` and must not be served. Keep secrets and private notes outside the repository.


## Local source and public output

Edit browser code under `app/`. Keep shareable project context under `docs/`. Run:

```sh
npm run build
```

The build validates the app and creates `dist/` from an explicit browser-file inventory. It removes local inventory metadata from the browser configuration and checks the resulting files. It adds no framework or installed dependencies. `dist/` is generated output and is ignored by Git; do not edit it by hand.

The build replaces only its own unchanged output: if `dist/` was edited or created by hand, it stops so those files can be preserved. Ownership records live in ignored `.app-flow-exports/`. `npm run check:build` tests output isolation, repeat builds, and overwrite protection with temporary fictional fixtures. `package.json` declares `appFlow.browserRoot: "app"` so the tools find browser files in the master; generated instances omit it and keep their flat layout.

The root `vercel.json` and Vercel project settings specify the build configuration below. Local builds and commits do not publish; pushing the production branch triggers a Vercel build. With automatic production-domain assignment enabled, successful production builds update the live URL.

## Vercel settings

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (`.`) |
| Framework Preset | Other |
| Install Command | Empty override |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node version | `24.x` |
| Production branch | `main` |

The root directory tells Vercel where to run commands, including tools in `scripts/`. The output directory limits the static files visitors can download. Only the reviewed contents of `dist/` should be served.

## Publishing and verification

1. Run `npm run build` and inspect `dist/`. Review affected screens in the local browser and review the Git diff.
2. Commit the intended changes, then push `main` when publication is authorized. Watch the Git-triggered deployment in Vercel.
3. Confirm the deployment reaches `READY`, references the pushed commit, and uses `npm run build` with output directory `dist`.
4. Compare all eight hosted browser files with the local build. Confirm context paths such as `/AGENTS.md`, `/docs/KICKOFF.md`, `/package.json`, `/server.mjs`, `/.env`, and `/.git/config` return 404. Inspect the hosted interface as well.



## Git, privacy, and publishing

- A **commit** saves a named snapshot in local Git history.
- A **push** uploads committed history to GitHub. Repository visibility controls who can read that history; treat this repository as public.
- A **deployment** publishes a built snapshot to a hosting service. Once Git integration is enabled, a push can trigger this step automatically.

Commit browser source, reviewed documentation, tools, templates, and safe configuration. Do not commit actual `.env` files, tokens, passwords, private keys, credentials, private notes, or raw chat exports. Keep sensitive working material outside this repository. A placeholder-only `.env.example` may be committed when useful.

`.gitignore` prevents matching untracked files from being added normally. It does not remove already tracked files or erase earlier commits. Review history before the first push; exposed credentials must be revoked or rotated, even if the file is later removed. Never put secrets in browser JavaScript or public build output. Repository visibility and site visibility are separate: a deployed site is public even while the repository is private.

Before publishing, validate the app, inspect the output inventory, test the deployed interface, and confirm that documentation, tools, secrets, and Git metadata cannot be fetched anonymously. Generated clients use their own `npm run export-share` and `npm run share` workflow and require a separately reviewed audience; see [SHARING.md](SHARING.md).
