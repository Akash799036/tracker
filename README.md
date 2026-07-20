# Project Tracker — Next.js

Full React / Next.js 14 (App Router, TypeScript, Tailwind) port of the
original vanilla-JS Project Tracker. The legacy `*.html` entry files have
been removed; the remaining `js/` and `css/` folders are reference material.

## Run

```bash
cd nextjs
npm install
npm run dev
```

Open http://localhost:3000.

## Routes

| Route | Source page |
|---|---|
| `/` | Dashboard — stats, donut, monthly launches, manager workload, platform mix, recent, upcoming go-live, maintenance expiring |
| `/all-projects` | All projects table |
| `/live-projects` | Projects currently live |
| `/projects` | Ongoing projects (search + status filter, delete) |
| `/priority-list` | Launching in next 14 days or actively in flight |
| `/maintenance` | Projects with maintenance windows |
| `/marketing` | Marketing tasks (own data model, own storage key) |
| `/project?id=…` | Create / edit form |
| `/settings` | Export (JSON/CSV/XLSX), Import (JSON/XLSX/CSV), clear all |

## Data

- Single client-side store built on React Context + `localStorage`
  (`project-tracker.v1`). The Marketing page uses its own key
  (`project-tracker.marketing.v1`).
- Seed data auto-loads on first visit (`src/lib/seed.ts`) so you have
  something to look at immediately. Cleared via Settings → Danger Zone.
- Data is fully interoperable with the legacy vanilla app (same
  `localStorage` shape), so you can migrate a browser profile with no
  changes.

## Sheet data (MySQL)

The sheet-backed pages (`/all-projects`, `/projects`, `/live-projects`,
`/priority-list`, `/marketing`) do not use the localStorage store described
above. They read from MySQL, seeded from Google Sheets.

```bash
npm run migrate   # one-off: add stable row identity to an existing database
npm run seed      # pull every page's workbook into MySQL
```

**Run `npm run migrate` before the first `npm run seed` after upgrading.** It
adds `row_uid` and friends to `sheet_rows` and backfills them. The seeder
refuses to run without it, because it cannot match incoming rows to stored
ones and would give every row a fresh identity — orphaning per-row data.

### Row identity

Each row has a `row_uid` that survives a re-sync; custom field values point at
it. The seeder matches incoming rows to stored ones by natural key
(`scripts/lib/rowIdentity.mjs`), preferring a discovered identity column
(`Project Name`, `Url`, …) and otherwise hashing the row's contents.

A content-hashed row loses its identity if any cell changes upstream: its field
values orphan and it reads as a new row. Rows keyed off an identity column do
not have that problem. The seeder prints the split on every run:

```
• projects … OK — 6 tab(s), 136 rows (136 matched, 0 new, 0 removed)
  120 row(s) keyed by an identity column, 16 by content hash (churn if any cell changes)
```

If a page reports most rows as new on every seed, its sheets need a stable ID
or name column.

### Editing

- **Add row** appends a row with `origin='user'`. The seeder never deletes
  these — they do not exist upstream and would be destroyed on every sync.
- **Edit** on a synced row writes `cells_override`, which the sync preserves
  and reads merge over the synced values, so an edit is not lost at the next
  sync. Editing a value back to its original clears the override.
- **Delete** removes a user row outright (with its field values). A synced row
  is only hidden — deleting it would just bring it back at the next sync.
- **Add Field** adds a custom column to the whole sheet.

All of these write to the database, so they are shared: an edit one person
makes is an edit everyone sees.

### Tables

| Table | Holds |
|---|---|
| `sheet_tabs` | one row per (page, sheet tab): headers, position, synced-at |
| `sheet_rows` | the data; `row_uid` identity, `cells`, `cells_override`, `origin`, `hidden` |
| `custom_fields` / `custom_field_values` | sheet-wide extra columns, values keyed by `row_uid` |
| `row_extras` | retired — held the old per-row ad-hoc fields, keyed by `row_uid` |

The per-row "Row fields" feature was removed. `row_extras` is retained so its
existing data is not lost, but nothing writes to it: the seeder still sweeps
orphans, and deleting a user row still clears its leftovers. Drop the table
once you are sure the data is no longer wanted.

## Architecture

```
src/
  app/                     # Next.js routes (all client-rendered)
    layout.tsx             # root — StoreProvider + AppShell
    page.tsx               # Dashboard
    <route>/page.tsx       # each feature page
  components/
    AppShell.tsx           # sidebar + topbar wrapper
    Sidebar.tsx / Topbar.tsx
    Charts.tsx             # pure-SVG Donut / VBars / HBars
    ProjectTable.tsx       # shared searchable/paginated table
  lib/
    types.ts               # Project type + field / option constants
    store.tsx              # main projects store (Context + localStorage)
    marketing.tsx          # marketing tasks store
    seed.ts                # CSV-based initial data
    ui.ts                  # small helpers (initials, avatarStyle, fmtDate, …)
  styles/
    globals.css            # tailwind + legacy CSS import
    legacy.css             # copy of ../css/style.css
```

## What differs from the vanilla app

- `all-projects`, `live-projects`, `maintenance`, `priority-list` all read
  from the single main store rather than maintaining separate
  `*.imported.v1` silos — simpler, and the underlying data shape is the
  same. If you need the separate silos, add extra Context providers
  following the pattern in `lib/marketing.tsx`.
- The topbar Import/Export modal is replaced by dedicated buttons on
  `/settings`.
- Dashboard modal drill-downs (click a manager bar / month bar) aren't
  wired yet — the chart components already accept an `onBarClick` prop, so
  it's a small addition when you need it.
