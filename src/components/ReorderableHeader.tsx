'use client';

import { useState, type DragEvent, type ReactNode } from 'react';

// Shared drag-and-drop + keyboard reordering for table column headers.
//
// One component serves both column kinds — synced sheet headers and custom
// fields — so a column moves the same way wherever it appears. The parent owns
// the ordering; this only reports "move index `from` to index `to`".
//
// Density rules the design here: these headers sit in a table with many columns,
// so the move buttons stay hidden until the header is hovered or holds focus.
// They remain in the DOM and focusable throughout (opacity, not conditional
// rendering) — tabbing to a control that isn't rendered yet is impossible, and
// keyboard users need the same reach as the mouse.

/** Drag payload key, namespaced so a drop can't be fed by an unrelated drag. */
const MIME = 'application/x-tracker-column';

type Props = {
  /** Position of this column within its own group. */
  index: number;
  /** Number of columns in the group, for bounds and screen-reader position. */
  count: number;
  /** Identifies the group so headers can't be dragged between kinds. */
  group: string;
  /** Human label, used in control tooltips and aria-labels. */
  label: string;
  onMove: (from: number, to: number) => void;
  className?: string;
  /** Header content: the label plus any per-kind extras (e.g. a delete button). */
  children: ReactNode;
};

export function ReorderableHeader({
  index, count, group, label, onMove, className = '', children,
}: Props) {
  const [dragging, setDragging] = useState(false);
  // Which edge the pending drop would land on, for the insertion indicator.
  const [dropEdge, setDropEdge] = useState<'left' | 'right' | null>(null);

  const payload = `${group}:${index}`;

  const parseDrag = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(MIME);
    if (!raw) return null;
    const sep = raw.lastIndexOf(':');
    if (raw.slice(0, sep) !== group) return null; // a different column group
    const from = Number(raw.slice(sep + 1));
    return Number.isInteger(from) ? from : null;
  };

  const onDragOver = (e: DragEvent) => {
    // Only claim the drop if it's our own group; otherwise let it fall through.
    if (!e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDropEdge(e.clientX - box.left < box.width / 2 ? 'left' : 'right');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const from = parseDrag(e);
    const edge = dropEdge;
    setDropEdge(null);
    if (from === null || from === index) return;
    // Dropping on the right half means "after this column". Removing the
    // dragged item first shifts everything past it down one, so only adjust
    // when the item is moving rightward.
    let to = edge === 'right' ? index + 1 : index;
    if (from < to) to -= 1;
    onMove(from, to);
  };

  const canPrev = index > 0;
  const canNext = index < count - 1;

  return (
    <th
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(MIME, payload);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => { setDragging(false); setDropEdge(null); }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropEdge(null)}
      onDrop={onDrop}
      aria-label={`${label}, column ${index + 1} of ${count}`}
      className={`group/col relative text-left font-semibold px-3 py-2 whitespace-nowrap border-b border-slate-200 cursor-grab active:cursor-grabbing transition-opacity ${dragging ? 'opacity-40' : ''} ${className}`}
    >
      {/* Insertion indicator: a rule on the edge the column would land against,
          which reads more precisely than highlighting the whole cell. */}
      {dropEdge && (
        <span
          aria-hidden
          className={`absolute inset-y-0 w-0.5 bg-indigo-500 ${dropEdge === 'left' ? 'left-0' : 'right-0'}`}
        />
      )}

      <span className="inline-flex items-center gap-1">
        {children}

        {/* Hidden until the column is hovered or a control inside takes focus.
            Keyed to the same `group/col` as the hover state: on Tailwind 3 the
            v4-only `has-[...]` variant compiles to nothing, so a keyboard user
            would tab to a permanently invisible button. */}
        <span className="inline-flex items-center opacity-0 group-hover/col:opacity-100 group-focus-within/col:opacity-100 transition-opacity motion-reduce:transition-none">
          <MoveButton
            direction="prev"
            disabled={!canPrev}
            label={`Move ${label} left`}
            onClick={() => onMove(index, index - 1)}
          />
          <MoveButton
            direction="next"
            disabled={!canNext}
            label={`Move ${label} right`}
            onClick={() => onMove(index, index + 1)}
          />
        </span>
      </span>
    </th>
  );
}

function MoveButton({
  direction, disabled, label, onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // disabled:opacity-0 rather than a visible dead control: at the ends of
      // the row a greyed arrow is noise, and the button keeps its footprint so
      // the header doesn't reflow as columns move.
      // slate-500 rather than the lighter slate-400 these icon buttons would
      // otherwise use: as a non-text control the glyph needs 3:1 against the
      // header fill, which slate-400 misses.
      className="p-0.5 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-0 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {direction === 'prev' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
