import {
  SHEET_SYNC_STORAGE_KEY,
  type AllProjectsData,
  type SheetRow,
  type SheetSyncPageKey,
} from './sheetSync';
import { ALL_PROJECTS_STORAGE_KEY } from './allProjectsTypes';
import { classifyStatus, type StatusCounts } from './projectStatus';

export type DashboardSourceKey =
  | 'all-projects'
  | 'live-projects'
  | 'projects'
  | 'priority-list'
  | 'marketing'
  | 'dashboard';

export type DashboardSource = {
  key: DashboardSourceKey;
  label: string;
  href: string;
  /** page_key to fetch from /api/sheet-sync/:page. */
  page: SheetSyncPageKey;
  storageKey: string;
};

export const DASHBOARD_SOURCES: DashboardSource[] = [
  { key: 'all-projects',  label: 'All Projects',      href: '/all-projects',  page: 'all-projects',  storageKey: ALL_PROJECTS_STORAGE_KEY },
  { key: 'live-projects', label: 'Live Projects',     href: '/live-projects', page: 'live-projects', storageKey: SHEET_SYNC_STORAGE_KEY('live-projects' as SheetSyncPageKey) },
  { key: 'projects',      label: 'Ongoing Projects',  href: '/projects',      page: 'projects',      storageKey: SHEET_SYNC_STORAGE_KEY('projects' as SheetSyncPageKey) },
  { key: 'priority-list', label: 'Priority Projects', href: '/priority-list', page: 'priority-list', storageKey: SHEET_SYNC_STORAGE_KEY('priority-list' as SheetSyncPageKey) },
  { key: 'marketing',     label: 'Marketing Projects',href: '/marketing',     page: 'marketing',     storageKey: SHEET_SYNC_STORAGE_KEY('marketing' as SheetSyncPageKey) },
];

/**
 * The `dashboard` workbook holds the cleanest per-category PM data (Wordpress,
 * Shopify, Custom, NextNode) but has no page of its own to link to, so it feeds
 * the category/PM grouping without appearing in Pages or Sync activity.
 */
export const CATEGORY_SOURCES: DashboardSource[] = [
  ...DASHBOARD_SOURCES,
  { key: 'dashboard', label: 'Project Categories', href: '/all-projects', page: 'dashboard', storageKey: SHEET_SYNC_STORAGE_KEY('dashboard' as SheetSyncPageKey) },
];

export type PageSummary = {
  source: DashboardSource;
  data: AllProjectsData | null;
  totalRows: number;
  syncedAt: number | null;
  sheetCount: number;
};

function readCache(key: string): AllProjectsData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AllProjectsData) : null;
  } catch { return null; }
}

function totalRows(data: AllProjectsData | null): number {
  if (!data) return 0;
  return data.sheets.reduce((s, sh) => s + sh.rows.length, 0);
}

export function readAllSummaries(sources: DashboardSource[] = DASHBOARD_SOURCES): PageSummary[] {
  return sources.map(source => {
    const data = readCache(source.storageKey);
    return {
      source,
      data,
      totalRows: totalRows(data),
      syncedAt: data?.syncedAt ?? null,
      sheetCount: data?.sheets.length ?? 0,
    };
  });
}

/**
 * The dashboard used to read localStorage only, so it showed zeros until the
 * user had visited every page. Pull each page straight from the database and
 * seed the same cache the individual pages use.
 */
