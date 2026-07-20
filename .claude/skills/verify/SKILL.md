---
name: verify
description: Build, run and drive this Next.js tracker app to observe a change working end-to-end.
---

# Verifying changes in the tracker app

Next.js 16 (Turbopack) + MariaDB. Pages are client components that fetch
data after mount, so **curling the HTML proves nothing** — server-rendered
markup does not contain the table, the toolbar, or any custom-field UI.
Drive a real browser.

## Launch

```bash
npm run dev -- --port 3947     # background it; ready in ~1s
```

Wait for `✓ Ready in` in the output before driving. Use a non-default port
so you don't collide with a dev server the user already has running.

The app reads live data from MariaDB (`.env.local`) — no seeding needed to
verify; `/api/all-projects/sync` returns 5 sheets / 226 rows.

## Browser driver

Not a project dependency. Install into the scratchpad, never into the repo:

```bash
cd "$SCRATCHPAD" && npm init -y && npm i playwright && npx playwright install chromium
```

### Selector gotcha

Sheet tab buttons render the name and a count badge in separate elements, so
the accessible name is **not** `"Wordpress158"` — `getByRole('button', {name})`
times out. Match on text content instead:

```js
page.locator('button', { hasText: /^Wordpress\d+$/ }).first()
```

Always wait for `page.waitForSelector('table')` after `goto` — the table only
appears once the client-side fetch resolves.

## Surfaces worth driving

| Area | How |
|---|---|
| Data tables | `/all-projects` (own inline table), `/projects`, `/live-projects`, `/priority-list`, `/marketing` (all `SheetSyncPanel`) |
| Custom fields API | `/api/custom-fields/<pageKey>` — GET `?sheet=`, POST `{sheetName,label}`, PATCH `{fieldId,rowKey,value}`, DELETE `?id=` |

Valid page keys live in `src/lib/sheetSync.ts` (`PAGE_SHEET_IDS`); an unknown
key returns 404 by design.

Custom columns render to the **right of all base columns** — on wide sheets
they are off-screen. Scroll the table container fully right before screenshotting:

```js
await page.evaluate(() => {
  const d = [...document.querySelectorAll('div')]
    .find(x => x.scrollWidth > x.clientWidth + 100 && x.querySelector('table'));
  if (d) d.scrollLeft = d.scrollWidth;
});
```

## Clean up after yourself

Custom fields written during verification persist to the shared database.
Delete every field you created:

```bash
curl -s -X DELETE "http://localhost:3947/api/custom-fields/all-projects?id=<id>"
```

Values cascade-delete with the field. Confirm with a final GET returning
`{"fields":[],"values":[]}`.

## Shell note

Git Bash mangles non-ASCII in `-d '...'` arguments — a `·` arrives as U+FFFD
and looks like a charset bug in the app. To test UTF-8, write the body to a
file and use `--data-binary @body.json`. UTF-8 round-trips correctly.
