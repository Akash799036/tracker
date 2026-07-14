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
