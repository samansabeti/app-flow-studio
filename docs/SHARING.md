# Sharing a client instance

Exporting, local hosting, and phone preview are local. Publishing is a separate step that needs explicit authorization of the destination and audience. Hosting of this repository's own example site is in [DEPLOYMENT.md](DEPLOYMENT.md).

## Export (local, not publishing)

In the instance folder:

```sh
npm run check
npm run export-share            # writes dist/
npm run export-share -- --out review-dist
```

The export writes a static bundle into a new child folder of the instance (default `dist/`): only the browser runtime, sanitized configuration, and the explicit content inventory. Documentation, tools, `.codex`, Git files, environment files, `instance.json`, and source manifests are excluded. Nothing is uploaded and no one gets access.

- `instance.json.files` is the full local content inventory. Optional `exportFiles` is the subset for export and phone preview; it must keep every active module, stylesheet, branding icon, required asset, and third-party license file. Statically imported and literal asset paths are checked; computed filenames need a manual inventory check.
- The exporter only replaces its own unchanged earlier output; it refuses an unowned or hand-edited folder (export to a new `--out` instead). Re-export after every edit and keep the bundle unchanged until it is uploaded.
- Every screen keeps its `?app=…&state=…&card=…` link.

## View the export locally

The bundle uses JavaScript modules, so open it through a local web server, not by double-clicking `index.html`. From the instance folder, either:

```sh
cd dist && python3 -m http.server 8080 --bind 127.0.0.1
# then open http://127.0.0.1:8080
```

```sh
npx serve dist -l tcp://127.0.0.1:3000
# downloads the serve package from npm on first use
```

Bind to `127.0.0.1` as shown; without it both tools listen on every network interface, which exposes the bundle to the local network. Stop the server with Ctrl+C. Local hosting is still not publishing.

## Phone preview

```sh
npm run dev:phone
npm run check:phone
```

Opt-in and bound to one private LAN address. The terminal prints the phone URL and a local `/phone` QR page (generated locally). Use only on a trusted network and stop it when done. It serves only the runtime, sanitized configuration, and selected content inventory (`exportFiles`, else `files`; `config.previewFiles` in the master), and rejects docs, tools, hidden paths, and symlinks. `--host <private-IPv4>` picks an interface; `--port 0` a free port. Plain `npm run dev` stays loopback-only.

## Publish (needs authorization)

Before choosing an audience, review every included screenshot and string: captured accounts, conversations, and filenames may be sensitive. An unlisted public URL is still public. Use access control for private client review. No tool sends invitations.

```sh
npm run share -- --project <vercel-project> [--scope <team>] [--password]
```

`share` runs the checks, exports, stages a clean copy of the bundle outside the project, prints the project and audience, asks you to type the project name, then deploys to Vercel production. Project and scope are saved in `instance.json.hosting`, so later runs need only `npm run share`. `--dry-run` stops before deploying; `--yes` skips the prompt once publication is authorized.

Without `--password` the link is public. With it, the bundle includes a small Vercel middleware that asks for a password (any username). Set it once with `vercel env add SHARE_PASSWORD production`; `share` refuses to deploy while it is missing, and the middleware refuses everyone if it is later removed. After the first protected share, open the URL in a private window and confirm the prompt before sending it.

Agents run `npm run share` only with explicit authorization naming the project and audience.
