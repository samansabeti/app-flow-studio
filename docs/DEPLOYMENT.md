# Deployment

## Current live site

[App Flow Studio](https://app-flow-studio.vercel.app) is the public site for fictional examples. The existing Vercel project `samansabetis-projects/app-flow-studio` is connected to the private GitHub repository [samansabeti/app-flow-studio](https://github.com/samansabeti/app-flow-studio), with `main` as its production branch.

Vercel checks out the repository, runs `npm run build` from its root, and publishes only `dist/`. The current public inventory is `index.html`, `studio.js`, `studio.css`, `app.css`, `ui.js`, sanitized `config.js`, `apps/daylight.js`, and `apps/blank.js`. Copy and screen notes embedded in those browser files are public.

Git integration gives Vercel access to tracked source and documentation for building. That access is separate from public website access: documentation, local tooling, Git metadata, and hosting configuration are outside `dist/` and must not be served. Keep secrets and private notes outside the repository.

Before Git integration, the site was uploaded with the Vercel CLI from a prepared package at `/private/tmp/app-flow-vercel-gkl9A7`. Deployment `dpl_62vfk4tA1PyWDnNPNaZivNCzDJbg` is the pre-migration production snapshot and rollback reference. Keep the same Vercel project and domain.

## Local source and public output

Edit browser code under `app/`. Keep shareable project context under `docs/`. Run:

```sh
npm run build
```

The build validates the app and creates `dist/` from an explicit browser-file inventory. It removes local inventory metadata from the browser configuration and checks the resulting files. It adds no framework or installed dependencies. `dist/` is generated output and is ignored by Git; do not edit it by hand.

The root `vercel.json` and Vercel project settings specify the build configuration below. Local builds and commits do not publish; pushing the production branch triggers a Vercel build. With automatic production-domain assignment enabled, successful production builds update the live URL.

## Vercel settings

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

## Publishing and verification

1. Run `npm run build` and inspect `dist/`. Review affected screens in the local browser and review the Git diff.
2. Commit the intended changes, then push `main` when publication is authorized. Watch the new Git-triggered deployment in the existing Vercel project.
3. Confirm the deployment reaches `READY`, references the pushed commit, and uses `npm run build` with output directory `dist`.
4. Compare all eight hosted browser files with the local build. Confirm context paths such as `/AGENTS.md`, `/docs/KICKOFF.md`, `/package.json`, `/server.mjs`, `/.env`, and `/.git/config` return 404. Inspect the hosted interface as well.

During the initial migration, hold automatic production-domain assignment until the first Git build is verified, then promote that production deployment and verify automatic assignment is enabled for future pushes. Preview protection can remain enabled; authenticated checks can use `vercel curl` without making the preview public.

To restore the pre-migration snapshot when explicitly requested, run `vercel rollback dpl_62vfk4tA1PyWDnNPNaZivNCzDJbg --scope samansabetis-projects`. Rollback pauses automatic production-domain assignment; verify the restored site and deliberately restore automatic assignment when ready to resume releases.

## Git, privacy, and publishing

- A **commit** saves a named snapshot in local Git history.
- A **push** uploads committed history to GitHub. Private repository access controls who can read that history.
- A **deployment** publishes a built snapshot to a hosting service. Once Git integration is enabled, a push can trigger this step automatically.

Commit browser source, reviewed documentation, tools, templates, and safe configuration. Do not commit actual `.env` files, tokens, passwords, private keys, credentials, private notes, or raw chat exports. Keep sensitive working material outside this repository. A placeholder-only `.env.example` may be committed when useful.

`.gitignore` prevents matching untracked files from being added normally. It does not remove already tracked files or erase earlier commits. Review history before the first push; exposed credentials must be revoked or rotated, even if the file is later removed. Never put secrets in browser JavaScript or public build output. A private GitHub repository does not make `app-flow-studio.vercel.app` private.

Before publishing, validate the app, inspect the output inventory, test the deployed interface, and confirm that documentation, tools, secrets, and Git metadata cannot be fetched anonymously. Generated clients use their own `npm run export-share` workflow and require a separately reviewed audience.
