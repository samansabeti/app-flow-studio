# Getting started

Your first audit in about 15 minutes. No coding experience needed: you will copy a few commands into the Terminal. Built and tested on macOS. The core tool is plain Node.js and should run on Windows and Linux too. A few extras need a Mac: turning screen recordings into screenshots, blurring private details, and converting iPhone HEIC photos (use PNG or JPEG elsewhere).

## 1. Install Node.js

Download the LTS version from [nodejs.org](https://nodejs.org) and install it. That's the only thing App Flow Studio needs: there are no other packages to install.

To check it worked, open **Terminal** (Mac) or **PowerShell** (Windows) and type:

```sh
node --version
```

Any version from 18 up is fine.

## 2. Get App Flow Studio

Pick one:

- **Download:** on the GitHub page, click **Code → Download ZIP**, then unzip it into a folder such as `Documents/app-flow-studio`.
- **Your own copy on GitHub:** click **Use this template** to keep your audits under version control.
- **Git:** `git clone https://github.com/samansabeti/app-flow-studio.git`

Then move into the folder in the Terminal (drag the folder onto the Terminal window after typing `cd `):

```sh
cd path/to/app-flow-studio
npm run dev
```

Open the printed address (usually http://127.0.0.1:8002) to explore the example app. Press `Ctrl+C` in the Terminal to stop.

## 3. Create your audit

Each audit is its own folder, separate from App Flow Studio itself, so your screenshots and findings never mix with the tool. From the App Flow Studio folder:

```sh
npm run create-instance -- ../acme-app-flow --name "Acme App Flow" --app-name "Acme"
```

Replace `acme` and `Acme` with the app you are auditing. This creates `acme-app-flow` next to App Flow Studio.

## 4. Add screenshots

Make a captures folder next to your audit (not inside it), with one folder per journey, numbered in order:

```text
acme-captures/
  01-signing-up/       01-welcome.png, 02-email.png, ...
  02-first-task/
  03-managing-settings/
```

Name the screenshots in the order they happen. The three example journeys are just placeholders: use your own names and rename them in `apps/findings.js` later.

## 5. Import and open

```sh
cd ../acme-app-flow
CAPTURES_DIR=../acme-captures npm run import-captures
npm run dev
```

On Windows PowerShell, run `$env:CAPTURES_DIR="../acme-captures"` first, then `npm run import-captures`.

Your screenshots now appear in **Screens** and the **Flow map**, grouped into journeys. Add more screenshots later and run the import again: it only adds the new ones.

To skip `CAPTURES_DIR` every time, add `"capturesDir": "../acme-captures"` to `instance.json`.

## 6. Finish the audit

The import makes a first draft. To finish it, edit the plain JavaScript files in `apps/`, or ask an AI coding assistant to do it:

- **Hotspots** (`apps/existing.js`): name each screen and say where each button leads, so the screenshots click through like the real app.
- **Findings** (`apps/findings.js`): each problem, how severe it is, which screenshots prove it, and what to do about it. Findings appear in their own view, with a **Present** mode for walking stakeholders through them.
- **Future concepts** (`apps/future.js`): proposed screens shown beside the evidence, with an Existing / Future toggle.

Run `npm run check` after editing: it points out broken links between screens, missing evidence, and typos in IDs.

## 7. Share

`npm run export-share` creates a folder of static files you can open or host anywhere. See [SHARING.md](SHARING.md).

## More

- [AUDIT-WORKFLOW.md](AUDIT-WORKFLOW.md): the full workflow, including screen recordings and redaction
- [APP-MODULES.md](APP-MODULES.md): every field in the app files