export async function hydrateFromServer(): Promise<void> {
  await Promise.all(
    CATEGORY_SOURCES.map(async source => {
      try {
        const res = await fetch(`/api/sheet-sync/${source.page}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as AllProjectsData;
        if (!data || !Array.isArray(data.sheets)) return;
        localStorage.setItem(source.storageKey, JSON.stringify(data));
      } catch { /* offline or route down — fall back to whatever is cached */ }
    })
  );
}

const STATUS_KEYS = ['status', 'project status', 'current status', 'stage'];
const PLATFORM_KEYS = ['platform', 'technology', 'tech', 'stack', 'type'];

// Tabs that hold infrastructure/notes rather than projects. Declared here
// because the status aggregation below needs it too, and `const` does not hoist.
const NON_PROJECT_SHEETS = new Set([
  'servers',
  'sheet1',
  'sheet2',
  'sheet3',
  'work distribute',
  'monthly live project count',
  'ecommerce details',
]);

/**
 * Header names that look like a status column but describe something else.
 * 'SSL Status' is certificate health, not project state — matching it counted
 * 58 valid SSL certs as 58 in-progress projects. 'Upcoming Status' is a
 * next-steps worklog note, not the current state.
 */
const STATUS_KEY_BLOCKLIST = [/\bssl\b/, /\bupcoming\b/, /\bdomain\b/, /\bhosting\b/, /\bpayment\b/];

function findKey(row: SheetRow, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const hit = keys.find(k => k.trim().toLowerCase() === c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = keys.find(k => k.trim().toLowerCase().includes(c));
    if (hit) return hit;
  }
  return null;
}

/**
 * Locate the project-status column, ignoring headers that merely contain the
 * word 'status'. Unlike `findKey` this never falls back to a loose substring
 * match, because a wrong column here corrupts every KPI on the dashboard.
 */
function findStatusKey(row: SheetRow): string | null {
  const keys = Object.keys(row);
  const allowed = (k: string) => {
    const low = k.trim().toLowerCase();
    return !STATUS_KEY_BLOCKLIST.some(re => re.test(low));
  };
  for (const c of STATUS_KEYS) {
    const hit = keys.find(k => k.trim().toLowerCase() === c && allowed(k));
    if (hit) return hit;
  }
  return null;
}

function bumpCount(map: Map<string, number>, raw: unknown) {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return;
  map.set(s, (map.get(s) || 0) + 1);
}

export function aggregateColumn(summaries: PageSummary[], candidates: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (!sheet.rows.length) continue;
      const key = findKey(sheet.rows[0].cells, candidates);
      if (!key) continue;
      for (const row of sheet.rows) bumpCount(map, row.cells[key]);
    }
  }
  return map;
}

/**
 * Every project row that carries a real status column, deduped by uid.
 *
 * This is the single source of truth behind the KPI cards, so the filtering
 * has to match `aggregateByCategory` exactly (same non-project tabs skipped,
 * same hidden-row skip, same uid dedupe) or the cards will disagree with the
 * category totals directly beneath them.
 */
export function collectStatusRows(summaries: PageSummary[]): { uid: string; status: unknown }[] {
  const out: { uid: string; status: unknown }[] = [];
  // The 'dashboard' and 'all-projects' source keys point at the same workbook,
  // so its rows arrive twice. Row uids are globally unique — keep first sighting.
  const seen = new Set<string>();

  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (!sheet.rows.length) continue;
      if (NON_PROJECT_SHEETS.has(sheet.name.trim().toLowerCase())) continue;

      // Scan every row for the header, not just row 0: a sheet whose first row
      // happens to omit the status key would otherwise be skipped wholesale.
      let key: string | null = null;
      for (const row of sheet.rows) {
        key = findStatusKey(row.cells);
        if (key) break;
      }
      if (!key) continue;

      for (const row of sheet.rows) {
        if (row.hidden) continue;
        if (row.uid) {
          if (seen.has(row.uid)) continue;
          seen.add(row.uid);
        }
        out.push({ uid: row.uid, status: row.cells[key] });
      }
    }
  }
  return out;
}

export function aggregateStatus(summaries: PageSummary[]) {
  const map = new Map<string, number>();
  for (const { status } of collectStatusRows(summaries)) bumpCount(map, status);
  return map;
}

export function aggregatePlatform(summaries: PageSummary[]) {
  return aggregateColumn(summaries, PLATFORM_KEYS);
}

/* ---------------- PM grouping ---------------- */

// Spelled differently per workbook: 'Project Manager', 'PROJECT MANAGER', 'PM'.
const PM_KEYS = ['project manager', 'pm', 'manager'];

// The sheets carry dirty PM values — the same person is typed several ways
// ('Pinak Chaudhuri' / 'Pinak Choudhuri' / 'Pinak Chowdhury'), and some rows
// give only a first name. Canonicalising matters: without it one PM's projects
// split across three rows and every count is wrong.
export function normalizePM(raw: unknown): string | null {
  const s = raw == null ? '' : String(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  // A few cells name two people; treat them as their own bucket rather than
  // silently crediting the first.
  return s.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s*\/\s*/g, ' / ');
}

/**
 * Collapse surname spelling variants of the same first name. Indian surnames in
 * this data vary by transliteration (Chaudhuri/Choudhuri/Chowdhury) while the
 * first name is stable, so we key on first name + a vowel-stripped surname.
 */
function nameFingerprint(name: string): string {
  const parts = name.toLowerCase().split(' ').filter(Boolean);
  // Fuzzy first name so transposition typos ('Pniak') match 'Pinak'.
  const first = firstNameKey(name);
  const rest = parts.slice(1).join('');
  if (!rest) return first;
  // Drop vowels (w/y included — 'Chowdhury' vs 'Chaudhuri') and duplicate
  // consonants, and fold v→b, so ch(a|ou)dh(u|)r(i|y) collapses to one key.
  const skeleton = rest.replace(/v/g, 'b').replace(/[aeiouwy]/g, '').replace(/(.)\1+/g, '$1');
  return `${first}|${skeleton}`;
}

/** Fuzzy key for a bare first name, so 'Pniak' collapses onto 'Pinak'. */
function firstNameKey(name: string): string {
  const first = name.toLowerCase().split(' ')[0] ?? '';
  // Sort the letters: transposition typos ('Pniak' vs 'Pinak', 'Devjoti' vs
  // 'Debjoti' after b/v folding) produce the same multiset.
  return [...first.replace(/v/g, 'b')].sort().join('');
}

/**
 * Build one canonical display name per PM across every category. Must run
 * globally, not per category: a row that says only 'Sibam' in Custom has to
 * find 'Sibam Sinha' over in Wordpress, or one person lands on the
 * leaderboard twice.
 */
function buildPMCanonicalMap(names: Iterable<string>): Map<string, string> {
  // Materialise up front: this walks `names` twice, so a one-shot iterator
  // (map.keys(), a generator) would come up empty on the second pass and
  // silently return a map that folds nothing.
  const allNames = [...names];
  // Pass 1: group full names by first-name + vowel-stripped surname.
  const groups = new Map<string, string[]>();
  for (const name of allNames) {
    const fp = nameFingerprint(name);
    const list = groups.get(fp);
    if (list) list.push(name); else groups.set(fp, [name]);
  }
  // Longest spelling wins as the display name for each surname group.
  const display = new Map<string, string>();
  for (const [fp, names] of groups) {
    display.set(fp, names.reduce((a, b) => (b.length > a.length ? b : a)));
  }
  // Pass 2: map every bare first name onto the single full name that shares it.
  const fullByFirst = new Map<string, Set<string>>();
  for (const canon of display.values()) {
    if (!canon.includes(' ')) continue;
    const k = firstNameKey(canon);
    (fullByFirst.get(k) ?? fullByFirst.set(k, new Set()).get(k)!).add(canon);
  }
  const out = new Map<string, string>();
  for (const name of allNames) {
    let canon = display.get(nameFingerprint(name)) ?? name;
    if (!canon.includes(' ')) {
      const candidates = fullByFirst.get(firstNameKey(canon));
      // Only fold when it is unambiguous — two different Pritams stay apart.
      if (candidates?.size === 1) canon = [...candidates][0];
    }
    out.set(name, canon);
  }
  return out;
}

export type CategoryPM = {
  /** Sheet/tab name — the project category, e.g. 'Wordpress'. */
  category: string;
  /** Page this tab came from, for the deep link. */
  href: string;
  sourceLabel: string;
  total: number;
  /** PM with the most projects in this category. */
  lead: { name: string; count: number } | null;
  /** All PMs in this category, most projects first. */
  managers: { name: string; count: number }[];
  /** Rows in this category with no PM filled in. */
  unassigned: number;
};

export type PMSummary = {
  name: string;
  total: number;
  /** Per-category breakdown for this PM, most projects first. */
  categories: { category: string; count: number }[];
};

/**
 * Group every project row by its category (the sheet/tab name) and, within
 * that, by Project Manager. Rows whose tab has no PM column are skipped
 * entirely rather than counted as unassigned.
 */
export function aggregateByCategory(summaries: PageSummary[]): CategoryPM[] {
  const byCategory = new Map<string, CategoryPM & { counts: Map<string, number> }>();
  // 'dashboard' and 'all-projects' are the same workbook behind two source
  // keys, so each of its rows shows up twice. Row uids are globally unique —
  // count each only once or those categories report double their real size.
  const seenRows = new Set<string>();

  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (!sheet.rows.length) continue;
      if (NON_PROJECT_SHEETS.has(sheet.name.trim().toLowerCase())) continue;

      const pmKey = findKey(sheet.rows[0].cells, PM_KEYS);
      if (!pmKey) continue;

      const category = sheet.name.trim();
      let entry = byCategory.get(category.toLowerCase());
      if (!entry) {
        entry = {
          category,
          href: sum.source.href,
          sourceLabel: sum.source.label,
          total: 0,
          lead: null,
          managers: [],
          unassigned: 0,
          counts: new Map<string, number>(),
        };
        byCategory.set(category.toLowerCase(), entry);
      }

      for (const row of sheet.rows) {
        if (row.hidden) continue;
        if (seenRows.has(row.uid)) continue;
        seenRows.add(row.uid);
        entry.total += 1;
        const pm = normalizePM(row.cells[pmKey]);
        if (!pm) { entry.unassigned += 1; continue; }
        entry.counts.set(pm, (entry.counts.get(pm) || 0) + 1);
      }
    }
  }

  // Canonicalise across every category at once, then re-key each category's
  // counts through the shared map.
  const allNames = new Set<string>();
  for (const entry of byCategory.values()) {
    for (const name of entry.counts.keys()) allNames.add(name);
  }
  const canon = buildPMCanonicalMap(allNames);

  return [...byCategory.values()]
    .map(({ counts, ...rest }) => {
      const merged = new Map<string, number>();
      for (const [name, count] of counts) {
        const key = canon.get(name) ?? name;
        merged.set(key, (merged.get(key) ?? 0) + count);
      }
      const managers = [...merged.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return { ...rest, managers, lead: managers[0] ?? null };
    })
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Roll the per-category counts up into a per-PM view. */
export function aggregateByPM(categories: CategoryPM[]): PMSummary[] {
  const byPM = new Map<string, PMSummary>();
  for (const cat of categories) {
    for (const m of cat.managers) {
      let entry = byPM.get(m.name);
      if (!entry) {
        entry = { name: m.name, total: 0, categories: [] };
        byPM.set(m.name, entry);
      }
      entry.total += m.count;
      entry.categories.push({ category: cat.category, count: m.count });
    }
  }
  for (const entry of byPM.values()) {
    entry.categories.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }
  return [...byPM.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/* ---------------- PM project drill-down ---------------- */

export type PMProject = {
  /** Stable row identity, survives re-sync. */
  uid: string;
  /** Sheet/tab name — the project category. */
  category: string;
  /** Page this row lives on, for the deep link. */
  href: string;
  sourceLabel: string;
  /** Best-guess project title for the row. */
  title: string;
  /** Every column on the row, for the detail view. */
  cells: SheetRow;
  /** Column order as the sheet defines it, so details read like the table. */
  headers: string[];
  /**
   * Every tab this project was found on, deduped and in sighting order. One
   * project is commonly tracked on several tabs at once (a category tab plus
   * 'Live Projects' plus a maintenance tab); the modal shows one card and lists
   * these as its origins. Always contains at least the card's own category.
   */
  sources: { category: string; href: string; sourceLabel: string }[];
};

export type PMProjects = {
  name: string;
  total: number;
  projects: PMProject[];
};

// Header candidates for the row's display title, best first.
const NAME_KEYS = ['project name', 'project', 'name', 'client name', 'client', 'domain name', 'domain', 'website'];

/**
 * Identity of a project *as a user thinks of it*: its name. One project is
 * routinely tracked on several tabs at once — 'AC Nola' sits on
 * dashboard/Wordpress, projects/Live Projects and a maintenance tab — and each
 * copy carries different columns, so the rows are not byte-identical and no
 * uid or whole-row hash will fold them together. Keying on the title (within a
 * single PM) is what stops the modal listing the same project three times.
 *
 * Returns null for rows with no usable title; those are kept unmerged, since
 * collapsing every untitled row into one would hide real projects.
 */
function projectIdentity(title: string): string | null {
  const key = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return key && key !== 'untitled project' ? key : null;
}

/**
 * How much real content a row carries, used to decide which copy of a project
 * to keep. The tab with the most filled-in columns is the most informative one
 * to show, so the merged card is never worse than any copy it replaced.
 */
function rowWeight(cells: SheetRow): number {
  return Object.values(cells).filter(v => v != null && String(v).trim() !== '').length;
}

/**
 * Collapse rows that describe the same project onto one card, keeping the
 * best-populated copy and recording every tab it came from.
 *
 * Cells are merged rather than replaced: the copy on 'Live Projects' may hold a
 * live date the category tab lacks, so filling the winner's blanks from the
 * others loses no information the user could previously see.
 */
function mergeDuplicateProjects(projects: PMProject[]): PMProject[] {
  const byIdentity = new Map<string, PMProject>();
  const unmergeable: PMProject[] = [];

  for (const p of projects) {
    const id = projectIdentity(p.title);
    if (!id) { unmergeable.push(p); continue; }

    const kept = byIdentity.get(id);
    if (!kept) { byIdentity.set(id, p); continue; }

    // Keep whichever row carries more filled-in columns as the card's basis.
    const [winner, loser] = rowWeight(p.cells) > rowWeight(kept.cells) ? [p, kept] : [kept, p];
    const merged: PMProject = {
      ...winner,
      // Fill only the winner's empty columns — never overwrite a real value.
      cells: { ...loser.cells, ...pruneEmpty(winner.cells) },
      headers: winner.headers.length >= loser.headers.length ? winner.headers : loser.headers,
      sources: dedupeSources([...kept.sources, ...p.sources]),
    };
    byIdentity.set(id, merged);
  }

  return [...byIdentity.values(), ...unmergeable];
}

/** Drop blank cells so a spread of this can't blank out a populated column. */
function pruneEmpty(cells: SheetRow): SheetRow {
  const out: SheetRow = {};
  for (const [k, v] of Object.entries(cells)) {
    if (v != null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}

function dedupeSources(sources: PMProject['sources']): PMProject['sources'] {
  const seen = new Set<string>();
  return sources.filter(s => {
    const k = `${s.href}|${s.category.trim().toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Collect the actual project rows for every PM — the leaderboard keeps only
 * counts, but the drill-down modal needs the rows themselves.
 *
 * Mirrors `aggregateByCategory`'s filtering (same PM column lookup, same
 * non-project tabs skipped, same hidden-row skip) and re-uses one global
 * canonical map. Note `total` counts distinct projects after the cross-tab
 * merge below, so it can be lower than the leaderboard's raw row count — the
 * modal deliberately reports projects, not spreadsheet rows.
 */
export function collectProjectsByPM(summaries: PageSummary[]): Map<string, PMProjects> {
  // Pass 1: gather rows keyed by their raw (normalised-but-not-canonical) name.
  const byRawName = new Map<string, PMProject[]>();
  // The 'dashboard' workbook is the same spreadsheet as 'all-projects', so its
  // rows arrive twice under two source keys. Row uids are globally unique, so
  // keep the first sighting of each and drop the rest — otherwise every project
  // in that workbook is listed (and counted) double.
  const seenRows = new Set<string>();

  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (!sheet.rows.length) continue;
      if (NON_PROJECT_SHEETS.has(sheet.name.trim().toLowerCase())) continue;

      const pmKey = findKey(sheet.rows[0].cells, PM_KEYS);
      if (!pmKey) continue;

      const nameKey = findKey(sheet.rows[0].cells, NAME_KEYS);
      const category = sheet.name.trim();

      for (const row of sheet.rows) {
        if (row.hidden) continue;
        if (seenRows.has(row.uid)) continue;
        const pm = normalizePM(row.cells[pmKey]);
        if (!pm) continue;
        seenRows.add(row.uid);

        const rawTitle = nameKey == null ? '' : String(row.cells[nameKey] ?? '').trim();
        const list = byRawName.get(pm);
        const project: PMProject = {
          uid: row.uid,
          category,
          href: sum.source.href,
          sourceLabel: sum.source.label,
          title: rawTitle || 'Untitled project',
          cells: row.cells,
          headers: sheet.headers,
          sources: [{ category, href: sum.source.href, sourceLabel: sum.source.label }],
        };
        if (list) list.push(project); else byRawName.set(pm, [project]);
      }
    }
  }

  // Pass 2: fold the spelling variants together exactly as the leaderboard does.
  // Must be an array, not `byRawName.keys()` — buildPMCanonicalMap iterates its
  // argument twice, and a one-shot map iterator is empty by the second pass,
  // which silently returns an empty map and leaves every variant unfolded.
  const canon = buildPMCanonicalMap([...byRawName.keys()]);
  const out = new Map<string, PMProjects>();
  for (const [raw, projects] of byRawName) {
    const name = canon.get(raw) ?? raw;
    const entry = out.get(name);
    if (entry) entry.projects.push(...projects);
    else out.set(name, { name, total: 0, projects: [...projects] });
  }
  // Pass 3: fold the same project appearing on several tabs into one card.
  // Runs after the canonical fold so a PM's spelling variants are already one
  // bucket — otherwise 'Sibam' and 'Sibam Sinha' would each keep their own copy.
  for (const entry of out.values()) {
    entry.projects = mergeDuplicateProjects(entry.projects);
    entry.projects.sort(
      (a, b) => a.title.localeCompare(b.title) || a.category.localeCompare(b.category)
    );
    entry.total = entry.projects.length;
  }
  return out;
}

/**
 * Resolve a raw PM cell ('sibam', 'Pinak Chowdhury') to the canonical name used
 * as the key of `collectProjectsByPM`. Tables render raw sheet values, so they
 * need this to look a PM up; returns null when the cell is empty or unknown.
 */
export function resolvePMName(raw: unknown, index: Map<string, PMProjects>): string | null {
  const pm = normalizePM(raw);
  if (!pm) return null;
  if (index.has(pm)) return pm;
  // Fall back to the same fingerprint fold the aggregation uses, so a variant
  // spelling in one sheet still finds the canonical bucket.
  const canon = buildPMCanonicalMap([...index.keys(), pm]).get(pm);
  return canon && index.has(canon) ? canon : null;
}

/** Locate the Project Manager column in a set of sheet headers, if present. */
export function findPMHeader(headers: string[]): string | null {
  if (!headers.length) return null;
  const row = Object.fromEntries(headers.map(h => [h, ''])) as SheetRow;
  return findKey(row, PM_KEYS);
}

/**
 * Bucket a status tally using the canonical classifier.
 *
 * Takes the label→count map so callers that already built one (charts, filters)
 * can reuse it. `total` is the number of rows with a non-empty status, which is
 * deliberately *not* the same as Total Records — rows with a blank status cell
 * are real records but belong in no bucket.
 */
export function classifyStatuses(map: Map<string, number>): StatusCounts {
  const out: StatusCounts = {
    total: 0, progress: 0, live: 0, review: 0, hold: 0, done: 0, notStarted: 0, unknown: 0,
  };
  for (const [label, value] of map.entries()) {
    const bucket = classifyStatus(label);
    if (!bucket) continue;
    out.total += value;
    out[bucket] += value;
  }
  return out;
}

/**
 * Total project records on the dashboard: rows on project tabs, deduped by uid.
 *
 * Counts rows whether or not they carry a status, so it is always >= the sum of
 * the status buckets. The old version summed `sheet.rows.length` across every
 * tab, which double-counted the shared workbook and included server/notes tabs.
 */
export function countProjectRecords(summaries: PageSummary[]): number {
  const seen = new Set<string>();
  let count = 0;
  for (const sum of summaries) {
    if (!sum.data) continue;
    for (const sheet of sum.data.sheets) {
      if (NON_PROJECT_SHEETS.has(sheet.name.trim().toLowerCase())) continue;
      for (const row of sheet.rows) {
        if (row.hidden) continue;
        if (row.uid) {
          if (seen.has(row.uid)) continue;
          seen.add(row.uid);
        }
        count += 1;
      }
    }
  }
  return count;
}

/**
 * The tab inside the Live Projects workbook that holds delivered projects. The
 * workbook's other tabs are 'Ecommerce details' and 'Monthly live project
 * count' — a rollup and a reference table, both already in NON_PROJECT_SHEETS.
 */
const LIVE_DETAILS_SHEET = 'project complete details';

/**
 * Count of Live projects: the rows of the Live Projects workbook's
 * 'Project complete details' tab.
 *
 * Deliberately does not go through `collectStatusRows`/`classifyStatuses`.
 * Those sweep every workbook and bucket by status text, so any row reading
 * 'Deployed' or 'Delivered' in Marketing, Ongoing or Priority inflated this
 * card. The Live number is defined by the Live Projects sheet alone.
 *
 * A row counts once it has a project name — that tab has no status column, so
 * presence on it *is* the signal that a project went live. Requiring more (a
 * live date, a PM) would undercount: the PM column does not exist there, and
 * live-date blanks are backfill gaps, not evidence a project is not live.
 */
export function countLiveProjects(summaries: PageSummary[]): number {
  const sum = summaries.find(s => s.source.page === 'live-projects');
  if (!sum?.data) return 0;

  const seen = new Set<string>();
  let count = 0;

  for (const sheet of sum.data.sheets) {
    if (!sheet.rows.length) continue;
    if (sheet.name.trim().toLowerCase() !== LIVE_DETAILS_SHEET) continue;

    // Scan rows for the name header rather than trusting row 0, as
    // `collectStatusRows` does — a blank leading row would otherwise skip the tab.
    let nameKey: string | null = null;
    for (const row of sheet.rows) {
      nameKey = findKey(row.cells, NAME_KEYS);
      if (nameKey) break;
    }
    if (!nameKey) continue;

    for (const row of sheet.rows) {
      if (row.hidden) continue;
      if (row.uid) {
        if (seen.has(row.uid)) continue;
        seen.add(row.uid);
      }
      // Skip spacer/blank rows: a project row always carries a name.
      if (String(row.cells[nameKey] ?? '').trim().length === 0) continue;
      count += 1;
    }
  }
  return count;
}
